// Runs INSIDE a dedicated Electron utilityProcess (see mpvProcessManager.ts,
// which forks this file) - never imported directly by the main process.
// A crash in the native addon here only takes down this one process, not
// the whole app (concretely validated via a deliberate crash test in
// today's feasibility spikes).
import { join } from 'node:path'

// The addon loads libmpv-2.dll with a bare `LoadLibraryA("libmpv-2.dll")`,
// so Windows resolves it through the standard search order - which does NOT
// include the directory of the .node that called LoadLibrary, only the
// executable's own directory (electron.exe's) and PATH. The DLL lives next
// to the addon's .node build output, so that directory has to be on PATH
// *before* the require() below runs or init() fails with "ERROR
// LoadLibraryA failed err=126" (proven in Task 2's testing).
//
// This worker runs inside a utilityProcess, where Electron's `app` module
// (and therefore `app.isPackaged`/`process.resourcesPath`) is NOT available
// - so dev-vs-packaged addon directory resolution can't happen here. It's
// resolved once in the MAIN process instead (mpvProcessManager.ts's
// ensureChild(), which CAN call app.isPackaged) and handed to this process
// via an env var on utilityProcess.fork's `env` option.
const addonDir = process.env.MPV_ADDON_DIR
if (!addonDir) {
  throw new Error(
    'MPV_ADDON_DIR is not set - mpvProcessManager.ts must always pass it when forking this worker'
  )
}
process.env.PATH = `${addonDir};${process.env.PATH ?? ''}`

// eslint-disable-next-line @typescript-eslint/no-require-imports -- native addon, not a TS-importable module
const addon = require(join(addonDir, 'build/Release/mpv_addon.node')) as {
  init: (filePath: string, width: number, height: number, hwdecMode?: string) => string
  loadFile: (filePath: string) => string
  renderFrame: (width?: number, height?: number) => Buffer | null
  setPause: (paused: boolean) => string
  seek: (seconds: number) => string
  setVolume: (volume: number) => string
  setEqualizerBandGain: (bandIndex: number, gainDb: number) => string
  getTimePos: () => number | null
  getDuration: () => number | null
  getEofReached: () => boolean
  getHwdecCurrent: () => string
  pollEvent: () => { name: string; error?: string } | null
  shutdown: () => string
}

type WorkerMessage =
  | { type: 'port' }
  | { type: 'init'; filePath: string; width: number; height: number; isVideo: boolean }
  | { type: 'load'; filePath: string; isVideo: boolean }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; seconds: number }
  | { type: 'set-volume'; volume: number }
  | { type: 'set-eq-band'; bandIndex: number; gainDb: number }
  | { type: 'resize'; width: number; height: number }
  | { type: 'shutdown' }

let renderPort: Electron.MessagePortMain | null = null
let renderInterval: NodeJS.Timeout | null = null
let pendingWidth = 0
let pendingHeight = 0
let currentWidth = 0
let currentHeight = 0
// Tracked here (not queried from the addon - it exports no isPaused/
// getPause getter) so the periodic state push below always reports the
// worker's own last-commanded play/pause intent.
let isPlayingState = false
let stateTickCount = 0
// Last sampled value of mpv's `eof-reached` property, so the poll below can
// fire "ended" once on the false->true edge instead of on every tick that
// follows it (keep-open=yes leaves the property true indefinitely at EOF).
let lastEofReached = false
// Set true the instant checkEofReached() detects a track finishing, cleared
// by whichever message next actually restarts real playback ('init', 'load',
// or 'play' - repeat-one resumes the SAME loop via 'play' without ever going
// through 'load', see that handler). While true, the periodic loop's own
// state-update push (unconditional every tick for audio, every 15th tick for
// video - see restartRenderLoop) is skipped instead of firing.
//
// Exists because the renderer's reaction to 'ended' (auto-advance's next(),
// or repeat-one's seek+play) is itself async - it round-trips through at
// least one IPC hop before the NEXT track's 'load' (or repeat-one's 'play')
// reaches this worker and pushes the real, settled state. Left unguarded,
// this loop keeps ticking on the OLD track's now-meaningless state in that
// gap and would push one or more further isPlaying:false updates that are
// stale by the time they arrive - interleaving unpredictably with the next
// track's own immediate `pushStateUpdate(true)` in the renderer and
// flickering the play/pause button several times before settling (confirmed
// by tracing the exact message order - see mpvWorker.ts's git history / the
// bug report this fix addresses). Nothing downstream actually needs that
// stale push: the auto-advance and repeat-one paths never observe isPlaying
// turn false at all (the store already believes it's still true, correctly,
// throughout the gap), and the one path where it genuinely SHOULD go false
// (repeat-off, last track) sets it directly in the renderer's own store
// (mediaPlayerStore.ts's `next()`), independent of any push from here.
let suppressPeriodicStateUpdates = false
// Whether the currently-loaded track has a video stream. Decided by the
// renderer (which already knows the track's media type) and handed down
// through `init`/`load`; gates whether the loop below renders frames at all.
let currentIsVideo = false
// Date.now() deadline until which the video loop keeps rendering even while
// PAUSED. Rendering is otherwise gated on isPlayingState (identical frames are
// pure wasted work), but a seek or a resize while paused genuinely changes what
// the canvas should show - without this the displayed time would move while the
// picture stayed frozen at the pre-seek frame until the user pressed play, and
// a resize would leave a stale, wrong-resolution frame on screen. 0 means "not
// needed": every real Date.now() is > 0, so `Date.now() < needsRenderUntil` is
// naturally false then.
let needsRenderUntil = 0
// How long that paused-render burst lasts. Sized from real measurement, not
// guessed: forking the built worker as a real utilityProcess and timing 8
// paused seeks on a 640x360 local file, the correct post-seek frame first
// appeared 235-410ms after the seek was issued (mpv's seek is async, and
// renderFrame returns the PRE-seek picture - byte-identical - for the first
// ~2 ticks in 7 of those 8 runs, so a single immediate render is definitively
// not enough). A 300ms window already missed the settled frame in 2 of 8 runs
// on that easy case; 4K content on a slower disk has more headroom to lose,
// hence 1s. The cost is bounded and only paid on an actual seek/resize: ~60
// renders once, never the perpetual paused burn that gating on isPlayingState
// exists to prevent.
const PAUSED_RENDER_BURST_MS = 1000

