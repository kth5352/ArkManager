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
  getTimePos: () => number | null
  getDuration: () => number | null
  getEofReached: () => boolean
  getHwdecCurrent: () => string
  pollEvent: () => { name: string } | null
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
// Whether the currently-loaded track has a video stream. Decided by the
// renderer (which already knows the track's media type) and handed down
// through `init`/`load`; gates whether the loop below renders frames at all.
let currentIsVideo = false

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
// no such enum members), keep-open=yes suppresses end-file at a natural EOF,
// and the addon never calls mpv_observe_property - so the `eof-reached`
// property has to be polled. It latches true at EOF and stays true, hence the
// false->true edge check rather than a bare `if (eof)`.
function checkEofReached(): void {
  const eof = addon.getEofReached()
  if (eof && !lastEofReached && isPlayingState) {
    isPlayingState = false
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
      // Pushes a fresh currentTime/duration snapshot roughly 4x/sec (every
      // 15th tick at 16ms) - mirrors the cadence the old DOM <video>'s
      // timeupdate event fired at. Without this, the renderer's displayed
      // time/seek-bar would only ever update at the discrete moments
      // pushStateUpdate is otherwise called (init/load/play/pause), never
      // during actual ongoing playback. Also the only place getDuration()
      // (null until mpv's async loadfile resolves - see Task 2's own
      // findings) ever gets re-checked after the first, likely-null push.
      stateTickCount++
      if (stateTickCount % 15 === 0) pushStateUpdate(isPlayingState)
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
    pushStateUpdate(isPlayingState)
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
    // Re-gates the loop: switching a video track for an audio one (or back)
    // has to start/stop frame rendering accordingly.
    restartRenderLoop()
    pushStateUpdate(true)
    return
  }

  if (msg.type === 'play') {
    addon.setPause(false)
    isPlayingState = true
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
    return
  }

  if (msg.type === 'set-volume') {
    addon.setVolume(msg.volume)
    return
  }

  if (msg.type === 'resize') {
    pendingWidth = msg.width
    pendingHeight = msg.height
    return
  }

  if (msg.type === 'shutdown') {
    if (renderInterval) clearInterval(renderInterval)
    addon.shutdown()
    process.parentPort.postMessage({ type: 'shutdown-ok' })
  }
})

log('mpv utility process worker started, addon loaded')
