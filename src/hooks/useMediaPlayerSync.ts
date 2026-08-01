import { useEffect, useRef } from 'react'
import { useMediaPlayerStore } from '../stores/mediaPlayerStore'
import type { MediaSyncState } from '../../shared/types/ipc'

function toSyncState(state: MediaSyncState): MediaSyncState {
  return {
    playlist: state.playlist,
    currentIndex: state.currentIndex,
    isPlaying: state.isPlaying,
    volume: state.volume,
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
export function useMediaPlayerSync(): void {
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
}
