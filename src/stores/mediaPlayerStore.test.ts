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

describe('useMediaPlayerStore sidebarActiveTab', () => {
  it('defaults to "playlists"', () => {
    expect(useMediaPlayerStore.getState().sidebarActiveTab).toBe('playlists')
  })

  it('setSidebarActiveTab updates the active tab', () => {
    useMediaPlayerStore.getState().setSidebarActiveTab('lyrics')
    expect(useMediaPlayerStore.getState().sidebarActiveTab).toBe('lyrics')
    useMediaPlayerStore.getState().setSidebarActiveTab('queue')
    expect(useMediaPlayerStore.getState().sidebarActiveTab).toBe('queue')
    // Reset back to the default so this test doesn't leak state into others.
    useMediaPlayerStore.getState().setSidebarActiveTab('playlists')
  })
})

describe('useMediaPlayerStore media browse navigation', () => {
  beforeEach(() => {
    useMediaPlayerStore.setState({
      mediaBrowsePath: null,
      mediaBrowseHistory: [],
      mediaBrowseHistoryIndex: 0,
    })
  })

  it('resetMediaBrowseRoot starts a fresh single-entry history', () => {
    useMediaPlayerStore.getState().resetMediaBrowseRoot('C:\\Media\\Work')
    const state = useMediaPlayerStore.getState()
    expect(state.mediaBrowsePath).toBe('C:\\Media\\Work')
    expect(state.mediaBrowseHistory).toEqual(['C:\\Media\\Work'])
    expect(state.mediaBrowseHistoryIndex).toBe(0)
  })

  it('navigateMediaBrowseTo then mediaBrowseGoBack returns to the previous path', () => {
    const store = useMediaPlayerStore.getState()
    store.resetMediaBrowseRoot('C:\\Media\\Work')
    useMediaPlayerStore.getState().navigateMediaBrowseTo('C:\\Media\\Work\\mp3')
    expect(useMediaPlayerStore.getState().mediaBrowsePath).toBe('C:\\Media\\Work\\mp3')

    useMediaPlayerStore.getState().mediaBrowseGoBack()
    expect(useMediaPlayerStore.getState().mediaBrowsePath).toBe('C:\\Media\\Work')
  })

  it('mediaBrowseGoForward re-advances after going back', () => {
    useMediaPlayerStore.getState().resetMediaBrowseRoot('C:\\Media\\Work')
    useMediaPlayerStore.getState().navigateMediaBrowseTo('C:\\Media\\Work\\mp3')
    useMediaPlayerStore.getState().mediaBrowseGoBack()
    useMediaPlayerStore.getState().mediaBrowseGoForward()
    expect(useMediaPlayerStore.getState().mediaBrowsePath).toBe('C:\\Media\\Work\\mp3')
  })

  it('mediaBrowseGoBack on empty history is a no-op and does not throw', () => {
    const initialPath = useMediaPlayerStore.getState().mediaBrowsePath
    expect(() => {
      useMediaPlayerStore.getState().mediaBrowseGoBack()
    }).not.toThrow()
    const state = useMediaPlayerStore.getState()
    expect(state.mediaBrowsePath).toBe(initialPath)
    expect(state.mediaBrowsePath).toBe(null)
  })

  it('mediaBrowseGoForward on empty history is a no-op and does not throw', () => {
    const initialPath = useMediaPlayerStore.getState().mediaBrowsePath
    expect(() => {
      useMediaPlayerStore.getState().mediaBrowseGoForward()
    }).not.toThrow()
    const state = useMediaPlayerStore.getState()
    expect(state.mediaBrowsePath).toBe(initialPath)
    expect(state.mediaBrowsePath).toBe(null)
  })

  it('resetMediaBrowseRoot is idempotent - calling with same root leaves current sub-navigation unchanged', () => {
    // First, set up the root
    useMediaPlayerStore.getState().resetMediaBrowseRoot('C:\\Media\\Work')
    // Then navigate to a subfolder (e.g., via tree-node click)
    useMediaPlayerStore.getState().navigateMediaBrowseTo('C:\\Media\\Work\\mp3')
    expect(useMediaPlayerStore.getState().mediaBrowsePath).toBe('C:\\Media\\Work\\mp3')
    const historyBeforeResetAgain = [...useMediaPlayerStore.getState().mediaBrowseHistory]
    const indexBeforeResetAgain = useMediaPlayerStore.getState().mediaBrowseHistoryIndex
    // Now call resetMediaBrowseRoot with the same root again (simulating MediaPage remount)
    useMediaPlayerStore.getState().resetMediaBrowseRoot('C:\\Media\\Work')
    // The path should remain unchanged at the subfolder
    const state = useMediaPlayerStore.getState()
    expect(state.mediaBrowsePath).toBe('C:\\Media\\Work\\mp3')
    expect(state.mediaBrowseHistory).toEqual(historyBeforeResetAgain)
    expect(state.mediaBrowseHistoryIndex).toBe(indexBeforeResetAgain)
  })

  it('resetMediaBrowseRoot resets when the root genuinely changes', () => {
    // Set up initial root and navigate to a subfolder
    useMediaPlayerStore.getState().resetMediaBrowseRoot('C:\\Media\\Work')
    useMediaPlayerStore.getState().navigateMediaBrowseTo('C:\\Media\\Work\\mp3')
    expect(useMediaPlayerStore.getState().mediaBrowsePath).toBe('C:\\Media\\Work\\mp3')
    // Now reset to a different root (e.g., ASMR folder change)
    useMediaPlayerStore.getState().resetMediaBrowseRoot('C:\\Media\\ASMR')
    // The path should be reset to the new root
    const state = useMediaPlayerStore.getState()
    expect(state.mediaBrowsePath).toBe('C:\\Media\\ASMR')
    expect(state.mediaBrowseHistory).toEqual(['C:\\Media\\ASMR'])
    expect(state.mediaBrowseHistoryIndex).toBe(0)
  })
})
