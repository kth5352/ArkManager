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

describe('useMediaPlayerStore appendAndPlay', () => {
  beforeEach(() => {
    useMediaPlayerStore.setState({
      playlist: [
        { path: 'C:/a.mp3', name: 'a' },
        { path: 'C:/b.mp3', name: 'b' },
      ],
      currentIndex: 0,
      isPlaying: false,
    })
  })

  it('appends a new track to the end of the existing playlist and plays it', () => {
    useMediaPlayerStore.getState().appendAndPlay({ path: 'C:/c.mp3', name: 'c' })
    const state = useMediaPlayerStore.getState()
    expect(state.playlist.map((t) => t.name)).toEqual(['a', 'b', 'c'])
    expect(state.currentIndex).toBe(2)
    expect(state.isPlaying).toBe(true)
  })

  it('jumps to an already-queued track instead of duplicating it', () => {
    useMediaPlayerStore.getState().appendAndPlay({ path: 'C:/b.mp3', name: 'b' })
    const state = useMediaPlayerStore.getState()
    expect(state.playlist.map((t) => t.name)).toEqual(['a', 'b'])
    expect(state.currentIndex).toBe(1)
    expect(state.isPlaying).toBe(true)
  })

  it('works on an empty playlist (behaves like playNow for the first track)', () => {
    useMediaPlayerStore.setState({ playlist: [], currentIndex: null, isPlaying: false })
    useMediaPlayerStore.getState().appendAndPlay({ path: 'C:/a.mp3', name: 'a' })
    const state = useMediaPlayerStore.getState()
    expect(state.playlist).toEqual([{ path: 'C:/a.mp3', name: 'a' }])
    expect(state.currentIndex).toBe(0)
    expect(state.isPlaying).toBe(true)
  })
})

describe('useMediaPlayerStore playNext', () => {
  beforeEach(() => {
    useMediaPlayerStore.setState({
      playlist: [
        { path: 'C:/a.mp3', name: 'a' },
        { path: 'C:/b.mp3', name: 'b' },
        { path: 'C:/c.mp3', name: 'c' },
      ],
      currentIndex: 0,
      isPlaying: false,
    })
  })

  it('inserts the track right after the currently playing one, without changing playback', () => {
    useMediaPlayerStore.getState().playNext({ path: 'C:/x.mp3', name: 'x' })
    const state = useMediaPlayerStore.getState()
    expect(state.playlist.map((t) => t.name)).toEqual(['a', 'x', 'b', 'c'])
    expect(state.currentIndex).toBe(0)
    expect(state.isPlaying).toBe(false)
  })

  it('inserts after the current track even when the current track is not first', () => {
    useMediaPlayerStore.setState({ currentIndex: 1 })
    useMediaPlayerStore.getState().playNext({ path: 'C:/x.mp3', name: 'x' })
    const state = useMediaPlayerStore.getState()
    expect(state.playlist.map((t) => t.name)).toEqual(['a', 'b', 'x', 'c'])
    expect(state.currentIndex).toBe(1)
  })

  it('does nothing when the track is already queued', () => {
    useMediaPlayerStore.getState().playNext({ path: 'C:/c.mp3', name: 'c' })
    const state = useMediaPlayerStore.getState()
    expect(state.playlist.map((t) => t.name)).toEqual(['a', 'b', 'c'])
  })

  it('adds and immediately plays the track when the queue is empty', () => {
    useMediaPlayerStore.setState({ playlist: [], currentIndex: null, isPlaying: false })
    useMediaPlayerStore.getState().playNext({ path: 'C:/x.mp3', name: 'x' })
    const state = useMediaPlayerStore.getState()
    expect(state.playlist).toEqual([{ path: 'C:/x.mp3', name: 'x' }])
    expect(state.currentIndex).toBe(0)
    expect(state.isPlaying).toBe(true)
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

describe('useMediaPlayerStore selectedPlaylistId clearing (C1/NEW-1 regression)', () => {
  beforeEach(() => {
    useMediaPlayerStore.setState({
      selectedPlaylistId: 'some-playlist-id',
      mediaBrowsePath: null,
      mediaBrowseHistory: [],
      mediaBrowseHistoryIndex: 0,
    })
  })

  it('navigateMediaBrowseTo clears a stuck selectedPlaylistId, so folder browsing (FolderTreeTab.handleNavigate) is never silently swallowed behind a stale PlaylistDetailView', () => {
    useMediaPlayerStore.getState().navigateMediaBrowseTo('C:\\Media\\Work')
    expect(useMediaPlayerStore.getState().selectedPlaylistId).toBe(null)
  })

  // NEW-1: resetMediaBrowseRoot must NOT touch selectedPlaylistId at all -
  // its only caller is MediaPage.tsx's mount-time sync effect, which fires
  // on EVERY mount of MediaPage, including the one frame a sidebar
  // playlist-row click produces (navigateToPlaylistDetail then
  // navigate({to:'/media'}) mounts MediaPage fresh). Round 1 had this clear
  // selectedPlaylistId on both branches, which closed a just-opened
  // PlaylistDetailView on its very first render - a regression worse than
  // the original C1 bug. usePlayAsmrFolder now clears selectedPlaylistId
  // itself via closePlaylistDetail() when it actually wants folder-browsing.
  it('resetMediaBrowseRoot does NOT clear selectedPlaylistId when the root genuinely changes (its normal-reset branch)', () => {
    useMediaPlayerStore.getState().resetMediaBrowseRoot('C:\\Media\\ASMR')
    expect(useMediaPlayerStore.getState().selectedPlaylistId).toBe('some-playlist-id')
  })

  it('resetMediaBrowseRoot does NOT clear selectedPlaylistId on its idempotent same-root early-return path - this is the exact MediaPage remount regression case', () => {
    useMediaPlayerStore.setState({ mediaBrowseHistory: ['C:\\Media\\Work'] })
    useMediaPlayerStore.getState().resetMediaBrowseRoot('C:\\Media\\Work')
    expect(useMediaPlayerStore.getState().selectedPlaylistId).toBe('some-playlist-id')
  })

  it('resetMediaBrowseRoot never closes an open playlist detail, even across repeated mount-effect calls with the same root (simulating MediaPage remounting while a sidebar playlist row is selected)', () => {
    useMediaPlayerStore.setState({ mediaBrowseHistory: ['C:\\Media\\Work'], mediaBrowsePath: 'C:\\Media\\Work' })
    useMediaPlayerStore.getState().resetMediaBrowseRoot('C:\\Media\\Work')
    useMediaPlayerStore.getState().resetMediaBrowseRoot('C:\\Media\\Work')
    expect(useMediaPlayerStore.getState().selectedPlaylistId).toBe('some-playlist-id')
  })
})
