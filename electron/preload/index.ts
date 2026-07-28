import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type Library, type LibraryWithStatus, type Theme } from '../../shared/types/ipc'
import type { GameEntry, ScannedEntry } from '../../shared/types/scanner'

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
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_REMOVE, { id }),
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_PICK_FOLDER),
  },
  scanner: {
    scanRecursive: (libraryPaths: string[]): Promise<GameEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCANNER_SCAN_RECURSIVE, { libraryPaths }),
    scanShallow: (dirPath: string): Promise<ScannedEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCANNER_SCAN_SHALLOW, { dirPath }),
    getThumbnail: (entryPath: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCANNER_GET_THUMBNAIL, { entryPath }),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
