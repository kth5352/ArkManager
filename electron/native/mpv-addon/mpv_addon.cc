// Dynamically loads libmpv-2.dll via LoadLibrary/GetProcAddress - the
// shipped mpv-dev SDK is mingw-built, so its libmpv.dll.a import lib is not
// MSVC-linkable (confirmed during today's feasibility spikes). One playback
// session exists per process (this addon is always loaded inside a
// dedicated Electron utilityProcess, one per app - see
// electron/main/media/mpvWorker.ts - so global state here is correct, not
// a shortcut).
#include <napi.h>
#include <windows.h>
#include <mpv/client.h>
#include <mpv/render.h>
#include <string>
#include <cstring>
#include <vector>

typedef mpv_handle *(*mpv_create_fn)(void);
typedef int (*mpv_initialize_fn)(mpv_handle *);
typedef int (*mpv_command_fn)(mpv_handle *, const char **);
typedef void (*mpv_terminate_destroy_fn)(mpv_handle *);
typedef mpv_event *(*mpv_wait_event_fn)(mpv_handle *, double);
typedef int (*mpv_set_option_string_fn)(mpv_handle *, const char *, const char *);
typedef int (*mpv_set_property_fn)(mpv_handle *, const char *, mpv_format, void *);
typedef int (*mpv_get_property_fn)(mpv_handle *, const char *, mpv_format, void *);
typedef int (*mpv_observe_property_fn)(mpv_handle *, uint64_t, const char *, mpv_format);
typedef int (*mpv_unobserve_property_fn)(mpv_handle *, uint64_t);
typedef void (*mpv_free_fn)(void *);
typedef const char *(*mpv_error_string_fn)(int);
typedef const char *(*mpv_event_name_fn)(mpv_event_id);
typedef int (*mpv_render_context_create_fn)(mpv_render_context **, mpv_handle *,
                                             mpv_render_param *);
typedef int (*mpv_render_context_render_fn)(mpv_render_context *, mpv_render_param *);
typedef void (*mpv_render_context_free_fn)(mpv_render_context *);

static HMODULE g_lib = nullptr;
static mpv_handle *g_ctx = nullptr;
static mpv_render_context *g_renderCtx = nullptr;
static std::vector<uint8_t> g_buffer;
static int g_width = 0;
static int g_height = 0;

// Read by the render-thread getters, refreshed only by PollEvent. Synchronous
// mpv_get_property on this thread can wait for the core while the core waits
// for us to render the post-seek frame (render.h's threading restriction).
static double g_timePos = 0;
static double g_duration = 0;
static bool g_hasTimePos = false;
static bool g_hasDuration = false;
static bool g_eofReached = false;
static uint64_t g_observationId = 0;

static mpv_create_fn g_p_create = nullptr;
static mpv_initialize_fn g_p_initialize = nullptr;
static mpv_command_fn g_p_command = nullptr;
static mpv_terminate_destroy_fn g_p_terminate_destroy = nullptr;
static mpv_wait_event_fn g_p_wait_event = nullptr;
static mpv_set_option_string_fn g_p_set_option_string = nullptr;
static mpv_set_property_fn g_p_set_property = nullptr;
static mpv_get_property_fn g_p_get_property = nullptr;
static mpv_observe_property_fn g_p_observe_property = nullptr;
static mpv_unobserve_property_fn g_p_unobserve_property = nullptr;
static mpv_free_fn g_p_free = nullptr;
static mpv_error_string_fn g_p_error_string = nullptr;
static mpv_event_name_fn g_p_event_name = nullptr;
static mpv_render_context_create_fn g_p_render_create = nullptr;
static mpv_render_context_render_fn g_p_render_render = nullptr;
static mpv_render_context_free_fn g_p_render_free = nullptr;

