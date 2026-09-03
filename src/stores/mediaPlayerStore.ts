import { create } from 'zustand'
import { generateShuffleOrderKeepingFront, generateShuffleOrderAvoidingFront } from './shuffleOrder'
import {
  navigateBrowseHistory,
  goBackInHistory,
  goForwardInHistory,
  resetBrowseHistory,
} from '../lib/mediaBrowseHistory'

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
export type MediaSidebarTab = 'playlists' | 'queue' | 'lyrics' | 'folder'

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
  // (useMediaPlayback's window.api.mpv.onEnded subscription, which loops the
  // track in place with seek(0) + play() - not next()/prev(), since a skip
  // button press should always move to the adjacent track regardless of this
  // mode, matching every other media player's convention; only a track
  // ending naturally loops it). 'off' vs 'all' is this store's own concern:
  // `next` stops instead of wrapping past the last track when off.
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
  // Whether this window is currently showing FullscreenMediaOverlay (not
  // synced cross-window via useMediaPlayerSync's toSyncState - each window's
  // own fullscreen/minimized state is independent, this is purely local
  // per-window UI state that just needs to be readable outside
  // MediaPlayerHost.tsx, which owns the actual expand/minimize logic).
  // AppLayout.tsx reads this (together with mediaFullscreenBarHeight below)
  // to reserve real flow space for the fullscreen transport bar - without
  // it, MediaSidebar's h-full would expand to the full app height while
  // fullscreen is showing (FullscreenMediaOverlay is `fixed`, so
  // MediaPlayerHost contributes zero flow height then) and visually extend
  // down past where the bar actually is.
  mediaExpanded: boolean
  setMediaExpanded: (expanded: boolean) => void
  // Real measured height (px) of FullscreenMediaOverlay's bottom transport
  // bar, reported via a ResizeObserver in that component - not a hardcoded
  // guess, so a future content/padding change there can't silently desync
  // from whatever AppLayout.tsx reserves space for. 0 until first measured.
  mediaFullscreenBarHeight: number
  setMediaFullscreenBarHeight: (height: number) => void
  // PIP 자막 창이 지금 떠 있는지 - 메인 프로세스가 진실 공급원(항상 최대 1개만
  // 존재 가능, MediaPlayerHost.tsx가 subtitle-pip:opened/closed 알림을 구독해
  // 이 필드에 반영한다)이므로, 도킹바와 자막 로그 탭 두 토글 버튼이 항상 같은
  // 상태를 보여줄 수 있다.
  subtitlePipOpen: boolean
  setSubtitlePipOpen: (open: boolean) => void
  // Which MediaSidebar tab is active. Defaults to 'playlists' (changed from
  // the original Task 3 brief's queue-first default) - now that the sidebar
  // can genuinely open with nothing playing (AppLayout.tsx no longer gates
  // it on hasActiveTrack, see that file's own comment), defaulting to
  // 'queue' would greet a first-open user with the queue tab's empty
  // "재생목록이 없습니다." state instead of the one tab that's always useful
  // regardless of playback state: managing saved playlists. Unlike
  // ExplorerTreeOpen/DetailSidebar's own persisted state, this still isn't
  // persisted across restarts, only whether the sidebar itself is
  // open/closed (useMediaSidebarOpenQuery) and its width are.
  sidebarActiveTab: MediaSidebarTab
  setSidebarActiveTab: (tab: MediaSidebarTab) => void
  // 사이드바에서 재생목록 행을 클릭했을 때 MediaPage.tsx가 폴더 브라우징
  // 대신 PlaylistDetailView를 렌더링하도록 하는 토글 - mediaBrowsePath(폴더
  // 탐색)와 완전히 독립적이다. "찾아 들어가는" 개념이 아니라 열림/닫힘
  // 하나짜리 상태라 히스토리 스택이 없다.
  selectedPlaylistId: string | null
  navigateToPlaylistDetail: (playlistId: string) => void
  closePlaylistDetail: () => void
  // Cache-busting counter per playlist id for computePlaylistThumbnailSource's
  // cover URL (see playlistThumbnailSources.ts) - lives here, not as
  // component-local useState, for two reasons (I1 re-review gaps): (1)
  // PlaylistManagementTab.tsx's UserPlaylistRow renders the same playlist's
  // thumbnail in the sidebar and needs to see the same bumped value
  // PlaylistDetailView produces, and (2) PlaylistDetailView itself unmounts
  // whenever the user backs out (closePlaylistDetail) and remounts fresh the
  // next time the playlist is opened - local state would reset to 0 and
  // land back on the exact stale cached URL the bump exists to avoid. Keyed
  // by playlist id (rather than a single counter) so bumping one playlist's
  // cover doesn't invalidate every other playlist's already-correct <img>.
  // Absent entries read as 0 via the `?? 0` at each call site, matching
  // computePlaylistThumbnailSource's own default.
  coverVersions: Record<string, number>
  bumpPlaylistCoverVersion: (playlistId: string) => void
  // AppLayout.tsx(MediaSidebar의 새 "폴더" 탭)와 MediaPage.tsx가 서로 다른
  // 트리 위치에서 같은 폴더 탐색 위치/히스토리를 공유해야 하므로, 여기 store에
  // 올린다 - sidebarActiveTab과 같은 이유. mediaBrowseHistory/-Index는
  // src/lib/mediaBrowseHistory.ts의 순수 로직으로 갱신된다.
  mediaBrowsePath: string | null
  mediaBrowseHistory: string[]
  mediaBrowseHistoryIndex: number
  navigateMediaBrowseTo: (path: string) => void
  mediaBrowseGoBack: () => void
  mediaBrowseGoForward: () => void
  resetMediaBrowseRoot: (rootPath: string) => void
  // Bridges playback's live currentTime/handleSeek (both tied to the actual
  // mounted <video>/<audio> element, which only exists inside
  // MediaPlayerHost's single useMediaPlayback() call) across the tree
  // boundary to LyricsLogTab, which AppLayout.tsx now renders as a sibling
  // of MediaPlayerHost rather than a descendant of it - same cross-tree
  // reasoning as sidebarActiveTab above, just for playback position instead
  // of UI tab state. Unlike sidebarActiveTab (genuinely shared UI state),
  // these two are a one-way bridge: MediaPlayerHost is the sole writer
  // (via an effect syncing playback.currentTime/handleSeek into the store),
  // LyricsLogTab the sole reader. parsedLyrics itself does NOT need this
  // treatment - it's a pure derivation from useMediaLyrics (keyed by track
  // path), so LyricsLogTab just calls that hook again itself; TanStack
  // Query dedupes the identical query key against MediaPlayerHost's own
  // call, so this isn't a duplicate fetch.
  playbackCurrentTime: number
  setPlaybackCurrentTime: (time: number) => void
  seekPlayback: (value: number) => void
  setSeekPlayback: (fn: (value: number) => void) => void
  // Plays `track` immediately. `siblings` (when given, e.g. the other media
  // files in the same folder) replaces the whole playlist so next/prev walk
  // through them in listing order; omitted, the playlist becomes just this
  // one track (the dedicated Media page's "바로 재생" case).
  playNow: (track: MediaTrack, siblings?: MediaTrack[]) => void
  // 큐를 통째로 교체하는 playNow와 달리, 기존 큐는 그대로 두고 이 트랙 하나만
  // 끝에 추가(이미 큐에 있으면 새로 추가하지 않고 그 자리로 점프)한 뒤
  // 재생을 전환한다 - MediaPage.tsx에서 파일 목록의 트랙 하나를 클릭했을 때
  // 쓰는 것으로, "이 폴더 전체를 새 큐로 열기"가 의도인 playNow와는 다른
  // 시맨틱이다.
  appendAndPlay: (track: MediaTrack) => void
  addToPlaylist: (tracks: MediaTrack[]) => void
  // addToPlaylist가 큐 끝에 추가하는 것과 달리, 현재 재생 중인 트랙(currentIndex)
  // 바로 다음 자리에 삽입한다 - 재생을 전환하지 않고 순서만 예약. 큐가 비어있으면
  // (currentIndex === null) "다음"이라는 개념 자체가 없으므로 appendAndPlay처럼
  // 즉시 재생 시작. 이미 큐에 있는 트랙이면 addToPlaylist와 동일하게 아무 것도
  // 하지 않는다(중복 삽입 방지).
  playNext: (track: MediaTrack) => void
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
  setDetached: (isDetached: boolean) => void
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
  mediaExpanded: false,
  setMediaExpanded: (expanded) => set({ mediaExpanded: expanded }),
  mediaFullscreenBarHeight: 0,
  setMediaFullscreenBarHeight: (height) => set({ mediaFullscreenBarHeight: height }),
  subtitlePipOpen: false,
  setSubtitlePipOpen: (open) => set({ subtitlePipOpen: open }),
  sidebarActiveTab: 'playlists',
  setSidebarActiveTab: (tab) => set({ sidebarActiveTab: tab }),
  selectedPlaylistId: null,
  navigateToPlaylistDetail: (playlistId) => set({ selectedPlaylistId: playlistId }),
  closePlaylistDetail: () => set({ selectedPlaylistId: null }),
  coverVersions: {},
  bumpPlaylistCoverVersion: (playlistId) =>
    set((state) => ({
      coverVersions: { ...state.coverVersions, [playlistId]: (state.coverVersions[playlistId] ?? 0) + 1 },
    })),
  mediaBrowsePath: null,
  mediaBrowseHistory: [],
  mediaBrowseHistoryIndex: 0,
  navigateMediaBrowseTo: (path) =>
    set((state) => {
      const next = navigateBrowseHistory(
        { entries: state.mediaBrowseHistory, index: state.mediaBrowseHistoryIndex },
        path
      )
      return {
        mediaBrowsePath: path,
        mediaBrowseHistory: next.entries,
        mediaBrowseHistoryIndex: next.index,
        // Switching to folder-browsing means the Media tab should show the
        // folder browser, not a stale PlaylistDetailView left open from a
        // previous playlist click (see selectedPlaylistId's own comment) -
        // without this, FolderTreeTab's handleNavigate and
        // usePlayAsmrFolder both silently update browse state behind the
        // still-mounted playlist detail screen.
        selectedPlaylistId: null,
      }
    }),
  mediaBrowseGoBack: () =>
    set((state) => {
      const next = goBackInHistory({ entries: state.mediaBrowseHistory, index: state.mediaBrowseHistoryIndex })
      if (next.entries.length === 0) return {}
      return { mediaBrowsePath: next.entries[next.index], mediaBrowseHistoryIndex: next.index }
    }),
  mediaBrowseGoForward: () =>
    set((state) => {
      const next = goForwardInHistory({ entries: state.mediaBrowseHistory, index: state.mediaBrowseHistoryIndex })
      if (next.entries.length === 0) return {}
      return { mediaBrowsePath: next.entries[next.index], mediaBrowseHistoryIndex: next.index }
    }),
  // Deliberately does NOT touch selectedPlaylistId (unlike
  // navigateMediaBrowseTo below) - this is called from MediaPage.tsx's
  // mount-time sync effect on EVERY mount of MediaPage, including the one
  // frame a sidebar playlist-row click produces (navigateToPlaylistDetail
  // then navigate({to:'/media'}) mounts MediaPage fresh). Clearing
  // selectedPlaylistId here would immediately close a PlaylistDetailView the
  // user just opened, before it ever got a chance to render. Callers that
  // actually want the Media tab to fall back to folder-browsing (e.g.
  // usePlayAsmrFolder) must clear selectedPlaylistId themselves via
  // closePlaylistDetail().
  resetMediaBrowseRoot: (rootPath) =>
    set((state) => {
      if (state.mediaBrowseHistory[0] === rootPath) return {}
      const next = resetBrowseHistory(rootPath)
      return {
        mediaBrowsePath: rootPath,
        mediaBrowseHistory: next.entries,
        mediaBrowseHistoryIndex: next.index,
      }
    }),
  playbackCurrentTime: 0,
  setPlaybackCurrentTime: (time) => set({ playbackCurrentTime: time }),
  // No-op default so LyricsLogTab's onSeek is always safe to call even
  // before MediaPlayerHost's effect has registered the real handleSeek (or
  // after playback has emptied out and it registers a no-op again - see
  // MediaPlayerHost's sync effect).
  seekPlayback: () => {},
  setSeekPlayback: (fn) => set({ seekPlayback: fn }),
  repeatMode: 'off',
  shuffleMode: false,
  shuffleOrder: [],
  shufflePosition: 0,

  playNow: (track, siblings) => {
    const list = siblings ?? [track]
    const index = list.findIndex((t) => t.path === track.path)
    set({ playlist: list, currentIndex: index === -1 ? 0 : index, isPlaying: true })
  },

  appendAndPlay: (track) => {
    const { playlist } = get()
    const existingIndex = playlist.findIndex((t) => t.path === track.path)
    if (existingIndex !== -1) {
      set({ currentIndex: existingIndex, isPlaying: true })
      return
    }
    const nextPlaylist = [...playlist, track]
    set({ playlist: nextPlaylist, currentIndex: nextPlaylist.length - 1, isPlaying: true })
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

  playNext: (track) => {
    const { playlist, currentIndex } = get()
    if (playlist.some((t) => t.path === track.path)) return
    if (currentIndex === null) {
      set({ playlist: [...playlist, track], currentIndex: playlist.length, isPlaying: true })
      return
    }
    const insertAt = currentIndex + 1
    const nextPlaylist = [...playlist.slice(0, insertAt), track, ...playlist.slice(insertAt)]
    set({ playlist: nextPlaylist })
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

  setDetached: (isDetached) => set({ isDetached }),

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
