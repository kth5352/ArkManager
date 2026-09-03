import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC_CHANNELS,
  type BulkCrawlProgressDto,
  type DeleteResultDto,
  type ExcludedEntryDto,
  type GameMetadataDto,
  type GameUserDataDto,
  type GameWithSavePathDto,
  type LaunchConfigDto,
  type Library,
  type LibraryWithStatus,
  type Locale,
  type MediaPlaylistDto,
  type MediaPlaylistTrackDto,
  type MediaSyncState,
  type SubtitleLinePayload,
  type MetadataSearchResultDto,
  type MetadataSearchSource,
  type MetadataFailureDto,
  type MoveResultDto,
  type MpvStateUpdate,
  type PersistedExplorerTab,
  type RenameResultDto,
  type SaveDiffEntryDto,
  type SaveSnapshotDto,
  type SetMediaThumbnailFromFileResult,
  type SortPage,
  type SortPreference,
  type Theme,
  type UpdateStatus,
  type VersionMismatchDto,
  type WindowCloseBehavior,
} from '../../shared/types/ipc'
import type { GameCode, ScannedEntry } from '../../shared/types/scanner'

const api = {
  settings: {
    getTheme: (): Promise<Theme | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'theme' }),
    setTheme: (value: Theme): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'theme', value }),
    getWindowCloseBehavior: (): Promise<WindowCloseBehavior | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'window-close-behavior' }),
    setWindowCloseBehavior: (value: WindowCloseBehavior): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'window-close-behavior', value }),
    // Synchronous IPC round-trip used only to apply the persisted theme
    // before the renderer's first paint (see src/main.tsx). Do not use this
    // for anything else - prefer the async getTheme/setTheme above.
    getThemeSync: (): Theme | null =>
      ipcRenderer.sendSync(IPC_CHANNELS.SETTINGS_GET_SYNC) as Theme | null,
    getSidebarWidth: (): Promise<number | null> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'sidebar-width' })
        .then((value: string | null) => (value === null ? null : Number(value))),
    setSidebarWidth: (width: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'sidebar-width', value: String(width) }),
    getExplorerTreeOpen: (): Promise<boolean | null> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'explorer-tree-open' })
        .then((value: string | null) => (value === null ? null : value === 'true')),
    setExplorerTreeOpen: (open: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, {
        key: 'explorer-tree-open',
        value: String(open),
      }),
    getExplorerTreeWidth: (): Promise<number | null> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'explorer-tree-width' })
        .then((value: string | null) => (value === null ? null : Number(value))),
    setExplorerTreeWidth: (width: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, {
        key: 'explorer-tree-width',
        value: String(width),
      }),
    getLocaleEmulatorPath: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'locale-emulator-path' }),
    setLocaleEmulatorPath: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'locale-emulator-path', value: path }),
    getMediaSidebarOpen: (): Promise<boolean | null> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'media-sidebar-open' })
        .then((value: string | null) => (value === null ? null : value === 'true')),
    setMediaSidebarOpen: (open: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, {
        key: 'media-sidebar-open',
        value: String(open),
      }),
    getMediaSidebarWidth: (): Promise<number | null> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'media-sidebar-width' })
        .then((value: string | null) => (value === null ? null : Number(value))),
    setMediaSidebarWidth: (width: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, {
        key: 'media-sidebar-width',
        value: String(width),
      }),
    getMediaViewMode: (): Promise<'list' | 'grid' | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'media-view-mode' }),
    setMediaViewMode: (mode: 'list' | 'grid'): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'media-view-mode', value: mode }),
    getMediaVolume: (): Promise<number | null> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'media-volume' })
        .then((value: string | null) => (value === null ? null : Number(value))),
    setMediaVolume: (volume: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'media-volume', value: String(volume) }),
    getLocale: (): Promise<Locale | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'locale' }),
    setLocale: (value: Locale): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'locale', value }),
    getMediaFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'media-folder' }),
    setMediaFolder: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'media-folder', value: path }),
    getExternalMetadataProviderEnabled: (): Promise<boolean> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'external-metadata-provider-enabled' })
        .then((value: string | null) => value === 'true'),
    setExternalMetadataProviderEnabled: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, {
        key: 'external-metadata-provider-enabled',
        value: String(enabled),
      }),
    getExternalMetadataProviderUrl: (): Promise<string> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'external-metadata-provider-url' })
        .then((value: string | null) => value ?? ''),
    setExternalMetadataProviderUrl: (url: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, {
        key: 'external-metadata-provider-url',
        value: url,
      }),
    getExternalMetadataProviderApiKey: (): Promise<string> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'external-metadata-provider-api-key' })
        .then((value: string | null) => value ?? ''),
    setExternalMetadataProviderApiKey: (apiKey: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, {
        key: 'external-metadata-provider-api-key',
        value: apiKey,
      }),
  },
  libraries: {
    list: (): Promise<LibraryWithStatus[]> => ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_LIST),
    add: (name: string, path: string): Promise<Library> =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_ADD, { name, path }),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_REMOVE, { id }),
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_PICK_FOLDER),
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  },
  scanner: {
    scanRecursive: (libraryPaths: string[]): Promise<ScannedEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCANNER_SCAN_RECURSIVE, { libraryPaths }),
    scanShallow: (dirPath: string): Promise<ScannedEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCANNER_SCAN_SHALLOW, { dirPath }),
    // Subscribes to live progress updates for whichever SCANNER_SCAN_RECURSIVE
    // request is currently in flight (see scannerHandlers.ts) - returns an
    // unsubscribe function. There is no request id: this app only ever runs
    // one recursive scan at a time in practice, so a listener just reflects
    // "the scan currently running", not necessarily the caller's own request.
    onScanProgress: (callback: (scanned: number) => void): (() => void) => {
      const listener = (_event: unknown, payload: { scanned: number }): void =>
        callback(payload.scanned)
      ipcRenderer.on(IPC_CHANNELS.SCANNER_SCAN_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SCANNER_SCAN_PROGRESS, listener)
    },
  },
  explorerTabs: {
    save: (tabs: PersistedExplorerTab[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_SAVE_TABS, { tabs }),
    load: (): Promise<PersistedExplorerTab[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_LOAD_TABS),
  },
  fileOps: {
    renameEntries: (renames: { path: string; newName: string }[]): Promise<RenameResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_RENAME_ENTRIES, { renames }),
    deleteEntries: (paths: string[]): Promise<DeleteResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_DELETE_ENTRIES, { paths }),
    pickMoveDestination: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_PICK_MOVE_DESTINATION),
    moveEntries: (paths: string[], destDir: string): Promise<MoveResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_MOVE_ENTRIES, { paths, destDir }),
  },
  sort: {
    get: (page: SortPage): Promise<SortPreference | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SORT_GET, { page }),
    set: (
      page: SortPage,
      field: SortPreference['field'],
      direction: SortPreference['direction']
    ): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.SORT_SET, { page, field, direction }),
  },
  shell: {
    openExternal: (code: GameCode): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, { code }),
    showItemInFolder: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, { path }),
    openPath: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_PATH, { path }),
  },
  metadata: {
    crawlAndSave: (code: GameCode): Promise<GameMetadataDto | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_CRAWL_AND_SAVE, { code }),
    get: (code: GameCode): Promise<GameMetadataDto | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_GET, { code }),
    getFailure: (code: GameCode): Promise<MetadataFailureDto | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_GET_FAILURE, { code }),
    getMany: (codes: string[]): Promise<Record<string, GameMetadataDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_GET_MANY, { codes }),
    getCoverImage: (code: GameCode): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_GET_COVER_IMAGE, { code }),
    search: (source: MetadataSearchSource, query: string): Promise<MetadataSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH, { source, query }),
    crawlMissing: (codes: GameCode[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_CRAWL_MISSING, { codes }),
    // See scanner.onScanProgress - same shape (subscribe, return an
    // unsubscribe function), no request id: there's only ever one bulk crawl
    // queue for the whole app.
    onBulkCrawlProgress: (callback: (progress: BulkCrawlProgressDto) => void): (() => void) => {
      const listener = (_event: unknown, payload: BulkCrawlProgressDto): void => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.METADATA_BULK_CRAWL_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.METADATA_BULK_CRAWL_PROGRESS, listener)
    },
  },
  gameUserData: {
    get: (code: GameCode | null, path: string): Promise<GameUserDataDto | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_GET, { identifier: { code, path } }),
    setFavorite: (code: GameCode | null, path: string, isFavorite: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_SET_FAVORITE, {
        identifier: { code, path },
        isFavorite,
      }),
    setCleared: (code: GameCode | null, path: string, isCleared: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_SET_CLEARED, {
        identifier: { code, path },
        isCleared,
      }),
    setRatingAndMemo: (
      code: GameCode | null,
      path: string,
      rating: number | null,
      memo: string | null
    ): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_SET_RATING_AND_MEMO, {
        identifier: { code, path },
        rating,
        memo,
      }),
    listFavoriteKeys: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_LIST_FAVORITE_KEYS),
    listRecentlyPlayed: (): Promise<{ key: string; lastPlayedAt: string }[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_LIST_RECENTLY_PLAYED),
    linkCode: (path: string, code: GameCode): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_LINK_CODE, { path, code }),
    unlinkCode: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_UNLINK_CODE, { path }),
    pickCustomCoverFile: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_PICK_CUSTOM_COVER_FILE),
    setCustomCoverFromFile: (
      code: GameCode | null,
      path: string,
      sourcePath: string
    ): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_SET_CUSTOM_COVER_FROM_FILE, {
        identifier: { code, path },
        path: sourcePath,
      }),
    setCustomCoverFromClipboard: (code: GameCode | null, path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_SET_CUSTOM_COVER_FROM_CLIPBOARD, {
        identifier: { code, path },
      }),
    clearCustomCover: (code: GameCode | null, path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_CLEAR_CUSTOM_COVER, {
        identifier: { code, path },
      }),
    getCustomCoverImage: (code: GameCode | null, path: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_GET_CUSTOM_COVER_IMAGE, {
        identifier: { code, path },
      }),
  },
  gameEntry: {
    exclude: (path: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_ENTRY_EXCLUDE, { path, name }),
    restore: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_ENTRY_RESTORE, { path }),
    listExcluded: (): Promise<ExcludedEntryDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_ENTRY_LIST_EXCLUDED),
    onOpenExcludedEntriesDialog: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC_CHANNELS.MENU_OPEN_EXCLUDED_ENTRIES_DIALOG, listener)
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.MENU_OPEN_EXCLUDED_ENTRIES_DIALOG, listener)
    },
  },
  launch: {
    listExecutables: (folderPath: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_LIST_EXECUTABLES, { folderPath }),
    isLocaleEmulatorAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_IS_LOCALE_EMULATOR_AVAILABLE),
    pickLocaleEmulatorPath: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_PICK_LOCALE_EMULATOR_PATH),
    setConfig: (code: GameCode | null, path: string, config: LaunchConfigDto): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_SET_CONFIG, { identifier: { code, path }, config }),
    launch: (code: GameCode | null, path: string): Promise<{ sessionMs: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_GAME, { identifier: { code, path } }),
  },
  save: {
    pickFolder: (startPath: string | null): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_PICK_FOLDER, { startPath }),
    setPath: (code: GameCode | null, path: string, savePath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_SET_PATH, { identifier: { code, path }, savePath }),
    listSnapshots: (code: GameCode | null, path: string): Promise<SaveSnapshotDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_LIST_SNAPSHOTS, { identifier: { code, path } }),
    createSnapshot: (code: GameCode | null, path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_CREATE_SNAPSHOT, { identifier: { code, path } }),
    restoreSnapshot: (code: GameCode | null, path: string, timestamp: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_RESTORE_SNAPSHOT, {
        identifier: { code, path },
        timestamp,
      }),
    diff: (
      code: GameCode | null,
      path: string,
      timestamp: string | null
    ): Promise<SaveDiffEntryDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_DIFF, { identifier: { code, path }, timestamp }),
    listGamesWithSavePath: (): Promise<GameWithSavePathDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_LIST_GAMES_WITH_SAVE_PATH),
    setSnapshotLabel: (
      code: GameCode | null,
      path: string,
      timestamp: string,
      updates: { memo?: string; version?: string }
    ): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_SET_SNAPSHOT_LABEL, {
        identifier: { code, path },
        timestamp,
        ...updates,
      }),
    deleteSnapshot: (code: GameCode | null, path: string, timestamp: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_DELETE_SNAPSHOT, {
        identifier: { code, path },
        timestamp,
      }),
    deleteAllSnapshots: (code: GameCode | null, path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_DELETE_ALL_SNAPSHOTS, { identifier: { code, path } }),
    showSnapshotInFolder: (code: GameCode | null, path: string, timestamp: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_SHOW_SNAPSHOT_IN_FOLDER, {
        identifier: { code, path },
        timestamp,
      }),
    checkVersionMismatch: (
      code: GameCode | null,
      path: string,
      timestamp: string
    ): Promise<VersionMismatchDto> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_CHECK_VERSION_MISMATCH, {
        identifier: { code, path },
        timestamp,
      }),
  },
  media: {
    openPlayerWindow: (initialState: MediaSyncState): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_OPEN_PLAYER_WINDOW, initialState),
    broadcastState: (state: MediaSyncState): void =>
      ipcRenderer.send(IPC_CHANNELS.MEDIA_STATE_BROADCAST, state),
    onStateSync: (callback: (state: MediaSyncState) => void): (() => void) => {
      const listener = (_event: unknown, state: MediaSyncState): void => callback(state)
      ipcRenderer.on(IPC_CHANNELS.MEDIA_STATE_SYNC, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MEDIA_STATE_SYNC, listener)
    },
    requestStateSync: (): void => ipcRenderer.send(IPC_CHANNELS.MEDIA_REQUEST_STATE_SYNC),
    onStateSyncRequested: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC_CHANNELS.MEDIA_STATE_SYNC_REQUESTED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MEDIA_STATE_SYNC_REQUESTED, listener)
    },
    onPlayerWindowClosed: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC_CHANNELS.MEDIA_PLAYER_WINDOW_CLOSED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MEDIA_PLAYER_WINDOW_CLOSED, listener)
    },
    openSubtitlePipWindow: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.SUBTITLE_PIP_OPEN),
    closeSubtitlePipWindow: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SUBTITLE_PIP_CLOSE),
    onSubtitlePipOpened: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC_CHANNELS.SUBTITLE_PIP_OPENED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SUBTITLE_PIP_OPENED, listener)
    },
    onSubtitlePipClosed: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC_CHANNELS.SUBTITLE_PIP_CLOSED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SUBTITLE_PIP_CLOSED, listener)
    },
    broadcastSubtitleLine: (payload: SubtitleLinePayload): void =>
      ipcRenderer.send(IPC_CHANNELS.SUBTITLE_PIP_LINE_UPDATE, payload),
    onSubtitlePipLineUpdate: (callback: (payload: SubtitleLinePayload) => void): (() => void) => {
      const listener = (_event: unknown, payload: SubtitleLinePayload): void => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.SUBTITLE_PIP_LINE_UPDATE, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SUBTITLE_PIP_LINE_UPDATE, listener)
    },
    checkNeedsRemux: (filePath: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_CHECK_NEEDS_REMUX, { filePath }),
  },
  mediaPlaylist: {
    list: (): Promise<MediaPlaylistDto[]> => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PLAYLIST_LIST),
    create: (name: string): Promise<MediaPlaylistDto> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PLAYLIST_CREATE, { name }),
    rename: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PLAYLIST_RENAME, { id, name }),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PLAYLIST_DELETE, { id }),
    getTracks: (id: string): Promise<MediaPlaylistTrackDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PLAYLIST_GET_TRACKS, { id }),
    setTracks: (id: string, tracks: MediaPlaylistTrackDto[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PLAYLIST_SET_TRACKS, { id, tracks }),
    listLikedTracks: (): Promise<{ path: string }[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_TRACK_LIKE_LIST),
    isTrackLiked: (path: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_TRACK_LIKE_IS_LIKED, { path }),
    toggleTrackLike: (path: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_TRACK_LIKE_TOGGLE, { path, name }),
    pickCoverFile: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PLAYLIST_COVER_PICK_FILE),
    setCover: (playlistId: string, sourcePath: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PLAYLIST_SET_COVER, { playlistId, sourcePath }),
    clearCover: (playlistId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PLAYLIST_CLEAR_COVER, { playlistId }),
  },
  mediaLyrics: {
    get: (filePath: string): Promise<{ path: string; text: string } | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_GET_LYRICS, { filePath }),
  },
  mpv: {
    load: (filePath: string, isVideo: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MPV_LOAD, { filePath, isVideo }),
    // Re-points frame delivery at this window without restarting playback.
    becomeHost: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.MPV_BECOME_HOST),
    // Fire-and-forget (send, not invoke): fires on every debounced resize
    // tick and nothing waits on the result - same shape as seek/setVolume's
    // treatment of high-frequency calls.
    resize: (width: number, height: number): void =>
      ipcRenderer.send(IPC_CHANNELS.MPV_RESIZE, { width, height }),
    play: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.MPV_PLAY),
    pause: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.MPV_PAUSE),
    seek: (seconds: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MPV_SEEK, { seconds }),
    setVolume: (volume: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MPV_SET_VOLUME, { volume }),
    onStateUpdate: (callback: (state: MpvStateUpdate) => void): (() => void) => {
      const listener = (_event: unknown, state: MpvStateUpdate): void => callback(state)
      ipcRenderer.on(IPC_CHANNELS.MPV_STATE_UPDATE, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MPV_STATE_UPDATE, listener)
    },
    // The frame-delivery MessagePort arrives via postMessage (not a normal
    // ipcRenderer.on channel) - see mpvProcessManager.ts's setHostWindow,
    // which calls webContents.postMessage('mpv-frame-port', {}, [port2]).
    //
    // There is deliberately NO onFramePort method here. A raw MessagePort
    // cannot cross the contextBridge isolation boundary at all - not as a
    // plain function argument, and not indirectly by having preload itself
    // listen for the relayed window 'message' event and hand the resulting
    // port to a main-world callback (confirmed empirically: BOTH shapes
    // silently produce a dead, non-functional port - the callback fires,
    // but every message posted from the other end is lost with no error).
    // Electron's own docs (electronjs.org/docs/latest/tutorial/message-ports)
    // document the actual fix: preload only relays the port from its
    // isolated world into the main world via native window.postMessage
    // (below); the MAIN-WORLD consumer (a React effect, not this file) must
    // set up its own `window.addEventListener('message', ...)` directly -
    // window.postMessage/addEventListener are plain DOM APIs, available to
    // main-world code with no contextBridge involvement needed for this
    // piece specifically. See useMediaPlayback.ts (or MpvDebugPage.tsx) for
    // the consumer-side listener this relay is paired with; it must filter
    // on `event.data === 'mpv-frame-port-relay'` to match the string below.
    //
    // (moved to module scope below the `api` object/contextBridge.exposeInMainWorld
    // call, so it registers unconditionally as soon as this preload script
    // loads, once per window - not re-registered per component mount)
  },
  mediaThumbnail: {
    pickFile: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE),
    setFromFile: (filePath: string, sourcePath: string): Promise<SetMediaThumbnailFromFileResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE, { filePath, sourcePath }),
  },
  cache: {
    clear: (deleteSaveBackups: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CACHE_CLEAR, { deleteSaveBackups }),
  },
  update: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_VERSION),
    check: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
    install: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
    getStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_STATUS),
    onStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_event: unknown, payload: UpdateStatus): void => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, listener)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

// Relays the mpv frame-delivery MessagePort from this preload script's
// isolated world into the main world - see the long comment on `mpv` above
// for why this can't be a contextBridge-exposed function. Registered once,
// unconditionally, at preload load time (not per component mount), so a
// main-world consumer just needs its own
// `window.addEventListener('message', (e) => { if (e.data ===
// 'mpv-frame-port-relay' && e.ports[0]) { ... } })` - no unsubscribe/re-
// registration concern here since this only ever runs once per window.
//
// `window` genuinely exists at runtime in a preload script (Electron gives
// preload access to the renderer's real window object) but this project's
// tsconfig.node.json (which covers electron/preload) intentionally has no
// "dom" lib - adding one repo-wide would pull in DOM globals across
// electron/main too, a pure-Node context where they don't actually exist.
// This local ambient declaration covers exactly what this one relay call
// needs, nothing more.
declare const window: { postMessage: (message: unknown, targetOrigin: string, transfer?: MessagePort[]) => void }
ipcRenderer.on('mpv-frame-port', (event) => {
  if (event.ports[0]) window.postMessage('mpv-frame-port-relay', '*', event.ports)
})

export type Api = typeof api
