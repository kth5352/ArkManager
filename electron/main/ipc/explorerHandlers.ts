import { ipcMain } from 'electron'
import { IPC_CHANNELS, SaveExplorerTabsRequestSchema } from '../../../shared/types/ipc'
import { loadExplorerTabs, saveExplorerTabs } from '../database/explorerTabsRepository'
import type { AppDatabase } from '../database/client'

export function registerExplorerHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.EXPLORER_LOAD_TABS, () => {
    return loadExplorerTabs(db)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_SAVE_TABS, (_event, payload: unknown) => {
    const { tabs } = SaveExplorerTabsRequestSchema.parse(payload)
    saveExplorerTabs(db, tabs)
  })
}
