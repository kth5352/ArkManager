import { useEffect, useMemo, useState } from 'react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useMediaPlayback } from './useMediaPlayback'
import { MediaPlayerBar } from './MediaPlayerBar'
import { FullscreenMediaOverlay } from './FullscreenMediaOverlay'
import { MediaSidebar, type MediaSidebarTab } from './MediaSidebar'
import { parseLrc } from '../../lib/lrc'
import { useMediaLyrics } from './useMediaLyrics'
import { isLyricsEnabledForTrack, toggleLyricsDisabledForTrack } from './lyricsToggleState'
import {
  useMediaSidebarOpenQuery,
  useSetMediaSidebarOpenMutation,
} from '../../services/settingsService'

// Mounted once in AppLayout - renders nothing while the playlist is empty,
// so most of the app never even has this in the DOM. Playback survives
// page navigation because this lives above the router's <Outlet>.
//
// Owns the single useMediaPlayback instance for the main window: exactly
// one <video>/<audio> element exists here at a time, shared between the
// docked bar (when minimized) and FullscreenMediaOverlay (when expanded)
// purely via CSS visibility - see FullscreenMediaOverlay's own comment for
// why it's never unmounted just to minimize.
export function MediaPlayerHost() {
  const isDetached = useMediaPlayerStore((s) => s.isDetached)
  const setDetached = useMediaPlayerStore((s) => s.setDetached)
  const { mediaRef, playback } = useMediaPlayback({ isHost: !isDetached })
  const lyricsQuery = useMediaLyrics(playback?.track.path ?? null)
  const parsedLyrics = useMemo(
    () => (lyricsQuery.data ? parseLrc(lyricsQuery.data.text) : null),
    [lyricsQuery.data]
  )
  const [lyricsDisabledTrackPaths, setLyricsDisabledTrackPaths] = useState<Set<string>>(new Set())
  const lyricsEnabled = isLyricsEnabledForTrack(
    playback?.track.path ?? null,
    parsedLyrics !== null,
    lyricsDisabledTrackPaths
  )
  const toggleLyrics = (): void => {
    if (!playback?.track.path) return
    setLyricsDisabledTrackPaths((paths) => toggleLyricsDisabledForTrack(playback.track.path, paths))
  }

  // Current-queue-first per this feature's design (Task 3 brief) - unlike
  // ExplorerTreeOpen/DetailSidebar's own persisted state, which tab is
  // active isn't persisted across restarts, only whether the sidebar itself
  // is open/closed (useMediaSidebarOpenQuery) and its width are.
  const [sidebarTab, setSidebarTab] = useState<MediaSidebarTab>('queue')
  const { data: sidebarOpenSetting, isLoading: sidebarOpenLoading } = useMediaSidebarOpenQuery()
  const setSidebarOpenMutation = useSetMediaSidebarOpenMutation()
  const sidebarOpen = sidebarOpenSetting ?? true

  // Starts minimized (false), not expanded - the auto-expand effect below
  // flips this true the first time a VIDEO track becomes current, but
  // never for audio (see FullscreenMediaOverlay's "no auto-expand for
  // audio" requirement). Starting this true (as it safely could before
  // FullscreenMediaOverlay covered audio too) would show fullscreen for an
  // audio track's very first play, before the effect below - which only
  // ever fires for isVideo tracks - gets any chance to run.
  const [mediaExpanded, setMediaExpanded] = useState(false)
  const [expandedForPath, setExpandedForPath] = useState<string | null>(null)

  // Auto-expands to fullscreen whenever a NEW video track becomes current -
  // adjusted during render (same pattern as useMediaPlayback's own
  // resetForPath), not in an effect, so there's no extra cascading render.
  // Deliberately video-only: skipping from an expanded video to an audio
  // track leaves mediaExpanded at whatever it already was (this block
  // simply doesn't run for audio), so an in-progress fullscreen viewing
  // session isn't interrupted - but nothing here ever sets it true FOR an
  // audio track on its own.
  if (playback && playback.isVideo && playback.track.path !== expandedForPath) {
    setExpandedForPath(playback.track.path)
    setMediaExpanded(true)
  }

  // Fires once the detached player window closes (by any means - the OS
  // close button included, see mediaWindowHandlers.ts) - hands playback
  // back to this window at wherever the other window last reported being.
  useEffect(() => {
    return window.api.media.onPlayerWindowClosed((seconds) => {
      setDetached(false, seconds)
    })
  }, [setDetached])

  // Resets the auto-expand state whenever playback empties out (e.g. the
  // last track gets removed from the playlist via MediaPlaylistPanel's
  // remove button, reachable from inside FullscreenMediaOverlay itself
  // while a video is expanded) - adjusted during render, same pattern as
  // the auto-expand block above, so there's no extra cascading render.
  // Without this, mediaExpanded/expandedForPath would keep their stale
  // values (this component itself never unmounts, only its returned JSX
  // becomes null right below), so the next track to play - even an audio
  // track the user never asked to expand - would inherit a stale
  // mediaExpanded === true and show fullscreen with no click. Resetting
  // expandedForPath also means replaying the exact same video path after
  // the playlist was cleared correctly re-triggers auto-expand.
  if (!playback) {
    if (mediaExpanded) setMediaExpanded(false)
    if (expandedForPath !== null) setExpandedForPath(null)
    return null
  }

  const handleDetach = (): void => {
    const seconds = playback.currentTime
    setDetached(true, seconds)
    // Reads the store fresh (not the stale closure this render captured)
    // since setDetached above just changed it - the new player window's
    // own store starts empty otherwise (a separate renderer process, no
    // shared memory), so it needs this exact snapshot handed to it
    // directly rather than waiting for the next incidental broadcast.
    const state = useMediaPlayerStore.getState()
    window.api.media.openPlayerWindow({
      playlist: state.playlist,
      currentIndex: state.currentIndex,
      isPlaying: state.isPlaying,
      volume: state.volume,
      previousVolume: state.previousVolume,
      repeatMode: state.repeatMode,
      shuffleMode: state.shuffleMode,
      shuffleOrder: state.shuffleOrder,
      shufflePosition: state.shufflePosition,
      isDetached: true,
      handoffTimeSeconds: seconds,
    })
  }

  return (
    <>
      {!isDetached && (
        <FullscreenMediaOverlay
          mediaRef={mediaRef}
          playback={playback}
          visible={mediaExpanded}
          onMinimize={() => setMediaExpanded(false)}
          onDetach={handleDetach}
          lyricsEnabled={lyricsEnabled}
          parsedLyrics={parsedLyrics}
          onToggleLyrics={toggleLyrics}
        />
      )}
      {(isDetached || !mediaExpanded) && (
        <MediaPlayerBar
          playback={playback}
          isDetached={isDetached}
          onExpandVideo={() => setMediaExpanded(true)}
          lyricsEnabled={lyricsEnabled}
          parsedLyrics={parsedLyrics}
          onToggleLyrics={toggleLyrics}
        />
      )}
      {/* MediaSidebar's own root relies on a real-height ancestor for its
          h-full (same assumption ExplorerSidebar/DetailSidebar make inside
          their own flex-row parents) - but MediaPlayerHost itself is mounted
          in AppLayout as a plain flow sibling below the main content row
          (see AppLayout.tsx), with no such ancestor and no `main`-row access
          from here. `fixed inset-y-0 right-0` gives it real viewport height
          independent of that ancestry (the same technique
          FullscreenMediaOverlay already uses via its own `fixed inset-0`),
          rather than restructuring AppLayout.tsx just for this. z-[60] - one
          above FullscreenMediaOverlay's z-50 - keeps it usable (browsing the
          queue/lyrics) even while a video is fullscreen, deliberately
          floating over the video's own right edge rather than squeezing
          FullscreenMediaOverlay's layout, which would require changes there
          out of this task's scope. */}
      {!sidebarOpenLoading && sidebarOpen && (
        <div className="fixed inset-y-0 right-0 z-[60]">
          <MediaSidebar
            activeTab={sidebarTab}
            onActiveTabChange={setSidebarTab}
            onClose={() => setSidebarOpenMutation.mutate(false)}
          />
        </div>
      )}
    </>
  )
}
