import { useEffect, useRef } from 'react'
import { useMediaPlayerStore } from '../stores/mediaPlayerStore'
import type { MediaSyncState } from '../../shared/types/ipc'

function toSyncState(state: MediaSyncState): MediaSyncState {
  return {
    playlist: state.playlist,
    currentIndex: state.currentIndex,
    isPlaying: state.isPlaying,
    volume: state.volume,
    previousVolume: state.previousVolume,
    repeatMode: state.repeatMode,
    shuffleMode: state.shuffleMode,
    shuffleOrder: state.shuffleOrder,
    shufflePosition: state.shufflePosition,
    isDetached: state.isDetached,
    handoffTimeSeconds: state.handoffTimeSeconds,
  }
}

// Mirrors this window's media player store to every other open window (main
// <-> the detached player window) via the main process as a relay -
// Zustand store instances are per-renderer-process, and Electron gives no
// way to literally share one JS object across BrowserWindows. Mount once
// per window (AppLayout for the main window, the player-window route for
// the detached one).
//
// applyingRemote guards against a ping-pong loop: applying an incoming sync
// via setState would otherwise itself trigger the subscribe callback below,
// which would broadcast right back out to the window that just sent it.
export function useMediaPlayerSync(options?: { requestInitialStateOnMount?: boolean }): void {
  const applyingRemote = useRef(false)

  useEffect(() => {
    return useMediaPlayerStore.subscribe((state) => {
      if (applyingRemote.current) return
      window.api.media.broadcastState(toSyncState(state))
    })
  }, [])

  useEffect(() => {
    return window.api.media.onStateSync((state) => {
      applyingRemote.current = true
      useMediaPlayerStore.setState(state)
      applyingRemote.current = false
    })
  }, [])

  // Responds to another window's MEDIA_REQUEST_STATE_SYNC by re-broadcasting
  // this window's own current state - runs in every window (not just the
  // main one), which is harmless: whichever window actually has live,
  // meaningful state is the one whose response matters, and an empty/
  // default response from an irrelevant window is indistinguishable from
  // no response at all once the requester's own onStateSync applies it (the
  // requester only cares about the LAST state it receives, and only one
  // other window - the one hosting playback - has anything non-default to
  // send).
  useEffect(() => {
    return window.api.media.onStateSyncRequested(() => {
      window.api.media.broadcastState(toSyncState(useMediaPlayerStore.getState()))
    })
  }, [])

  // The detached player window mounts with an empty, default-state Zustand
  // store (a fresh renderer process) - MEDIA_OPEN_PLAYER_WINDOW's own
  // did-finish-load push (see mediaWindowHandlers.ts) is usually fast
  // enough to seed it before this ever needs to fire, but that event can
  // race ahead of this component's own useEffects actually running (e.g.
  // if the player-window route is code-split and loads asynchronously) -
  // if the push is missed, this window would otherwise sit at "재생 중인
  // 항목이 없습니다" forever despite the main window still actively
  // playing. Requesting once on mount, after the onStateSync listener above
  // is already subscribed, closes that gap regardless of push timing.
  useEffect(() => {
    if (options?.requestInitialStateOnMount) window.api.media.requestStateSync()
  }, [options?.requestInitialStateOnMount])
}
