import { create } from 'zustand'
import { generateShuffleOrderKeepingFront, generateShuffleOrderAvoidingFront } from './shuffleOrder'

export interface MediaTrack {
  path: string
  name: string
}

export type RepeatMode = 'off' | 'all' | 'one'

// Owned here (not by MediaSidebar.tsx, which re-exports it) because
// AppLayout.tsx now renders <MediaSidebar> in a different part of the tree
// than MediaPlayerHost (which still owns MediaPlayerBar, whose queue button
// a later task wires to this same tab) - a plain component-local useState
// can't be shared across that boundary, so this needs to live in the store
// both sides already import.
export type MediaSidebarTab = 'playlists' | 'queue' | 'lyrics'

interface MediaPlayerState {
  playlist: MediaTrack[]
  currentIndex: number | null
  isPlaying: boolean
  volume: number
  // Remembers the volume from just before muting, so unmuting restores it
  // instead of jumping to some arbitrary default - "muted" itself is just
  // volume === 0, not a separate flag, so nothing else needs to branch on
  // it.
  previousVolume: number
  // Cycles off -> all -> one -> off. 'one' is handled by the caller
  // (useMediaPlayback's onEnded, not next()/prev() - a skip button press
  // should always move to the adjacent track regardless of this mode,
  // matching every other media player's convention; only a track ending
  // naturally loops it). 'off' vs 'all' is this store's own concern: `next`
  // stops instead of wrapping past the last track when off.
  repeatMode: RepeatMode
  // See shuffleOrder.ts for how these two are generated. shufflePosition is
  // a pointer into shuffleOrder, not a separate history - next/prev just
  // move it forward/backward through the same planned order, so "forward
  // after going back" naturally replays what was already decided instead
  // of needing new randomness.
  shuffleMode: boolean
  shuffleOrder: number[]
  shufflePosition: number
  // True once playback has been detached into its own Electron window (see
  // useMediaPlayerSync) - the main window stops mounting a real <video>/
  // <audio> element while this is true (only one window may ever host
  // actual playback at a time), but playlist/currentIndex/isPlaying/volume
  // stay live here as a shared "control plane" so the main window's
  // transport buttons keep working as remote controls for the detached
  // window's player.
  isDetached: boolean
  // One-shot seek position handed off across a detach/reattach transition -
  // set by whichever window WAS hosting playback right before the switch,
  // consumed (read once, then cleared back to null via consumeHandoffTime)
  // by whichever window becomes the new host, once its own media element
  // has loaded. Not kept continuously in sync like the fields above -
  // currentTime/duration otherwise live as local component state in
  // MediaPlayerCore, not in this store, since they change too often
  // (~4x/sec) to broadcast across windows.
  handoffTimeSeconds: number | null
  // Which MediaSidebar tab is active. Current-queue-first per this
  // feature's design (Task 3 brief) - unlike ExplorerTreeOpen/DetailSidebar's
  // own persisted state, this isn't persisted across restarts, only whether
  // the sidebar itself is open/closed (useMediaSidebarOpenQuery) and its
  // width are.
  sidebarActiveTab: MediaSidebarTab
  setSidebarActiveTab: (tab: MediaSidebarTab) => void
  // Plays `track` immediately. `siblings` (when given, e.g. the other media
  // files in the same folder) replaces the whole playlist so next/prev walk
  // through them in listing order; omitted, the playlist becomes just this
  // one track (the dedicated Media page's "바로 재생" case).
  playNow: (track: MediaTrack, siblings?: MediaTrack[]) => void
  addToPlaylist: (tracks: MediaTrack[]) => void
  playAt: (index: number) => void
  next: () => void
  prev: () => void
  togglePlay: () => void
  setPlaying: (isPlaying: boolean) => void
  removeFromPlaylist: (index: number) => void
  reorderPlaylist: (fromIndex: number, toIndex: number) => void
  clearPlaylist: () => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setDetached: (isDetached: boolean, handoffTimeSeconds?: number) => void
  consumeHandoffTime: () => number | null
  cycleRepeatMode: () => void
  toggleShuffle: () => void
}

