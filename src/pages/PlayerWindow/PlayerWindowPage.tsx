import { useMemo, useState } from 'react'
import { Music2 } from 'lucide-react'
import { useMediaPlayerSync } from '../../hooks/useMediaPlayerSync'
import { useMediaPlayback } from '../../components/media/useMediaPlayback'
import { MediaTransportBar } from '../../components/media/MediaTransportBar'
import { MediaPlaylistPanel } from '../../components/media/MediaPlaylistPanel'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import { useTranslation } from '../../i18n/useTranslation'
import { getActiveLyricLine, parseLrc } from '../../lib/lrc'
import { useMediaLyrics } from '../../components/media/useMediaLyrics'

// The entire content of the detached player window (see
// electron/main/ipc/mediaWindowHandlers.ts, loaded at the #/player-window
// hash route in its own BrowserWindow) - no Sidebar/AppLayout, just the
// player. Always the playback host while mounted (this window only exists
// because the main window handed hosting off to it - see
// MediaPlayerHost.handleDetach) and reports its position back to the main
// process periodically so closing this window can hand a reasonably fresh
// seek position back to the main window. Its audio view shows the same
// resolved thumbnail as FullscreenMediaOverlay (falling back to the same
// generic icon) for visual consistency across both windows - this is its
// own separate useMediaPlayback instance in a separate renderer process, so
// it tracks its own thumbnail-failure state rather than sharing any with
// the main window's.
export function PlayerWindowPage() {
  const { t } = useTranslation()
  useMediaPlayerSync()
  const { mediaRef, playback } = useMediaPlayback({ isHost: true, reportTimeToMainProcess: true })
  const [thumbFailedPath, setThumbFailedPath] = useState<string | null>(null)
  const lyricsQuery = useMediaLyrics(playback?.track.path ?? null)
  const parsedLyrics = useMemo(
    () => (lyricsQuery.data ? parseLrc(lyricsQuery.data.text) : null),
    [lyricsQuery.data]
  )
  const [lyricsEnabled, setLyricsEnabled] = useState(false)

  if (!playback) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-sm text-white/60">
        {t('media.noTrackPlaying')}
      </div>
    )
  }

  const thumbFailed = thumbFailedPath === playback.track.path
  const lyricText =
    !lyricsEnabled || !parsedLyrics
      ? null
      : parsedLyrics.kind === 'static'
        ? parsedLyrics.lines.join('\n')
        : getActiveLyricLine(parsedLyrics, playback.currentTime)?.text ?? null

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
            {thumbFailed ? (
              <div className="flex flex-col items-center gap-3 text-white/70">
                <Music2 className="h-16 w-16" />
                <p className="text-sm">{playback.track.name}</p>
              </div>
            ) : (
              <img
                src={buildMediaThumbnailUrl(playback.track.path)}
                alt=""
                className="max-h-full max-w-full object-contain"
                draggable={false}
                onError={() => setThumbFailedPath(playback.track.path)}
              />
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-2 bg-black/80 p-3">
        {lyricText && <p className="text-center text-sm font-medium whitespace-pre-wrap text-white">{lyricText}</p>}
        <MediaTransportBar
          playback={playback}
          dark
          lyricsEnabled={lyricsEnabled}
          hasLyrics={parsedLyrics !== null}
          onToggleLyrics={() => setLyricsEnabled((enabled) => !enabled)}
        />
        <MediaPlaylistPanel dark className="max-h-40" />
      </div>
    </div>
  )
}
