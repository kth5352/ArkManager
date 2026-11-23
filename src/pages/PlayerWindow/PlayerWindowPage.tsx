import { useEffect, useMemo, useState } from 'react'
import { useMediaPlayerSync } from '../../hooks/useMediaPlayerSync'
import { useMediaPlayback } from '../../components/media/useMediaPlayback'
import { FullscreenPlayerView } from '../../components/media/FullscreenPlayerView'
import { MediaPlaylistPanel } from '../../components/media/MediaPlaylistPanel'
import { useTranslation } from '../../i18n/useTranslation'
import { parseLyrics } from '../../lib/parseLyrics'
import { useMediaLyrics } from '../../components/media/useMediaLyrics'
import { useBroadcastActiveSubtitleLine } from '../../hooks/useBroadcastActiveSubtitleLine'
import { useWindowFullscreen } from '../../hooks/useWindowFullscreen'

// The entire content of the detached player window (see
// electron/main/ipc/mediaWindowHandlers.ts, loaded at the #/player-window
// hash route in its own BrowserWindow) - no Sidebar/AppLayout, just the
// player. Always the playback host while mounted (this window only exists
// because the main window handed hosting off to it - see
// MediaPlayerHost.handleDetach). Position no longer needs to be reported
// back explicitly - mpv runs in a main-owned utility process, so the main
// process already knows the current position from mpv's own state
// broadcasts regardless of which renderer is host (see mpvHandlers.ts).
// Renders the same FullscreenPlayerView as the main window's overlay; its
// playlist lives in the view's ☰ side panel. This is its own separate
// useMediaPlayback instance in a separate renderer process, so it tracks
// its own thumbnail-failure / lyrics-toggle state.
export function PlayerWindowPage() {
  const { t } = useTranslation()
  useMediaPlayerSync({ requestInitialStateOnMount: true })
  const { canvasRef, playback } = useMediaPlayback({ isHost: true })
  const lyricsQuery = useMediaLyrics(playback?.track.path ?? null)
  const parsedLyrics = useMemo(
    () => (lyricsQuery.data ? parseLyrics(lyricsQuery.data.text, lyricsQuery.data.path) : null),
    [lyricsQuery.data]
  )
  const [lyricsEnabled, setLyricsEnabled] = useState(false)
  useBroadcastActiveSubtitleLine(parsedLyrics, playback?.currentTime ?? 0, playback !== null, true)

  // The PiP window's open state is broadcast to every window by the main
  // process (subtitlePipWindowHandlers.ts). This window starts out assuming
  // closed; opening an already-open PiP re-broadcasts "opened", so the
  // button self-corrects on first use.
  const [subtitlePipOpen, setSubtitlePipOpen] = useState(false)
  useEffect(() => window.api.media.onSubtitlePipOpened(() => setSubtitlePipOpen(true)), [])
  useEffect(() => window.api.media.onSubtitlePipClosed(() => setSubtitlePipOpen(false)), [])

  // The view (and its ⛶/F/Escape) unmounts with the "nothing playing"
  // screen below, so playback ending must release media-owned fullscreen
  // here - same guard as MediaPlayerHost (spec §3.6/§3.8). F11 stays.
  const { owner: fullscreenOwner, release: releaseFullscreen } = useWindowFullscreen()
  const hasPlayback = playback !== null
  useEffect(() => {
    if (!hasPlayback && fullscreenOwner === 'media') releaseFullscreen()
  }, [hasPlayback, fullscreenOwner, releaseFullscreen])

  if (!playback) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-sm text-white/60">
        {t('media.noTrackPlaying')}
      </div>
    )
  }

  return (
    <FullscreenPlayerView
      canvasRef={canvasRef}
      playback={playback}
      mode="detached"
      lyricsEnabled={lyricsEnabled}
      parsedLyrics={parsedLyrics}
      onToggleLyrics={() => setLyricsEnabled((enabled) => !enabled)}
      subtitlePipOpen={subtitlePipOpen}
      playlistLabel={t('media.showPlaylist')}
      sidePanel={<MediaPlaylistPanel dark className="h-full" />}
    />
  )
}
