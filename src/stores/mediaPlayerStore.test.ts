import { describe, it, expect, beforeEach } from 'vitest'
import { useMediaPlayerStore } from './mediaPlayerStore'

describe('useMediaPlayerStore reorderPlaylist', () => {
  beforeEach(() => {
    useMediaPlayerStore.setState({
      playlist: [
        { path: 'C:/a.mp3', name: 'a' },
        { path: 'C:/b.mp3', name: 'b' },
        { path: 'C:/c.mp3', name: 'c' },
      ],
      currentIndex: 0,
    })
  })

  it('moves a track from one index to another', () => {
    useMediaPlayerStore.getState().reorderPlaylist(2, 0)
    expect(useMediaPlayerStore.getState().playlist.map((t) => t.name)).toEqual(['c', 'a', 'b'])
  })

  it('keeps currentIndex pointing at the same track after a reorder', () => {
    // currentIndex starts at 0 (track "a") - moving "c" (index 2) to the
    // front shifts "a" from index 0 to index 1, so currentIndex must follow.
    useMediaPlayerStore.getState().reorderPlaylist(2, 0)
    const state = useMediaPlayerStore.getState()
    expect(state.playlist[state.currentIndex!].name).toBe('a')
  })

  it('leaves playlist unchanged when fromIndex is out of bounds', () => {
    const initialPlaylist = useMediaPlayerStore.getState().playlist
    const initialCurrentIndex = useMediaPlayerStore.getState().currentIndex
    useMediaPlayerStore.getState().reorderPlaylist(5, 1)
    const state = useMediaPlayerStore.getState()
    expect(state.playlist).toEqual(initialPlaylist)
    expect(state.currentIndex).toBe(initialCurrentIndex)
  })

  it('leaves playlist unchanged when toIndex is out of bounds', () => {
    const initialPlaylist = useMediaPlayerStore.getState().playlist
    const initialCurrentIndex = useMediaPlayerStore.getState().currentIndex
    useMediaPlayerStore.getState().reorderPlaylist(1, 10)
    const state = useMediaPlayerStore.getState()
    expect(state.playlist).toEqual(initialPlaylist)
    expect(state.currentIndex).toBe(initialCurrentIndex)
  })

  it('correctly updates currentIndex when the playing track is moved', () => {
    // currentIndex starts at 0 (track "a") - moving "a" to the end
    // should update currentIndex to 2 to keep pointing at "a"
    useMediaPlayerStore.getState().reorderPlaylist(0, 2)
    const state = useMediaPlayerStore.getState()
    expect(state.playlist[state.currentIndex!].name).toBe('a')
    expect(state.currentIndex).toBe(2)
  })

  it('leaves playlist unchanged when fromIndex is a negative number other than -1', () => {
    const initialPlaylist = useMediaPlayerStore.getState().playlist
    const initialCurrentIndex = useMediaPlayerStore.getState().currentIndex
    useMediaPlayerStore.getState().reorderPlaylist(-2, 0)
    const state = useMediaPlayerStore.getState()
    expect(state.playlist).toEqual(initialPlaylist)
    expect(state.currentIndex).toBe(initialCurrentIndex)
    // Verify no undefined entries were inserted
    expect(state.playlist.every((track) => track && track.path)).toBe(true)
  })

  it('leaves empty playlist unchanged when given negative indices', () => {
    useMediaPlayerStore.setState({ playlist: [], currentIndex: null })
    useMediaPlayerStore.getState().reorderPlaylist(-2, -2)
    const state = useMediaPlayerStore.getState()
    expect(state.playlist).toEqual([])
    expect(state.currentIndex).toBe(null)
    // Verify no undefined entries were inserted
    expect(state.playlist.every((track) => track && track.path)).toBe(true)
  })
})
