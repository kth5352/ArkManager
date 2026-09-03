import { app, BrowserWindow, MessageChannelMain, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'

// Owns the single mpv-hosting utility process for the whole app - spawned
// lazily on first use, restarted if it exits unexpectedly (e.g. a native
// crash - see today's feasibility spikes for the concrete crash-isolation
// proof this architecture is built on).
let child: UtilityProcess | null = null
let currentHostWindow: BrowserWindow | null = null
// Whether the CURRENT child process has already had `{type: 'init'}` sent to
// it. `init` does a fresh LoadLibraryA/mpv_create/mpv_render_context_create
// (no re-entrancy guard in the native addon - see mpv_addon.cc's Init()) and
// starts a new render-loop setInterval without clearing any existing one, so
// it must only ever be sent once per child; subsequent loads must use the
// lighter-weight `{type: 'load'}` message instead. Reset to false whenever a
// NEW child is spawned - a freshly-spawned process's native addon has no
// state, so it genuinely needs a fresh init, not a load.
let hasInitializedCurrentChild = false
// Kept as a list rather than attached once to a single child: the child is
// respawned after an unexpected exit (that's the whole point of the crash
// isolation), and a listener attached only to the dead process would leave
// the app permanently deaf to state updates from its replacement.
const workerMessageListeners: Array<(msg: unknown) => void> = []

// Resolves the native addon's directory for the CURRENT run mode. This has
// to happen here, not in mpvWorker.ts - that file runs inside a
// utilityProcess, where Electron's `app` module (and app.isPackaged /
// process.resourcesPath) isn't available. In dev, __dirname is the compiled
// output directory electron-vite bundles this file into (out/main, same as
// mpvWorker.js sitting right next to it), so '../../electron/native/mpv-addon'
// from there resolves to the project root's electron/native/mpv-addon - this
// mirrors mpvWorker.ts's own pre-existing (and proven-working in dev) path
// math, just computed on this side now. In a packaged build, the addon's
// build output and DLL are copied via electron-builder's `extraResources`
// (see package.json) into resources/mpv-addon/, which process.resourcesPath
// points at directly.
function resolveAddonDir(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'mpv-addon')
  return join(__dirname, '../../electron/native/mpv-addon')
}

function ensureChild(): UtilityProcess {
  if (child) return child
  const addonDir = resolveAddonDir()
  const proc = utilityProcess.fork(join(__dirname, 'mpvWorker.js'), [], {
    stdio: 'pipe',
    env: { ...process.env, MPV_ADDON_DIR: addonDir },
  })
  hasInitializedCurrentChild = false
  proc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[mpv-worker] ${d}`))
  proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[mpv-worker] ${d}`))
  proc.on('exit', (code) => {
    console.error(`[mpvProcessManager] utility process exited unexpectedly, code=${code}`)
    if (child === proc) {
      child = null
      hasInitializedCurrentChild = false
    }
  })
  for (const listener of workerMessageListeners) proc.on('message', listener)
  child = proc
  return proc
}

// Connects the utility process's frame output directly to `win`'s renderer
// via a transferred MessagePort - the main process only relays this ONE
// port handoff, never per-frame data (validated in spikes: this is what
// keeps CPU low even at 60fps).
export function setHostWindow(win: BrowserWindow): void {
  currentHostWindow = win
  const proc = ensureChild()
  const { port1, port2 } = new MessageChannelMain()
  proc.postMessage({ type: 'port' }, [port1])
  win.webContents.postMessage('mpv-frame-port', {}, [port2])
}

export function getCurrentHostWindow(): BrowserWindow | null {
  return currentHostWindow
}

// Decides between `init` (first call for the current child) and the
// lighter-weight `load` (every call after that) - see
// `hasInitializedCurrentChild` above for why this distinction matters.
export function loadFile(filePath: string, width: number, height: number, isVideo: boolean): void {
  const proc = ensureChild()
  if (hasInitializedCurrentChild) {
    proc.postMessage({ type: 'load', filePath, isVideo })
    return
  }
  proc.postMessage({ type: 'init', filePath, width, height, isVideo })
  hasInitializedCurrentChild = true
}

export function play(): void {
  child?.postMessage({ type: 'play' })
}

export function pause(): void {
  child?.postMessage({ type: 'pause' })
}

export function seek(seconds: number): void {
  child?.postMessage({ type: 'seek', seconds })
}

export function setVolume(volume: number): void {
  child?.postMessage({ type: 'set-volume', volume })
}

export function resize(width: number, height: number): void {
  child?.postMessage({ type: 'resize', width, height })
}

// Registering a listener must NOT itself spawn the process - this is called
// once at app startup from registerMpvHandlers, long before anything is
// actually played, and the child is meant to be spawned lazily on first use.
export function onWorkerMessage(callback: (msg: unknown) => void): void {
  workerMessageListeners.push(callback)
  child?.on('message', callback)
}

export function shutdown(): void {
  child?.postMessage({ type: 'shutdown' })
}