static bool LoadAllSymbols() {
  g_p_create = (mpv_create_fn)GetProcAddress(g_lib, "mpv_create");
  g_p_initialize = (mpv_initialize_fn)GetProcAddress(g_lib, "mpv_initialize");
  g_p_command = (mpv_command_fn)GetProcAddress(g_lib, "mpv_command");
  g_p_terminate_destroy = (mpv_terminate_destroy_fn)GetProcAddress(g_lib, "mpv_terminate_destroy");
  g_p_wait_event = (mpv_wait_event_fn)GetProcAddress(g_lib, "mpv_wait_event");
  g_p_set_option_string = (mpv_set_option_string_fn)GetProcAddress(g_lib, "mpv_set_option_string");
  g_p_set_property = (mpv_set_property_fn)GetProcAddress(g_lib, "mpv_set_property");
  g_p_get_property = (mpv_get_property_fn)GetProcAddress(g_lib, "mpv_get_property");
  g_p_observe_property = (mpv_observe_property_fn)GetProcAddress(g_lib, "mpv_observe_property");
  g_p_unobserve_property = (mpv_unobserve_property_fn)GetProcAddress(g_lib, "mpv_unobserve_property");
  g_p_free = (mpv_free_fn)GetProcAddress(g_lib, "mpv_free");
  g_p_error_string = (mpv_error_string_fn)GetProcAddress(g_lib, "mpv_error_string");
  g_p_event_name = (mpv_event_name_fn)GetProcAddress(g_lib, "mpv_event_name");
  g_p_render_create = (mpv_render_context_create_fn)GetProcAddress(g_lib, "mpv_render_context_create");
  g_p_render_render = (mpv_render_context_render_fn)GetProcAddress(g_lib, "mpv_render_context_render");
  g_p_render_free = (mpv_render_context_free_fn)GetProcAddress(g_lib, "mpv_render_context_free");
  return g_p_create && g_p_initialize && g_p_command && g_p_terminate_destroy &&
         g_p_wait_event && g_p_set_option_string && g_p_set_property && g_p_get_property &&
         g_p_observe_property && g_p_unobserve_property &&
         g_p_free && g_p_error_string && g_p_event_name &&
         g_p_render_create && g_p_render_render && g_p_render_free;
}

static void ResetPlaybackProperties() {
  if (g_ctx && g_observationId) g_p_unobserve_property(g_ctx, g_observationId);
  // Unobserving does not remove already queued notifications. A fresh ID
  // prevents the previous track's late time/duration/EOF from being applied.
  ++g_observationId;
  g_timePos = 0;
  g_duration = 0;
  g_hasTimePos = false;
  g_hasDuration = false;
  g_eofReached = false;
}

static int ObservePlaybackProperties() {
  ResetPlaybackProperties();
  int rc = g_p_observe_property(g_ctx, g_observationId, "time-pos", MPV_FORMAT_DOUBLE);
  if (rc < 0) return rc;
  rc = g_p_observe_property(g_ctx, g_observationId, "duration", MPV_FORMAT_DOUBLE);
  if (rc < 0) return rc;
  return g_p_observe_property(g_ctx, g_observationId, "eof-reached", MPV_FORMAT_FLAG);
}

static void UpdatePlaybackProperty(const mpv_event *event) {
  if (event->reply_userdata != g_observationId || !event->data) return;
  const auto *property = static_cast<const mpv_event_property *>(event->data);
  if (!property->name) return;
  if (std::strcmp(property->name, "time-pos") == 0) {
    g_hasTimePos = property->format == MPV_FORMAT_DOUBLE && property->data;
    if (g_hasTimePos) g_timePos = *static_cast<double *>(property->data);
  } else if (std::strcmp(property->name, "duration") == 0) {
    g_hasDuration = property->format == MPV_FORMAT_DOUBLE && property->data;
    if (g_hasDuration) g_duration = *static_cast<double *>(property->data);
  } else if (std::strcmp(property->name, "eof-reached") == 0) {
    g_eofReached = property->format == MPV_FORMAT_FLAG && property->data &&
                   *static_cast<int *>(property->data) != 0;
  }
}

static void ReallocBuffer(int width, int height) {
  g_width = width;
  g_height = height;
  size_t strideNeeded = (size_t)g_width * 4;
  size_t stride = ((strideNeeded + 63) / 64) * 64;
  g_buffer.assign(stride * (size_t)g_height, 0xFF);
}

