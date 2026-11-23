// src/components/media/FullscreenMediaOverlay.tsx
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { FullscreenPlayerView } from './FullscreenPlayerView'
import { useTranslation } from '../../i18n/useTranslation'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import {
  useMediaSidebarOpenQuery,
  useMediaSidebarWidthQuery,
  useSetMediaSidebarOpenMutation,
} from '../../services/settingsService'
import { MEDIA_SIDEBAR_WIDTH_DEFAULT } from '../../lib/clampMediaSidebarWidth'
import type { ParsedLyrics } from '../../lib/lrc'
import type { MediaPlaybackState } from './useMediaPlayback'

interface FullscreenMediaOverlayProps {
  canvasRef: (el: HTMLCanvasElement | null) => void
  playback: MediaPlaybackState
  visible: boolean
  onMinimize?: () => void
  onDetach?: () => void
  lyricsEnabled?: boolean
  parsedLyrics?: ParsedLyrics | null
  onToggleLyrics?: () => void
  subtitlePipOpen?: boolean
}

// Always mounted whenever this window is hosting playback and isn't
// detached (see MediaPlayerHost) - covers both video and audio (see
// docs/superpowers/specs/2026-08-03-media-thumbnails-design.md section 6).
// The screen itself is the shared FullscreenPlayerView (also used by the
// detached window); this wrapper only adds what is specific to the main
// window: the media sidebar (reserved space, the ☰ queue toggle) and
// reporting the bottom band's height for MediaSidebar. `visible` only
// toggles CSS display, never whether the canvas itself is mounted, so
// minimizing back to the docked bar doesn't tear down and rebuffer anything.
export function FullscreenMediaOverlay({
  canvasRef,
  playback,
  visible,
  onMinimize,
  onDetach,
  lyricsEnabled = false,
  parsedLyrics = null,
  onToggleLyrics,
  subtitlePipOpen = false,
}: FullscreenMediaOverlayProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const setSidebarActiveTab = useMediaPlayerStore((s) => s.setSidebarActiveTab)
  const sidebarActiveTab = useMediaPlayerStore((s) => s.sidebarActiveTab)
  const setMediaFullscreenBarHeight = useMediaPlayerStore((s) => s.setMediaFullscreenBarHeight)
  const setSidebarOpen = useSetMediaSidebarOpenMutation()
  const { data: mediaSidebarOpen = false } = useMediaSidebarOpenQuery()
  const { data: mediaSidebarWidth = MEDIA_SIDEBAR_WIDTH_DEFAULT } = useMediaSidebarWidthQuery()
  // MediaSidebar only ever renders on /media (AppLayout.tsx's own render
  // gate) - matching that condition here (rather than just checking
  // mediaSidebarOpen alone) avoids reserving space for a sidebar that
  // isn't actually on screen when a video auto-expands to fullscreen from
  // some other route (e.g. Explorer). The same condition holds the control
  // bands open (spec §3.5).
  const splitForSidebar = pathname === '/media' && mediaSidebarOpen

  // Opens the sidebar's "current queue" tab - mirrors MediaPlayerBar.tsx's
  // openQueueTab exactly. The sidebar's z-[60] sits deliberately above this
  // overlay's z-50 so it stays usable during fullscreen. MediaSidebar only
  // renders on /media, and this overlay can be visible from any route, so
  // the navigate() call is what makes the sidebar it just opened show up.
  // A real toggle: closes if the sidebar is already open on the queue tab.
  const queueTabOpen = mediaSidebarOpen && sidebarActiveTab === 'queue'
  const openQueueTab = (): void => {
    if (queueTabOpen) {
      setSidebarOpen.mutate(false)
      return
    }
    setSidebarOpen.mutate(true)
    setSidebarActiveTab('queue')
    navigate({ to: '/media' })
  }

  // The bottom band's real rendered height goes to the store so
  // MediaSidebar.tsx can anchor its bottom edge right above it (measured,
  // not hardcoded, so a layout change here can't desync from a guess).
  return (
    <FullscreenPlayerView
      canvasRef={canvasRef}
      playback={playback}
      mode="overlay"
      active={visible}
      onMinimize={onMinimize}
      onDetach={onDetach}
      lyricsEnabled={lyricsEnabled}
      parsedLyrics={parsedLyrics}
      onToggleLyrics={onToggleLyrics}
      subtitlePipOpen={subtitlePipOpen}
      sidebarInset={splitForSidebar ? mediaSidebarWidth : 0}
      playlistActive={queueTabOpen}
      onTogglePlaylist={openQueueTab}
      playlistLabel={t('media.playlist')}
      onBottomBandHeightChange={setMediaFullscreenBarHeight}
    />
  )
}
