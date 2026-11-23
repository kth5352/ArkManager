import { ipcMain } from 'electron'
import { IPC_CHANNELS, MpvPreviewFrameRequestSchema } from '../../../shared/types/ipc'
import { requestPreviewFrame } from '../media/mpvPreviewManager'

// Scene-preview frames (spec §4.5). The request has no path: the manager
// previews only the file the main mpv already loaded through MPV_LOAD's
// library/trust-boundary check. A malformed payload (including a smuggled
// path field - the schema is strict) rejects the invoke.
export function registerMpvPreviewHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.MPV_PREVIEW_FRAME, (_event, payload: unknown) => {
    const request = MpvPreviewFrameRequestSchema.parse(payload)
    return requestPreviewFrame(request)
  })
}
