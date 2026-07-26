import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type Theme } from '../../shared/types/ipc'

const api = {
  settings: {
    getTheme: (): Promise<Theme | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'theme' }),
    setTheme: (value: Theme): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'theme', value }),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
