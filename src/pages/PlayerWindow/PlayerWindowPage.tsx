import { Music2 } from 'lucide-react'
import { useMediaPlayerSync } from '../../hooks/useMediaPlayerSync'
import { useMediaPlayback } from '../../components/media/useMediaPlayback'
import { MediaTransportBar } from '../../components/media/MediaTransportBar'
import { MediaPlaylistPanel } from '../../components/media/MediaPlaylistPanel'
import { useTranslation } from '../../i18n/useTranslation'

// The entire content of the detached player window (see
// electron/main/ipc/mediaWindowHandlers.ts, loaded at the #/player-window
// hash route in its own BrowserWindow) - no Sidebar/AppLayout, just the
// player. Always the playback host while mounted (this window only exists
// because the main window handed hosting off to it - see
// MediaPlayerHost.handleDetach) and reports its position back to the main
// process periodically so closing this window can hand a reasonably fresh
// seek position back to the main window.
export function PlayerWindowPage() {
  const { t } = useTranslation()
  useMediaPlayerSync()
  const { mediaRef, playback } = useMediaPlayback({ isHost: true, reportTimeToMainProcess: true })

  if (!playback) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-sm text-white/60">
        {t('media.noTrackPlaying')}
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-black">
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {playback.isVideo ? (
          <video
            ref={mediaRef}
            {...playback.mediaElementProps}
            className="h-full w-full object-contain"
          />
        ) : (
          <>
            <audio ref={mediaRef} {...playback.mediaElementProps} />
            <div className="flex flex-col items-center gap-3 text-white/70">
              <Music2 className="h-16 w-16" />
              <p className="text-sm">{playback.track.name}</p>
            </div>
          </>
        )}
      </div>
      <div className="flex flex-col gap-2 bg-black/80 p-3">
        <MediaTransportBar playback={playback} dark />
        <MediaPlaylistPanel dark className="max-h-40" />
      </div>
    </div>
  )
}
