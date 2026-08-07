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
  type MediaSyncState,
  type MetadataSearchResultDto,
  type MetadataSearchSource,
  type MetadataFailureDto,
  type MoveResultDto,
  type PersistedExplorerTab,
  type RenameResultDto,
  type SaveDiffEntryDto,
  type SaveSnapshotDto,
  type SortPage,
  type SortPreference,
  type Theme,
  type UpdateStatus,
  type VersionMismatchDto,
} from '../../shared/types/ipc'
import type { GameCode, ScannedEntry } from '../../shared/types/scanner'

const api = {
  settings: {
    getTheme: (): Promise<Theme | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'theme' }),
    setTheme: (value: Theme): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'theme', value }),
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
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MENU_OPEN_EXCLUDED_ENTRIES_DIALOG, listener)
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
    onPlayerWindowClosed: (callback: (lastKnownTimeSeconds: number) => void): (() => void) => {
      const listener = (_event: unknown, seconds: number): void => callback(seconds)
      ipcRenderer.on(IPC_CHANNELS.MEDIA_PLAYER_WINDOW_CLOSED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MEDIA_PLAYER_WINDOW_CLOSED, listener)
    },
    reportTime: (seconds: number): void =>
      ipcRenderer.send(IPC_CHANNELS.MEDIA_REPORT_TIME, seconds),
  },
  mediaThumbnail: {
    pickFile: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE),
    setFromFile: (filePath: string, sourcePath: string): Promise<void> =>
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

export type Api = typeof api
