import { useEffect, useMemo, useState } from 'react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useMediaPlayback } from './useMediaPlayback'
import { MediaPlayerBar } from './MediaPlayerBar'
import { FullscreenMediaOverlay } from './FullscreenMediaOverlay'
import { parseLyrics } from '../../lib/parseLyrics'
import { useMediaLyrics } from './useMediaLyrics'
import { isLyricsEnabledForTrack, toggleLyricsDisabledForTrack } from './lyricsToggleState'
import { useBroadcastActiveSubtitleLine } from '../../hooks/useBroadcastActiveSubtitleLine'

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
  const setSubtitlePipOpen = useMediaPlayerStore((s) => s.setSubtitlePipOpen)
  const subtitlePipOpen = useMediaPlayerStore((s) => s.subtitlePipOpen)
  const setPlaybackCurrentTime = useMediaPlayerStore((s) => s.setPlaybackCurrentTime)
  const setSeekPlayback = useMediaPlayerStore((s) => s.setSeekPlayback)
  const { mediaRef, playback } = useMediaPlayback({ isHost: !isDetached })
  const lyricsQuery = useMediaLyrics(playback?.track.path ?? null)
  const parsedLyrics = useMemo(
    () => (lyricsQuery.data ? parseLyrics(lyricsQuery.data.text, lyricsQuery.data.path) : null),
    [lyricsQuery.data]
  )
  useBroadcastActiveSubtitleLine(parsedLyrics, playback?.currentTime ?? 0, playback !== null, !isDetached)
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

  // PIP 창의 열림/닫힘은 메인 프로세스가 진실 공급원(subtitlePipWindowHandlers.ts)
  // - 이 창(메인 창)에서 그 상태를 구독해 스토어에 반영하면, 도킹바/자막 로그
  // 탭 두 토글 버튼이 별도 IPC 리스너 없이 스토어 값만 읽어 항상 동기화된다.
  useEffect(() => {
    return window.api.media.onSubtitlePipOpened(() => setSubtitlePipOpen(true))
  }, [setSubtitlePipOpen])

  useEffect(() => {
    return window.api.media.onSubtitlePipClosed(() => setSubtitlePipOpen(false))
  }, [setSubtitlePipOpen])

  // Bridges playback.currentTime/handleSeek (tied to the live <video>/
  // <audio> element this component alone mounts via useMediaPlayback) into
  // mediaPlayerStore so LyricsLogTab - rendered from AppLayout.tsx, a
  // separate part of the tree - can read/drive them without a second
  // useMediaPlayback instance (which would mount a second live media
  // element ref; forbidden, see this component's own top comment). A
  // genuine external-system side effect (not a derived-value sync), so a
  // plain useEffect is appropriate here, unlike the render-time adjustments
  // above. Resets to 0/no-op once playback empties out (handleSeek would
  // otherwise stay pointed at a stale, now-unmounted element).
  useEffect(() => {
    setPlaybackCurrentTime(playback?.currentTime ?? 0)
  }, [playback?.currentTime, setPlaybackCurrentTime])

  useEffect(() => {
    setSeekPlayback(playback ? playback.handleSeek : () => {})
  }, [playback, setSeekPlayback])

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
          subtitlePipOpen={subtitlePipOpen}
          onDetach={handleDetach}
        />
      )}
    </>
  )
}
