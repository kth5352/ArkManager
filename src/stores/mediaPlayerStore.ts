import { create } from 'zustand'

export interface MediaTrack {
  path: string
  name: string
}

interface MediaPlayerState {
  playlist: MediaTrack[]
  currentIndex: number | null
  isPlaying: boolean
  volume: number
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
}

// Global (not persisted) - playback should survive navigating between pages,
// the same way a real media player's transport bar does. Mounted once as
// MediaPlayerBar in AppLayout; Explorer/the dedicated Media page only ever
// call these actions, never render <video>/<audio> themselves.
export const useMediaPlayerStore = create<MediaPlayerState>((set, get) => ({
  playlist: [],
  currentIndex: null,
  isPlaying: false,
  volume: 1,

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
    const { playlist, currentIndex } = get()
    if (currentIndex === null || playlist.length === 0) return
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
}))