Napi::String Init(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 3 || !info[0].IsString() || !info[1].IsNumber() || !info[2].IsNumber()) {
    return Napi::String::New(env, "ERROR expected (filePath, width, height, hwdecMode?)");
  }
  std::string filePath = info[0].As<Napi::String>().Utf8Value();
  int width = info[1].As<Napi::Number>().Int32Value();
  int height = info[2].As<Napi::Number>().Int32Value();
  std::string hwdecMode = "auto";
  if (info.Length() >= 4 && info[3].IsString()) {
    hwdecMode = info[3].As<Napi::String>().Utf8Value();
  }

  g_lib = LoadLibraryA("libmpv-2.dll");
  if (!g_lib) {
    char buf[128];
    snprintf(buf, sizeof(buf), "ERROR LoadLibraryA failed err=%lu", GetLastError());
    return Napi::String::New(env, buf);
  }
  if (!LoadAllSymbols()) {
    return Napi::String::New(env, "ERROR GetProcAddress failed for one or more mpv_* symbols");
  }

  g_ctx = g_p_create();
  if (!g_ctx) return Napi::String::New(env, "ERROR mpv_create returned NULL");

  g_p_set_option_string(g_ctx, "vo", "libmpv");
  g_p_set_option_string(g_ctx, "keep-open", "yes");
  g_p_set_option_string(g_ctx, "hwdec", hwdecMode.c_str());
  // libmpv's defaults (sub-auto=exact, sid=auto) would auto-load sidecar
  // subtitle files and auto-select embedded subtitle tracks, burning them into
  // the frames this addon renders. The app draws its own subtitle/lyric
  // overlay from the very same adjacent .ass/.vtt/.lrc files
  // (readAdjacentLyrics), so leaving mpv's defaults on shows every line twice.
  // The old Chromium <video> element rendered neither for a bare `src`, so
  // turning both off is what actually preserves the previous behavior.
  g_p_set_option_string(g_ctx, "sub-auto", "no");
  g_p_set_option_string(g_ctx, "sid", "no");
  // 5-band EQ (60/230/910/3000/14000 Hz), every band flat (0dB gain) at
  // session start. setEqualizerBandGain() below tweaks one band's gain in
  // place via af-command without ever touching this af string again -
  // confirmed empirically (.superpowers/spikes/eq-af-command/, gitignored
  // scratch) that doing so produces ZERO audio-reconfig/reinit events,
  // unlike resetting the whole af property, which does. af is a per-session
  // (not per-file) mpv setting, so this chain survives every loadFile call
  // automatically - no re-application needed on track change.
  g_p_set_option_string(g_ctx, "af",
      "@eq0:lavfi=[equalizer=f=60:width_type=h:width=50:g=0],"
      "@eq1:lavfi=[equalizer=f=230:width_type=h:width=100:g=0],"
      "@eq2:lavfi=[equalizer=f=910:width_type=h:width=400:g=0],"
      "@eq3:lavfi=[equalizer=f=3000:width_type=h:width=1000:g=0],"
      "@eq4:lavfi=[equalizer=f=14000:width_type=h:width=4000:g=0]");

  int rc = g_p_initialize(g_ctx);
  if (rc < 0) {
    std::string msg = std::string("ERROR mpv_initialize failed: ") + g_p_error_string(rc);
    g_p_terminate_destroy(g_ctx);
    g_ctx = nullptr;
    return Napi::String::New(env, msg);
  }

  char apiType[] = MPV_RENDER_API_TYPE_SW;
  mpv_render_param params[] = {
      {MPV_RENDER_PARAM_API_TYPE, (void *)apiType},
      {MPV_RENDER_PARAM_INVALID, nullptr},
  };
  rc = g_p_render_create(&g_renderCtx, g_ctx, params);
  if (rc < 0) {
    std::string msg = std::string("ERROR mpv_render_context_create failed: ") + g_p_error_string(rc);
    g_p_terminate_destroy(g_ctx);
    g_ctx = nullptr;
    return Napi::String::New(env, msg);
  }

  ResetPlaybackProperties();
  const char *cmd[] = {"loadfile", filePath.c_str(), NULL};
  rc = g_p_command(g_ctx, cmd);
  if (rc < 0) {
    std::string msg = std::string("ERROR loadfile failed: ") + g_p_error_string(rc);
    return Napi::String::New(env, msg);
  }

  ReallocBuffer(width, height);
  return Napi::String::New(env, "OK");
}

Napi::String LoadFile(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!g_ctx) return Napi::String::New(env, "ERROR not initialized");
  if (info.Length() < 1 || !info[0].IsString()) {
    return Napi::String::New(env, "ERROR expected filePath (string)");
  }
  std::string filePath = info[0].As<Napi::String>().Utf8Value();
  ResetPlaybackProperties();
  const char *cmd[] = {"loadfile", filePath.c_str(), NULL};
  int rc = g_p_command(g_ctx, cmd);
  if (rc < 0) {
    return Napi::String::New(env, std::string("ERROR loadfile failed: ") + g_p_error_string(rc));
  }
  return Napi::String::New(env, "OK");
}