function log(msg: string): void {
  process.parentPort.postMessage({ type: 'log', msg })
}

function pushStateUpdate(isPlaying: boolean): void {
  process.parentPort.postMessage({
    type: 'state-update',
    isPlaying,
    currentTime: addon.getTimePos() ?? 0,
    duration: addon.getDuration(),
    error: null,
  })
}

function pollAndForwardEvents(): void {
  // Drain every pending event this tick, not just one - render() calls
  // block on nothing here (0-second wait_event timeout inside pollEvent),
  // so multiple events can genuinely queue up between two setInterval
  // ticks under load.
  for (;;) {
    const ev = addon.pollEvent()
    if (!ev) return
    if (ev.error) {
      process.parentPort.postMessage({
        type: 'state-update',
        isPlaying: isPlayingState,
        currentTime: addon.getTimePos() ?? 0,
        duration: addon.getDuration(),
        error: ev.error,
      })
    }
    // Only 'end-file'/'file-loaded' are logged: they're real, current
    // libmpv events. Deliberately NOT keyed on for end-of-track detection -
    // keep-open=yes means a file reaching its natural end is never unloaded,
    // so 'end-file' only fires for player-initiated unloads (e.g. loadfile
    // replacing the current track, reason 'stop'). See checkEofReached().
    if (ev.name === 'end-file' || ev.name === 'file-loaded') {
      log(`mpv event: ${ev.name}`)
    }
  }
}

// Detects a track finishing on its own, which is what drives auto-advance and
// repeat-one in the renderer. There is no event for this: libmpv 0.33+ removed
// the deprecated pause/unpause events (the bundled client.h is API 2.3 and has
// no such enum members), and keep-open=yes suppresses end-file at a natural
// EOF. PollEvent refreshes the addon's observed `eof-reached` snapshot before
// this check; reading the snapshot never waits on mpv's rendering core.
// It latches true at EOF, hence the false->true edge check.
function checkEofReached(): void {
  const eof = addon.getEofReached()
  if (eof && !lastEofReached && isPlayingState) {
    isPlayingState = false
    // Deliberately does NOT push a state-update here too (unlike every other
    // isPlayingState transition in this file) - see suppressPeriodicStateUpdates'
    // own comment for why no consumer actually needs one at this exact instant.
    suppressPeriodicStateUpdates = true
    process.parentPort.postMessage({ type: 'ended' })
  }
  lastEofReached = eof
}

