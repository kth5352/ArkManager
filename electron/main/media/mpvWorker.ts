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
    if (
      ev.name === 'end-file' ||
      ev.name === 'file-loaded' ||
      ev.name === 'pause' ||
      ev.name === 'unpause'
    ) {
      log(`mpv event: ${ev.name}`)
    }
  }
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
      const buf = addon.renderFrame(pendingWidth, pendingHeight)
      currentWidth = pendingWidth
      currentHeight = pendingHeight
      if (buf && renderPort) {
        const copy = Buffer.from(buf).buffer
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
    isPlayingState = true
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