// Global (not persisted) - playback should survive navigating between pages,
// the same way a real media player's transport bar does. Mounted once as
// MediaPlayerHost in AppLayout (plus, once detached, PlayerWindowPage in
// its own BrowserWindow - see useMediaPlayerSync for how this store stays
// in sync across the two); Explorer/the dedicated Media page only ever call
// these actions, never render <video>/<audio> themselves.
export const useMediaPlayerStore = create<MediaPlayerState>((set, get) => ({
  playlist: [],
  currentIndex: null,
  isPlaying: false,
  volume: 1,
  previousVolume: 1,
  isDetached: false,
  handoffTimeSeconds: null,
  sidebarActiveTab: 'queue',
  setSidebarActiveTab: (tab) => set({ sidebarActiveTab: tab }),
  repeatMode: 'off',
  shuffleMode: false,
  shuffleOrder: [],
  shufflePosition: 0,

  playNow: (track, siblings) => {
    const list = siblings ?? [track]
    const index = list.findIndex((t) => t.path === track.path)
    set({ playlist: list, currentIndex: index === -1 ? 0 : index, isPlaying: true })
  },

  addToPlaylist: (tracks) => {
    const { playlist, currentIndex } = get()
    const existingPaths = new Set(playlist.map((t) => t.path))
    const toAdd = tracks.filter((t) => !existingPaths.has(t.path))
    if (toAdd.length === 0) return
    const wasEmpty = playlist.length === 0
    set({
      playlist: [...playlist, ...toAdd],
      currentIndex: wasEmpty ? 0 : currentIndex,
      isPlaying: wasEmpty ? true : get().isPlaying,
    })
  },

  playAt: (index) => set({ currentIndex: index, isPlaying: true }),

  next: () => {
    const { playlist, currentIndex, repeatMode, shuffleMode, shuffleOrder, shufflePosition } = get()
    if (currentIndex === null || playlist.length === 0) return

    if (shuffleMode) {
      // shuffleOrder/shufflePosition only stay valid for the playlist they
      // were generated against - removeFromPlaylist/clearPlaylist/
      // addToPlaylist/playNow can all change playlist.length while shuffle
      // stays on (none of them touch shuffle state - see toggleShuffle's own
      // comment on this being deliberately out of scope for THOSE actions).
      // Detecting a length mismatch here and regenerating on the spot means
      // next()/prev() self-heal from any of them that changed
      // playlist.length, rather than needing every playlist-mutating action
      // to separately remember shuffle exists - it does NOT catch every
      // possible staleness (e.g. clearPlaylist followed by a same-track-count
      // playNow leaves a stale shufflePosition with the length check passing
      // vacuously; harmless - it degrades to an early "stop" or a same-track
      // no-op skip, never an out-of-range index - but not literally "healed"
      // either). Without a length mismatch, a stale order can point past the end
      // of the live playlist - currentIndex becomes an out-of-range index,
      // playlist[currentIndex] is undefined, and the whole transport bar
      // unmounts (see useMediaPlayback's `if (!track) return null`).
      const order =
        shuffleOrder.length === playlist.length
          ? shuffleOrder
          : generateShuffleOrderKeepingFront(playlist.length, currentIndex)
      const position = shuffleOrder.length === playlist.length ? shufflePosition : 0

      const atEnd = position >= order.length - 1
      if (atEnd) {
        if (repeatMode === 'off') {
          set({ shuffleOrder: order, shufflePosition: position, isPlaying: false })
          return
        }
        const nextOrder = generateShuffleOrderAvoidingFront(playlist.length, currentIndex)
        set({
          shuffleOrder: nextOrder,
          shufflePosition: 0,
          currentIndex: nextOrder[0],
          isPlaying: true,
        })
        return
      }
      const nextPosition = position + 1
      set({
        shuffleOrder: order,
        shufflePosition: nextPosition,
        currentIndex: order[nextPosition],
        isPlaying: true,
      })
      return
    }

    const isLast = currentIndex === playlist.length - 1
    if (isLast && repeatMode === 'off') {
      set({ isPlaying: false })
      return
    }
    set({ currentIndex: (currentIndex + 1) % playlist.length, isPlaying: true })
  },

  prev: () => {
    const { playlist, currentIndex, shuffleMode, shuffleOrder, shufflePosition } = get()
    if (currentIndex === null || playlist.length === 0) return

    if (shuffleMode) {
      // Same staleness self-heal as next() - see its comment.
      const order =
        shuffleOrder.length === playlist.length
          ? shuffleOrder
          : generateShuffleOrderKeepingFront(playlist.length, currentIndex)
      const position = shuffleOrder.length === playlist.length ? shufflePosition : 0

      const prevPosition = Math.max(0, position - 1)
      set({
        shuffleOrder: order,
        shufflePosition: prevPosition,
        currentIndex: order[prevPosition],
        isPlaying: true,
      })
      return
    }

    set({ currentIndex: (currentIndex - 1 + playlist.length) % playlist.length, isPlaying: true })
  },

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaying: (isPlaying) => set({ isPlaying }),

  removeFromPlaylist: (index) => {
    const { playlist, currentIndex } = get()
    const nextPlaylist = playlist.filter((_, i) => i !== index)
    if (currentIndex === null) {
      set({ playlist: nextPlaylist })
      return
    }
    let nextIndex = currentIndex
    if (nextPlaylist.length === 0) nextIndex = -1
    else if (index < currentIndex) nextIndex = currentIndex - 1
    else if (index === currentIndex) nextIndex = Math.min(currentIndex, nextPlaylist.length - 1)
    set({
      playlist: nextPlaylist,
      currentIndex: nextIndex === -1 ? null : nextIndex,
      isPlaying: nextPlaylist.length === 0 ? false : get().isPlaying,
    })
  },

  // Mirrors explorerStore.reorderTabs's splice pattern. currentIndex must
  // follow the track it pointed at, not stay a fixed number - dragging a
  // LATER track to before the current one shifts the current one's own
  // index by +1, and vice versa; recomputing from the moved track's actual
  // new position (rather than adjusting currentIndex with a +-1 heuristic)
  // is correct for every relative ordering of fromIndex/toIndex/currentIndex
  // at once, not just the common cases.
  reorderPlaylist: (fromIndex, toIndex) =>
    set((state) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.playlist.length ||
        toIndex >= state.playlist.length
      )
        return state
      const currentTrack = state.currentIndex !== null ? state.playlist[state.currentIndex] : null
      const playlist = [...state.playlist]
      const [moved] = playlist.splice(fromIndex, 1)
      playlist.splice(toIndex, 0, moved)
      const currentIndex = currentTrack
        ? playlist.findIndex((track) => track.path === currentTrack.path)
        : null
      return { playlist, currentIndex }
    }),

  clearPlaylist: () => set({ playlist: [], currentIndex: null, isPlaying: false }),
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),

  toggleMute: () => {
    const { volume, previousVolume } = get()
    if (volume > 0) set({ volume: 0, previousVolume: volume })
    else set({ volume: previousVolume > 0 ? previousVolume : 1 })
  },

  setDetached: (isDetached, handoffTimeSeconds) =>
    set({ isDetached, handoffTimeSeconds: handoffTimeSeconds ?? null }),

  consumeHandoffTime: () => {
    const { handoffTimeSeconds } = get()
    if (handoffTimeSeconds !== null) set({ handoffTimeSeconds: null })
    return handoffTimeSeconds
  },

  cycleRepeatMode: () =>
    set((state) => ({
      repeatMode: state.repeatMode === 'off' ? 'all' : state.repeatMode === 'all' ? 'one' : 'off',
    })),

  toggleShuffle: () => {
    const { shuffleMode, playlist, currentIndex } = get()
    if (shuffleMode) {
      set({ shuffleMode: false })
      return
    }
    const order =
      currentIndex !== null ? generateShuffleOrderKeepingFront(playlist.length, currentIndex) : []
    set({ shuffleMode: true, shuffleOrder: order, shufflePosition: 0 })
  },
}))