Napi::Value RenderFrame(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!g_renderCtx) return env.Null();

  if (info.Length() >= 2 && info[0].IsNumber() && info[1].IsNumber()) {
    int newWidth = info[0].As<Napi::Number>().Int32Value();
    int newHeight = info[1].As<Napi::Number>().Int32Value();
    if (newWidth > 0 && newHeight > 0 && (newWidth != g_width || newHeight != g_height)) {
      ReallocBuffer(newWidth, newHeight);
    }
  }

  int size[2] = {g_width, g_height};
  char format[] = "rgb0";
  size_t strideNeeded = (size_t)g_width * 4;
  size_t stride = ((strideNeeded + 63) / 64) * 64;

  mpv_render_param params[] = {
      {MPV_RENDER_PARAM_SW_SIZE, size},
      {MPV_RENDER_PARAM_SW_FORMAT, format},
      {MPV_RENDER_PARAM_SW_STRIDE, &stride},
      {MPV_RENDER_PARAM_SW_POINTER, g_buffer.data()},
      {MPV_RENDER_PARAM_INVALID, nullptr},
  };
  int rc = g_p_render_render(g_renderCtx, params);
  if (rc < 0) return env.Null();

  // "rgb0" leaves the 4th byte unspecified per render.h - force full
  // opacity explicitly rather than trust it, since canvas ImageData treats
  // byte 4 as alpha and an unlucky 0 there would make the frame invisible.
  Napi::Buffer<uint8_t> out = Napi::Buffer<uint8_t>::New(env, (size_t)g_width * g_height * 4);
  uint8_t *dst = out.Data();
  for (int y = 0; y < g_height; y++) {
    const uint8_t *srcRow = g_buffer.data() + (size_t)y * stride;
    uint8_t *dstRow = dst + (size_t)y * g_width * 4;
    for (int x = 0; x < g_width; x++) {
      dstRow[x * 4 + 0] = srcRow[x * 4 + 0];
      dstRow[x * 4 + 1] = srcRow[x * 4 + 1];
      dstRow[x * 4 + 2] = srcRow[x * 4 + 2];
      dstRow[x * 4 + 3] = 255;
    }
  }
  return out;
}

Napi::String SetPause(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!g_ctx) return Napi::String::New(env, "ERROR not initialized");
  if (info.Length() < 1 || !info[0].IsBoolean()) {
    return Napi::String::New(env, "ERROR expected paused (boolean)");
  }
  int paused = info[0].As<Napi::Boolean>().Value() ? 1 : 0;
  int rc = g_p_set_property(g_ctx, "pause", MPV_FORMAT_FLAG, &paused);
  if (rc < 0) return Napi::String::New(env, std::string("ERROR set pause failed: ") + g_p_error_string(rc));
  return Napi::String::New(env, "OK");
}

Napi::String Seek(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!g_ctx) return Napi::String::New(env, "ERROR not initialized");
  if (info.Length() < 1 || !info[0].IsNumber()) {
    return Napi::String::New(env, "ERROR expected seconds (number)");
  }
  std::string seconds = std::to_string(info[0].As<Napi::Number>().DoubleValue());
  const char *cmd[] = {"seek", seconds.c_str(), "absolute", NULL};
  int rc = g_p_command(g_ctx, cmd);
  if (rc < 0) return Napi::String::New(env, std::string("ERROR seek failed: ") + g_p_error_string(rc));
  return Napi::String::New(env, "OK");
}

Napi::String SetVolume(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!g_ctx) return Napi::String::New(env, "ERROR not initialized");
  if (info.Length() < 1 || !info[0].IsNumber()) {
    return Napi::String::New(env, "ERROR expected volume 0.0-1.0 (number)");
  }
  double volume01 = info[0].As<Napi::Number>().DoubleValue();
  double mpvVolume = volume01 * 100.0;
  int rc = g_p_set_property(g_ctx, "volume", MPV_FORMAT_DOUBLE, &mpvVolume);
  if (rc < 0) return Napi::String::New(env, std::string("ERROR set volume failed: ") + g_p_error_string(rc));
  return Napi::String::New(env, "OK");
}

Napi::String SetEqualizerBandGain(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!g_ctx) return Napi::String::New(env, "ERROR not initialized");
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
    return Napi::String::New(env, "ERROR expected bandIndex, gainDb (numbers)");
  }
  int bandIndex = info[0].As<Napi::Number>().Int32Value();
  if (bandIndex < 0 || bandIndex > 4) {
    return Napi::String::New(env, "ERROR bandIndex must be 0-4");
  }
  double gainDb = info[1].As<Napi::Number>().DoubleValue();
  std::string label = "eq" + std::to_string(bandIndex);
  std::string gainStr = std::to_string(gainDb);
  // The trailing "equalizer" argument is mpv's own "target" parameter -
  // required to route the command into the specific ffmpeg filter instance
  // inside this label's lavfi graph. Omitting it produces a generic,
  // undiagnosable error (confirmed empirically during today's spike) - this
  // exact 5-argument shape must not be "simplified" by a future reader.
  const char *cmd[] = {"af-command", label.c_str(), "gain", gainStr.c_str(), "equalizer", NULL};
  int rc = g_p_command(g_ctx, cmd);
  if (rc < 0) {
    return Napi::String::New(env, std::string("ERROR af-command failed: ") + g_p_error_string(rc));
  }
  return Napi::String::New(env, "OK");
}

