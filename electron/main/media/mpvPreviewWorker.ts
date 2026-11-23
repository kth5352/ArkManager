// Runs INSIDE the scene-preview utilityProcess (forked by mpvPreviewManager.ts)
// - never imported by the main process. It hosts a second, independent mpv
// session through the same native addon as mpvWorker.ts: the addon keeps one
// global session per process, so a separate process is a separate mpv.
//
// Preview mode (`init(..., { preview: true })`, mpv_addon.cc) starts mpv
// paused with ao=null/aid=no, and nothing here un-pauses it or sets a volume,
// so this process can never produce audio. The request loop itself lives in
// mpvPreviewSession.ts.
import { join } from 'node:path'
import {
  createPreviewSession,
  type PreviewAddon,
  type PreviewWorkerRequest,
  type PreviewWorkerResponse,
} from './mpvPreviewSession'

// Resolved by the main process (utilityProcess has no `app`) - same mechanism
// as mpvWorker.ts.
const addonDir = process.env.MPV_ADDON_DIR
if (!addonDir) {
  throw new Error(
    'MPV_ADDON_DIR is not set - mpvPreviewManager.ts must always pass it when forking this worker'
  )
}
process.env.PATH = `${addonDir};${process.env.PATH ?? ''}`

// eslint-disable-next-line @typescript-eslint/no-require-imports -- native addon, not a TS-importable module
const addon = require(join(addonDir, 'build/Release/mpv_addon.node')) as PreviewAddon

const session = createPreviewSession(addon)

function post(msg: PreviewWorkerResponse): void {
  process.parentPort.postMessage(msg)
}

process.parentPort.on('message', (e) => {
  const msg = e.data as PreviewWorkerRequest
  if (msg.type === 'frame') {
    const { id, seconds, path } = msg
    if (
      typeof id !== 'number' ||
      typeof path !== 'string' ||
      typeof seconds !== 'number' ||
      !Number.isFinite(seconds) ||
      seconds < 0
    ) {
      post({ type: 'frame-result', id, data: null })
      return
    }
    void session.requestFrame(path, seconds).then((data) => {
      post({ type: 'frame-result', id, data })
    })
    return
  }
  if (msg.type === 'shutdown') {
    session.shutdown()
    // Unlike the playback worker, this one is stopped on idle too, so it has
    // to actually exit to give its memory back.
    process.exit(0)
  }
})

post({ type: 'log', msg: 'preview worker started, addon loaded' })
