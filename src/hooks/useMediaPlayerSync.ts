import { useEffect, useRef } from 'react'
import { useMediaPlayerStore } from '../stores/mediaPlayerStore'
import { sameMediaSyncState, toMediaSyncState } from '../lib/mediaSyncState'

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
    // (state, previousState) - zustand's vanilla store passes both to every
    // subscriber, no middleware needed. Previously broadcast unconditionally
    // on ANY store change, including fields toMediaSyncState doesn't even
    // read (mediaExpanded, sidebarActiveTab, mediaFullscreenBarHeight, ...) -
    // P0's synthetic benchmark measured this directly: a UI-only toggle
    // broadcasts every time, and at a 10,000-track queue each broadcast
    // serializes to ~916KB. Only broadcasting when the actual sync DTO
    // changed closes that gap without touching which fields are sent or how
    // the receiving side applies them.
    return useMediaPlayerStore.subscribe((state, previousState) => {
      if (applyingRemote.current) return
      const next = toMediaSyncState(state)
      const prev = toMediaSyncState(previousState)
      if (sameMediaSyncState(next, prev)) return
      window.api.media.broadcastState(next)
    })
  }, [])

  useEffect(() => {
    return window.api.media.onStateSync((state) => {
      applyingRemote.current = true
      try {
        useMediaPlayerStore.setState(state)
      } finally {
        // try/finally, not a bare assignment after setState - a throwing
        // setState (a malformed remote payload, a reducer error) must not
        // leave this guard stuck true forever, which would silently stop
        // this window from ever broadcasting its own future changes again.
        applyingRemote.current = false
      }
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
  // send). Deliberately NOT gated by sameMediaSyncState above - a fresh
  // window has no "previous" state to compare against and must always get
  // an explicit response, even one that happens to equal some default.
  useEffect(() => {
    return window.api.media.onStateSyncRequested(() => {
      window.api.media.broadcastState(toMediaSyncState(useMediaPlayerStore.getState()))
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