// (Re)starts the playback-time loop for the track that was just loaded,
// clearing any loop left over from a previous track first - `init` and
// `load` both need exactly this, and switching between a video track and an
// audio track (in either direction) has to swap which of the two loops runs.
function restartRenderLoop(): void {
  if (renderInterval) clearInterval(renderInterval)
  stateTickCount = 0
  if (currentIsVideo) {
    renderInterval = setInterval(() => {
      pollAndForwardEvents()
      checkEofReached()
      // Render/post only while actually playing. A paused track (or one parked
      // at EOF) produces byte-identical frames, so rendering + copying +
      // transferring them ~60x/sec is pure wasted CPU/GPU that would otherwise
      // continue until the app quits. The interval itself keeps running rather
      // than being cleared, so rendering resumes on the very next tick once
      // 'play'/'load' flips isPlayingState back to true - and the two polls
      // above stay unconditional (they're cheap, and checkEofReached still
      // needs to observe a genuine end-of-file after a resume). The
      // needsRenderUntil escape hatch covers the one case where a PAUSED track
      // does need new frames: a seek or a resize (see the handlers below).
      if (isPlayingState || Date.now() < needsRenderUntil) {
        const buf = addon.renderFrame(pendingWidth, pendingHeight)
        currentWidth = pendingWidth
        currentHeight = pendingHeight
        if (buf && renderPort) {
          // ArrayBuffer.prototype.slice() always allocates a fresh buffer of
          // EXACTLY the requested length - required here, not just tidy: small
          // Buffers (the size this addon returns once a resize clamps render
          // dimensions down, e.g. while the canvas is hidden/minimized) are
          // frequently views into Node's shared buffer pool, so `buf.buffer`
          // alone can be the pool's full backing ArrayBuffer, not a
          // byteLength-sized one - transferring that whole oversized buffer
          // made the renderer's `new ImageData(bytes, width, height)` throw
          // "input data length is not equal to 4*width*height" (confirmed via
          // live testing: reproduced consistently on minimize/re-expand,
          // where the ResizeObserver's hidden-container 0x0 reading clamps
          // the render request down to computeMpvRenderSize's 2x2 floor).
          const copy = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
          renderPort.postMessage({
            frame: copy,
            byteLength: buf.length,
            width: currentWidth,
            height: currentHeight,
          })
        }
      }
      // Pushes a fresh currentTime/duration snapshot roughly 4x/sec (every
      // 15th tick at 16ms) - mirrors the cadence the old DOM <video>'s
      // timeupdate event fired at. Without this, the renderer's displayed
      // time/seek-bar would only ever update at the discrete moments
      // pushStateUpdate is otherwise called (init/load/play/pause), never
      // during actual ongoing playback. These getters read snapshots updated
      // by pollAndForwardEvents; they must not synchronously query mpv on the
      // rendering thread, which stalls post-seek rendering until a timeout.
      stateTickCount++
      // See suppressPeriodicStateUpdates' own comment: skipped while true so
      // this doesn't re-assert the old track's now-stale isPlaying state into
      // the gap between 'ended' and the next real transition.
      if (stateTickCount % 15 === 0 && !suppressPeriodicStateUpdates)
        pushStateUpdate(isPlayingState)
    }, 16)
    return
  }
  // Audio-only: still poll mpv's event queue (so end-file/file-loaded keep
  // being observed) and still push state, but skip the frame render/post
  // entirely - that's the whole point of the isVideo gate. 250ms is the same
  // ~4x/sec state cadence as the video branch's every-15th-tick push, so no
  // separate tick counter is needed here.
  renderInterval = setInterval(() => {
    pollAndForwardEvents()
    checkEofReached()
    // See suppressPeriodicStateUpdates' own comment. This branch's push is
    // unconditional (every tick, not gated on a tick count like the video
    // branch above), which without this guard made the flicker bug 100%
    // reproducible for audio-only tracks: this line would otherwise fire
    // isPlaying:false on the SAME tick checkEofReached just detected EOF on,
    // then again every 250ms after, until the next track's 'load' arrives.
    if (!suppressPeriodicStateUpdates) pushStateUpdate(isPlayingState)
  }, 250)
}

