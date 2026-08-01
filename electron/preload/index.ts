import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC_CHANNELS,
  type BulkCrawlProgressDto,
  type DlsiteSearchResultDto,
  type GameMetadataDto,
  type GameUserDataDto,
  type LaunchConfigDto,
  type Library,
  type LibraryWithStatus,
  type PersistedExplorerTab,
  type SortPage,
  type SortPreference,
  type Theme,
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
    getLocaleEmulatorPath: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'locale-emulator-path' }),
    setLocaleEmulatorPath: (path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'locale-emulator-path', value: path }),
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
    getMany: (codes: string[]): Promise<Record<string, GameMetadataDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_GET_MANY, { codes }),
    getCoverImage: (code: GameCode): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_GET_COVER_IMAGE, { code }),
    searchDlsite: (query: string): Promise<DlsiteSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH_DLSITE, { query }),
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
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.SAVE_PICK_FOLDER),
    setPath: (code: GameCode | null, path: string, savePath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_SET_PATH, { identifier: { code, path }, savePath }),
    backupNow: (code: GameCode | null, path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_BACKUP_NOW, { identifier: { code, path } }),
  },
  cache: {
    clear: (deleteSaveBackups: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CACHE_CLEAR, { deleteSaveBackups }),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
