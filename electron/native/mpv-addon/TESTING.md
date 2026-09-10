# Native playback regression checks (Windows)

These opt-in checks load the real addon and bundled libmpv DLL. They do not
modify input media, the app database, or preferences. Playback is muted.
Run from the repository root after `npm run build:mpv-addon`, on an idle machine.
They are separate from Vitest because native playback timing requires Windows,
the bundled DLL, and real media fixtures.

```powershell
node electron/native/mpv-addon/seek-latency.cjs 'C:\media\video.mp4'
node electron/native/mpv-addon/playback-state.cjs 'C:\media\video.mp4' 'C:\media\audio.wav'
```

Use a changing video at least 25 seconds long. The optional audio file must be
at least 2 seconds long. Short generated fixtures work well for the lifecycle
check; use the affected real file for the latency check. Both force software
decoding for a repeatable baseline, while the app retains its existing decoder
configuration. Do not run timing checks concurrently with a build or other
heavy work.

- `seek-latency.cjs`: six seeks, real frame rendering, available duration and
  position, and state reads under 100ms. Prints seek-to-`playback-restart`
  latencies. This measures native playback, not the full UI-to-screen delay.
- `playback-state.cjs`: paused seek/repaint within the worker's 1-second render
  window, paused position stability, resume, natural EOF, repeat after EOF,
  reload with cleared snapshots, shutdown/reinit, and (when audio is supplied)
  audio-only state/EOF polling without rendering and switching back to video.

Regression: synchronous `mpv_get_property` calls on the same thread servicing
`mpv_render_context_render` can block until mpv's render wait times out (see
the bundled `mpv-dev/include/mpv/render.h`, "Threading" section). Playback
getters must read snapshots refreshed by `pollEvent()` property observations.
Callers must drain events regularly, including while paused and for audio-only
playback. Observations are re-established after `file-loaded`; a new observation
ID prevents queued notifications from an older subscription restoring stale
position, duration, or EOF after loading another file.
