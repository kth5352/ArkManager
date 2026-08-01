import { useEffect, useState } from 'react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useMediaPlayback } from './useMediaPlayback'
import { MediaPlayerBar } from './MediaPlayerBar'
import { FullscreenVideoOverlay } from './FullscreenVideoOverlay'

// Mounted once in AppLayout - renders nothing while the playlist is empty,
// so most of the app never even has this in the DOM. Playback survives
// page navigation because this lives above the router's <Outlet>.
//
// Owns the single useMediaPlayback instance for the main window: exactly
// one <video>/<audio> element exists here at a time, shared between the
// docked bar (audio, or a minimized video) and FullscreenVideoOverlay (an
// expanded video) purely via CSS visibility - see FullscreenVideoOverlay's
// own comment for why it's never unmounted just to minimize.
export function MediaPlayerHost() {
  const isDetached = useMediaPlayerStore((s) => s.isDetached)
  const setDetached = useMediaPlayerStore((s) => s.setDetached)
  const { mediaRef, playback } = useMediaPlayback({ isHost: !isDetached })

  const [videoExpanded, setVideoExpanded] = useState(true)
  const [expandedForPath, setExpandedForPath] = useState<string | null>(null)

  // Auto-expands to fullscreen whenever a NEW video track becomes current -
  // adjusted during render (same pattern as useMediaPlayback's own
  // resetForPath), not in an effect, so there's no extra cascading render.
  if (playback && playback.isVideo && playback.track.path !== expandedForPath) {
    setExpandedForPath(playback.track.path)
    setVideoExpanded(true)
  }

  // Fires once the detached player window closes (by any means - the OS
  // close button included, see mediaWindowHandlers.ts) - hands playback
  // back to this window at wherever the other window last reported being.
  useEffect(() => {
    return window.api.media.onPlayerWindowClosed((seconds) => {
      setDetached(false, seconds)
    })
  }, [setDetached])

  if (!playback) return null

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
      isDetached: true,
      handoffTimeSeconds: seconds,
    })
  }

  return (
    <>
      {!isDetached && playback.isVideo && (
        <FullscreenVideoOverlay
          mediaRef={mediaRef}
          playback={playback}
          visible={videoExpanded}
          onMinimize={() => setVideoExpanded(false)}
          onDetach={handleDetach}
        />
      )}
      {(isDetached || !playback.isVideo || !videoExpanded) && (
        <MediaPlayerBar
          mediaRef={mediaRef}
          playback={playback}
          isDetached={isDetached}
          onExpandVideo={playback.isVideo ? () => setVideoExpanded(true) : undefined}
        />
      )}
    </>
  )
}
