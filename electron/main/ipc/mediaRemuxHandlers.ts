import { ipcMain } from 'electron'
import { IPC_CHANNELS, MediaCheckNeedsRemuxRequestSchema } from '../../../shared/types/ipc'
import { isLikelyMpegTsStream } from '../media/isLikelyMpegTsStream'

// Cheap, renderer-triggered pre-check (reads a few hundred bytes) used only
// to decide whether to show a "변환 중" loading state before playback starts.
// The actual detection + remux + caching happens server-side inside
// media://'s own request handling (mediaProtocol.ts's
// resolvePlayableMediaPath) - this handler deliberately does NOT trigger a
// remux itself, so it stays fast even for a file that turns out to need
// one, letting the UI react before the slow part begins.
export function registerMediaRemuxHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_CHECK_NEEDS_REMUX, async (_event, payload: unknown) => {
    const { filePath } = MediaCheckNeedsRemuxRequestSchema.parse(payload)
    return isLikelyMpegTsStream(filePath)
  })
}
