import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import {
  MPV_PREVIEW_FRAME_HEIGHT,
  MPV_PREVIEW_FRAME_WIDTH,
  type MpvPreviewFrame,
  type MpvPreviewFrameRequest,
} from '../../../shared/types/ipc'
import * as mpv from './mpvProcessManager'
import type { PreviewWorkerRequest, PreviewWorkerResponse } from './mpvPreviewSession'
import { createPreviewQueue } from './previewQueue'

// Owns the scene-preview utility process (spec §4.5): a second, independent
// mpv session hosted by the same native addon in its own process
// (mpvPreviewWorker.ts), so a native crash there never touches playback.
//
// Trust boundary: the preview only ever opens the file the MAIN mpv already
// has loaded (mpvProcessManager's currentLoadedPath - resolved and checked
// against the library/trust boundary by MPV_LOAD). The renderer's request
// carries no path at all.

const FRAME_BYTES = MPV_PREVIEW_FRAME_WIDTH * MPV_PREVIEW_FRAME_HEIGHT * 4
// No preview request for this long -> stop the worker to give its memory back.
const IDLE_SHUTDOWN_MS = 60_000
// This many unexpected exits within the window -> previews stay off for the run.
const CRASH_LIMIT = 3
const CRASH_WINDOW_MS = 60_000
// The worker answers every job itself within ~3.8s (3s load + 0.8s seek
// timeouts in mpvPreviewSession.ts). Past this, a native call is hung: kill
// the process (counted as a crash) so the queue cannot stall forever.
const JOB_TIMEOUT_MS = 6_000
// Grace period for a worker told to shut down before it is killed.
const SHUTDOWN_GRACE_MS = 2_000

interface PreviewJob {
  seconds: number
  generation: number
  path: string
}

let child: UtilityProcess | null = null
// Children whose exit was asked for (idle/app shutdown) - not crashes.
const expectedExits = new WeakSet<UtilityProcess>()
const pendingJobs = new Map<
  number,
  { proc: UtilityProcess; resolve: (data: Uint8Array | null) => void }
>()
let nextJobId = 1
let idleTimer: NodeJS.Timeout | null = null
let crashTimes: number[] = []
let disabled = false

const queue = createPreviewQueue<PreviewJob, Uint8Array | null>(runJob)

// Is `generation` still the main mpv's current load, and is that a video?
function isCurrentVideo(generation: number): boolean {
  const state = mpv.getLoadState()
  return state.generation === generation && state.isVideo && mpv.getCurrentLoadedPath() !== null
}

function recordCrash(): void {
  const now = Date.now()
  crashTimes = crashTimes.filter((t) => now - t < CRASH_WINDOW_MS)
  crashTimes.push(now)
  if (crashTimes.length >= CRASH_LIMIT) {
    disabled = true
    console.error('[mpvPreviewManager] preview worker crashed repeatedly - previews disabled')
  }
}

function stopChild(proc: UtilityProcess): void {
  expectedExits.add(proc)
  if (child === proc) child = null
  proc.postMessage({ type: 'shutdown' } satisfies PreviewWorkerRequest)
  setTimeout(() => proc.kill(), SHUTDOWN_GRACE_MS)
}

function handleMessage(msg: PreviewWorkerResponse): void {
  if (msg.type === 'log') {
    console.log(`[mpv-preview-worker] ${msg.msg}`)
    return
  }
  if (msg.type !== 'frame-result') return
  const job = pendingJobs.get(msg.id)
  if (!job) return
  pendingJobs.delete(msg.id)
  const data = msg.data instanceof Uint8Array && msg.data.length === FRAME_BYTES ? msg.data : null
  job.resolve(data)
}

function ensureChild(): UtilityProcess {
  if (child) return child
  const proc = utilityProcess.fork(join(__dirname, 'mpvPreviewWorker.js'), [], {
    stdio: 'pipe',
    env: { ...process.env, MPV_ADDON_DIR: mpv.resolveAddonDir() },
  })
  proc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[mpv-preview-worker] ${d}`))
  proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[mpv-preview-worker] ${d}`))
  proc.on('message', (msg: PreviewWorkerResponse) => handleMessage(msg))
  proc.on('exit', (code) => {
    if (child === proc) child = null
    for (const [id, job] of pendingJobs) {
      if (job.proc !== proc) continue
      pendingJobs.delete(id)
      job.resolve(null)
    }
    if (expectedExits.has(proc)) return
    console.error(`[mpvPreviewManager] preview worker exited unexpectedly, code=${code}`)
    recordCrash()
  })
  child = proc
  return proc
}

function touchIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    if (child) stopChild(child)
  }, IDLE_SHUTDOWN_MS)
}

function runJob(job: PreviewJob): Promise<Uint8Array | null> {
  // The job may have waited behind another one: re-check before working.
  if (disabled || !isCurrentVideo(job.generation)) return Promise.resolve(null)
  const proc = ensureChild()
  const id = nextJobId++
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!pendingJobs.delete(id)) return
      console.error('[mpvPreviewManager] preview worker did not answer - killing it')
      // Detach the hung process now so the next job forks a fresh worker
      // instead of being posted to one that is about to die. The hang is
      // counted as a crash here, once; marking the exit as expected keeps the
      // later `exit` event from counting it again.
      if (child === proc) child = null
      expectedExits.add(proc)
      recordCrash()
      proc.kill()
      resolve(null)
    }, JOB_TIMEOUT_MS)
    pendingJobs.set(id, {
      proc,
      resolve: (data) => {
        clearTimeout(timer)
        resolve(data)
      },
    })
    proc.postMessage({
      type: 'frame',
      id,
      seconds: job.seconds,
      path: job.path,
    } satisfies PreviewWorkerRequest)
  })
}

export async function requestPreviewFrame(
  request: MpvPreviewFrameRequest
): Promise<MpvPreviewFrame | null> {
  const { seconds, generation, requestId } = request
  if (disabled || !isCurrentVideo(generation)) return null
  const path = mpv.getCurrentLoadedPath()
  if (!path) return null
  touchIdleTimer()
  const data = await queue.enqueue({ seconds, generation, path })
  touchIdleTimer()
  // The main mpv may have switched files while the worker was busy.
  if (!data || !isCurrentVideo(generation)) return null
  return {
    generation,
    requestId,
    seconds,
    width: MPV_PREVIEW_FRAME_WIDTH,
    height: MPV_PREVIEW_FRAME_HEIGHT,
    data,
  }
}

// App quit: release the preview mpv and never start another one.
export function shutdownPreview(): void {
  disabled = true
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  if (child) stopChild(child)
}
