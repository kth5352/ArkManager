import type { MediaSyncState } from '../../shared/types/ipc'

// Projects the full mediaPlayerStore state down to just the fields another
// window's playback actually needs to mirror. Moved here (was inline in
// useMediaPlayerSync.ts) so sameMediaSyncState below can compare its output
// without importing the hook.
export function toMediaSyncState(state: MediaSyncState): MediaSyncState {
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
  }
}

// Every store mutation - including ones to fields that never appear in
// MediaSyncState at all (mediaExpanded, sidebarActiveTab,
// mediaFullscreenBarHeight, ...) - previously triggered a broadcastState
// IPC call regardless of whether anything a receiving window cares about
// actually changed. P0's synthetic benchmark measured this directly: a
// UI-only toggle broadcasts unconditionally, and at a 10,000-track queue
// each broadcast serializes to ~916KB.
//
// Deliberately field-by-field reference equality, not deep equality or
// JSON.stringify - playlist/shuffleOrder are arrays the store's own actions
// already replace wholesale on any real change (see mediaPlayerStore.ts's
// immutable-update contract, confirmed by mediaPlayerStore.test.ts), so a
// reference compare is both correct and avoids re-serializing a
// potentially-large playlist on every single store notification just to
// decide whether to broadcast it.
export function sameMediaSyncState(a: MediaSyncState, b: MediaSyncState): boolean {
  return (
    a.playlist === b.playlist &&
    a.currentIndex === b.currentIndex &&
    a.isPlaying === b.isPlaying &&
    a.volume === b.volume &&
    a.previousVolume === b.previousVolume &&
    a.repeatMode === b.repeatMode &&
    a.shuffleMode === b.shuffleMode &&
    a.shuffleOrder === b.shuffleOrder &&
    a.shufflePosition === b.shufflePosition &&
    a.isDetached === b.isDetached
  )
}