Napi::Value GetTimePos(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!g_ctx || !g_hasTimePos) return env.Null();
  return Napi::Number::New(env, g_timePos);
}

Napi::Value GetDuration(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!g_ctx || !g_hasDuration) return env.Null();
  return Napi::Number::New(env, g_duration);
}

// mpv is initialized with keep-open=yes (see Init() above), so reaching a
// file's natural end does NOT unload it and does NOT emit MPV_EVENT_END_FILE
// - and the deprecated MPV_EVENT_PAUSE/MPV_EVENT_UNPAUSE events were removed
// from libmpv in 0.33 (the bundled client.h is API 2.3 and has no such enum
// members). Observe `eof-reached`, which keep-open holds true until another
// file is loaded or the player seeks away from the end. PollEvent processes
// these notifications before the worker checks this cached value each tick.
Napi::Value GetEofReached(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!g_ctx) return Napi::Boolean::New(env, false);
  return Napi::Boolean::New(env, g_eofReached);
}

Napi::Value GetHwdecCurrent(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!g_ctx) return env.Null();
  char *value = nullptr;
  int rc = g_p_get_property(g_ctx, "hwdec-current", MPV_FORMAT_STRING, &value);
  if (rc < 0 || !value) return Napi::String::New(env, "");
  std::string result(value);
  g_p_free(value);
  return Napi::String::New(env, result);
}

Napi::Value PollEvent(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!g_ctx) return env.Null();
  mpv_event *ev = g_p_wait_event(g_ctx, 0.0);
  if (!ev || ev->event_id == MPV_EVENT_NONE) return env.Null();
  Napi::Object result = Napi::Object::New(env);
  result.Set("name", Napi::String::New(env, g_p_event_name(ev->event_id)));
  if (ev->event_id == MPV_EVENT_START_FILE) {
    ResetPlaybackProperties();
  } else if (ev->event_id == MPV_EVENT_FILE_LOADED) {
    // Subscribe only once the new file has loaded, so an initial snapshot
    // cannot describe the old file while loadfile is still asynchronous.
    int rc = ObservePlaybackProperties();
    if (rc < 0) {
      result.Set("error", Napi::String::New(env,
          std::string("ERROR observing playback state: ") + g_p_error_string(rc)));
    }
  } else if (ev->event_id == MPV_EVENT_PROPERTY_CHANGE) {
    UpdatePlaybackProperty(ev);
  }
  return result;
}

Napi::String Shutdown(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (g_ctx) ResetPlaybackProperties();
  if (g_renderCtx) {
    g_p_render_free(g_renderCtx);
    g_renderCtx = nullptr;
  }
  if (g_ctx) {
    g_p_terminate_destroy(g_ctx);
    g_ctx = nullptr;
  }
  if (g_lib) {
    FreeLibrary(g_lib);
    g_lib = nullptr;
  }
  g_buffer.clear();
  return Napi::String::New(env, "OK");
}

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
  exports.Set("init", Napi::Function::New(env, Init));
  exports.Set("loadFile", Napi::Function::New(env, LoadFile));
  exports.Set("renderFrame", Napi::Function::New(env, RenderFrame));
  exports.Set("setPause", Napi::Function::New(env, SetPause));
  exports.Set("seek", Napi::Function::New(env, Seek));
  exports.Set("setVolume", Napi::Function::New(env, SetVolume));
  exports.Set("setEqualizerBandGain", Napi::Function::New(env, SetEqualizerBandGain));
  exports.Set("getTimePos", Napi::Function::New(env, GetTimePos));
  exports.Set("getDuration", Napi::Function::New(env, GetDuration));
  exports.Set("getEofReached", Napi::Function::New(env, GetEofReached));
  exports.Set("getHwdecCurrent", Napi::Function::New(env, GetHwdecCurrent));
  exports.Set("pollEvent", Napi::Function::New(env, PollEvent));
  exports.Set("shutdown", Napi::Function::New(env, Shutdown));
  return exports;
}

NODE_API_MODULE(mpv_addon, InitModule)