process.parentPort.on('message', (e) => {
  const msg = e.data as WorkerMessage

  if (msg.type === 'port' && e.ports && e.ports[0]) {
    renderPort = e.ports[0]
    renderPort.start()
    log('render port received and started')
    return
  }

  if (msg.type === 'init') {
    currentWidth = msg.width
    currentHeight = msg.height
    pendingWidth = msg.width
    pendingHeight = msg.height
    currentIsVideo = msg.isVideo
    const result = addon.init(msg.filePath, currentWidth, currentHeight)
    log(`init result: ${result}`)
    if (result !== 'OK') {
      process.parentPort.postMessage({ type: 'init-failed', result })
      return
    }
    isPlayingState = true
    lastEofReached = false
    suppressPeriodicStateUpdates = false
    restartRenderLoop()
    process.parentPort.postMessage({ type: 'init-ok' })
    pushStateUpdate(true)
    return
  }

  if (msg.type === 'load') {
    currentIsVideo = msg.isVideo
    const result = addon.loadFile(msg.filePath)
    log(`loadFile result: ${result}`)
    if (result !== 'OK') {
      // Stop the previous track's loop too - it would otherwise keep
      // rendering/reporting the file that just got replaced.
      if (renderInterval) {
        clearInterval(renderInterval)
        renderInterval = null
      }
      isPlayingState = false
      // Belt-and-suspenders, not load-bearing: renderInterval is already
      // null'd above, so nothing would consult this flag until some future
      // init/load/play recreates the loop and clears it again anyway. Reset
      // here purely so this flag never carries a stale `true` value across
      // an unrelated later run for someone reading/debugging worker state.
      suppressPeriodicStateUpdates = false
      process.parentPort.postMessage({
        type: 'state-update',
        isPlaying: false,
        currentTime: 0,
        duration: null,
        error: result,
      })
      return
    }
    // mpv's `pause` property is global, not per-file, and loadfile does not
    // reset it - so a track that ran to its end (leaving mpv paused at EOF
    // thanks to keep-open=yes) would hand its paused state to the next track,
    // which would then sit silently while the JS side believed it was playing.
    addon.setPause(false)
    isPlayingState = true
    // A fresh file starts before its own EOF, so clear the latch - otherwise
    // replaying a track that already reached the end would leave the edge
    // detector stuck true and never report a second natural finish.
    lastEofReached = false
    // The new track's own loop (started by restartRenderLoop below) is about
    // to push its real, settled isPlaying:true state - un-suppress so it
    // actually gets through if the periodic push fires before this line's
    // own explicit pushStateUpdate(true) does.
    suppressPeriodicStateUpdates = false
    // Re-gates the loop: switching a video track for an audio one (or back)
    // has to start/stop frame rendering accordingly.
    restartRenderLoop()
    pushStateUpdate(true)
    return
  }

  if (msg.type === 'play') {
    // Pressing play on a track parked at its own end: keep-open=yes leaves
    // mpv sitting AT eof with nothing left to decode, so a bare setPause(false)
    // would report playing forever while producing no audio and no new frames.
    // Seeking back to 0 first mirrors both the old DOM <video>'s spec'd
    // behavior (.play() on an ended element restarts from the beginning) and
    // the repeat-one loop-in-place path in useMediaPlayback.ts's onEnded.
    // Deliberately does NOT clear lastEofReached here (unlike the 'load'
    // handler): mpv's seek is asynchronous, so eof-reached can still sample
    // true on the next tick or two, and re-arming the edge detector now would
    // make checkEofReached fire a spurious 'ended' for a track that just
    // restarted. Leaving the latch set costs nothing - it falls to false on
    // its own as soon as the seek lands, which re-arms detection in time for
    // this playthrough's real ending.
    if (addon.getEofReached()) addon.seek(0)
    addon.setPause(false)
    isPlayingState = true
    // Repeat-one's resume-in-place is the one case that reaches here WITHOUT
    // ever going through 'load' (same track, no re-init) - this is the only
    // place that transition's own suppression (set by checkEofReached when
    // the track first ended) ever gets cleared, letting the still-running
    // loop's periodic pushes resume reporting this track's real state.
    suppressPeriodicStateUpdates = false
    pushStateUpdate(true)
    return
  }

  if (msg.type === 'pause') {
    addon.setPause(true)
    isPlayingState = false
    pushStateUpdate(false)
    return
  }

  if (msg.type === 'seek') {
    addon.seek(msg.seconds)
    // Seeking a PAUSED video has to repaint the canvas at the new position -
    // the old DOM <video> did, and the render loop otherwise skips paused
    // ticks entirely. mpv's seek is asynchronous, so a single immediate render
    // could still capture the pre-seek frame; the burst window gives the seek
    // time to land and produce the real post-seek picture (see
    // PAUSED_RENDER_BURST_MS for the measured latencies behind its size).
    // Harmless while actually playing - rendering is unconditional then anyway.
    needsRenderUntil = Date.now() + PAUSED_RENDER_BURST_MS
    return
  }

  if (msg.type === 'set-volume') {
    addon.setVolume(msg.volume)
    return
  }

  if (msg.type === 'set-eq-band') {
    addon.setEqualizerBandGain(msg.bandIndex, msg.gainDb)
    return
  }

  if (msg.type === 'resize') {
    pendingWidth = msg.width
    pendingHeight = msg.height
    // Same reason as 'seek': a resize while paused must produce at least one
    // correctly-sized frame instead of leaving the old, wrong-resolution one
    // stretched on the canvas.
    needsRenderUntil = Date.now() + PAUSED_RENDER_BURST_MS
    return
  }

  if (msg.type === 'shutdown') {
    if (renderInterval) clearInterval(renderInterval)
    addon.shutdown()
    process.parentPort.postMessage({ type: 'shutdown-ok' })
  }
})

log('mpv utility process worker started, addon loaded')
