import { ipcMain } from 'electron'
import { IPC_CHANNELS, MediaCheckNeedsRemuxRequestSchema } from '../../../shared/types/ipc'
import { computeMediaAllowedRoots, computeMediaTrustedPaths } from '../media/mediaTrustBoundary'
import { isPathExactlyTrusted, isPathWithinAnyLibrary } from '../thumbnailProtocol'
import { isLikelyMpegTsStream } from '../media/isLikelyMpegTsStream'
import { isAlreadyRemuxed } from '../media/resolvePlayableMediaPath'
import { mediaRemuxCacheDir } from '../mediaProtocol'
import type { AppDatabase } from '../database/client'

// Cheap, renderer-triggered pre-check (reads a few hundred bytes) used only
// to decide whether to show a "변환 중" loading state before playback starts.
// The actual detection + remux + caching happens server-side inside
// media://'s own request handling (mediaProtocol.ts's
// resolvePlayableMediaPath) - this handler deliberately does NOT trigger a
// remux itself, so it stays fast even for a file that turns out to need
// one, letting the UI react before the slow part begins.
export function registerMediaRemuxHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_CHECK_NEEDS_REMUX, async (_event, payload: unknown) => {
    const { filePath } = MediaCheckNeedsRemuxRequestSchema.parse(payload)
    const allowedRoots = computeMediaAllowedRoots(db)
    const trustedPaths = computeMediaTrustedPaths(db)
    // This channel is only a UI hint (whether to show "변환 중"), not a
    // security boundary that actually reads/serves file bytes - an
    // untrusted path is rejected with `false` rather than thrown, the same
    // "just don't show the hint" outcome as any other not-MPEG-TS file.
    if (
      !isPathWithinAnyLibrary(filePath, allowedRoots) &&
      !isPathExactlyTrusted(filePath, trustedPaths)
    ) {
      return false
    }

    // resolvePlayableMediaPath already short-circuits to the cache on a
    // second play of the same file, making real playback instant - without
    // this check, a genuinely MPEG-TS file would still report "needs
    // remux" forever, flashing "변환 중" needlessly on every replay.
    if (await isAlreadyRemuxed(mediaRemuxCacheDir(), filePath)) {
      return false
    }

    return isLikelyMpegTsStream(filePath)
  })
}
