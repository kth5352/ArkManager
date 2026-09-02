import { BrowserWindow, MessageChannelMain, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'

// Owns the single mpv-hosting utility process for the whole app - spawned
// lazily on first use, restarted if it exits unexpectedly (e.g. a native
// crash - see today's feasibility spikes for the concrete crash-isolation
// proof this architecture is built on).
let child: UtilityProcess | null = null
let currentHostWindow: BrowserWindow | null = null
// Kept as a list rather than attached once to a single child: the child is
// respawned after an unexpected exit (that's the whole point of the crash
// isolation), and a listener attached only to the dead process would leave
// the app permanently deaf to state updates from its replacement.
const workerMessageListeners: Array<(msg: unknown) => void> = []

function ensureChild(): UtilityProcess {
  if (child) return child
  const proc = utilityProcess.fork(join(__dirname, 'mpvWorker.js'), [], { stdio: 'pipe' })
  proc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[mpv-worker] ${d}`))
  proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[mpv-worker] ${d}`))
  proc.on('exit', (code) => {
    console.error(`[mpvProcessManager] utility process exited unexpectedly, code=${code}`)
    if (child === proc) child = null
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

export function loadFile(filePath: string, width: number, height: number): void {
  const proc = ensureChild()
  proc.postMessage({ type: 'init', filePath, width, height })
}

export function loadNewFile(filePath: string): void {
  child?.postMessage({ type: 'load', filePath })
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
