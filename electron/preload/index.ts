import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type GameMetadataDto,
  type GameUserDataDto,
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
  },
  libraries: {
    list: (): Promise<LibraryWithStatus[]> => ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_LIST),
    add: (name: string, path: string): Promise<Library> =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_ADD, { name, path }),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_REMOVE, { id }),
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_PICK_FOLDER),
  },
  scanner: {
    scanRecursive: (libraryPaths: string[]): Promise<ScannedEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCANNER_SCAN_RECURSIVE, { libraryPaths }),
    scanShallow: (dirPath: string): Promise<ScannedEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCANNER_SCAN_SHALLOW, { dirPath }),
    getThumbnail: (entryPath: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCANNER_GET_THUMBNAIL, { entryPath }),
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
  },
  metadata: {
    crawlAndSave: (code: GameCode): Promise<GameMetadataDto | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_CRAWL_AND_SAVE, { code }),
    get: (code: GameCode): Promise<GameMetadataDto | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_GET, { code }),
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
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
