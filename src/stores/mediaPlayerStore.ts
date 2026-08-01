import { create } from 'zustand'

export interface MediaTrack {
  path: string
  name: string
}

export type RepeatMode = 'off' | 'all' | 'one'

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
  clearPlaylist: () => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setDetached: (isDetached: boolean, handoffTimeSeconds?: number) => void
  consumeHandoffTime: () => number | null
  cycleRepeatMode: () => void
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
  repeatMode: 'off',

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
    const { playlist, currentIndex, repeatMode } = get()
    if (currentIndex === null || playlist.length === 0) return
    const isLast = currentIndex === playlist.length - 1
    if (isLast && repeatMode === 'off') {
      set({ isPlaying: false })
      return
    }
    set({ currentIndex: (currentIndex + 1) % playlist.length, isPlaying: true })
  },

  prev: () => {
    const { playlist, currentIndex } = get()
    if (currentIndex === null || playlist.length === 0) return
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
}))
