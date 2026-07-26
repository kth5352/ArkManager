import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type Theme } from '../../shared/types/ipc'

const api = {
  settings: {
    getTheme: (): Promise<Theme | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'theme' }),
    setTheme: (value: Theme): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'theme', value }),
    // Synchronous IPC round-trip used only to apply the persisted theme
    // before the renderer's first paint (see src/main.tsx). Do not use this
    // for anything else - prefer the async getTheme/setTheme above.
    getThemeSync: (): Theme | null => ipcRenderer.sendSync(IPC_CHANNELS.SETTINGS_GET_SYNC) as Theme | null,
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
