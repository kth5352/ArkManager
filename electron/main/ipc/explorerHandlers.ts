import { ipcMain, shell } from 'electron'
import {
  DeleteEntriesRequestSchema,
  IPC_CHANNELS,
  RenameEntriesRequestSchema,
  SaveExplorerTabsRequestSchema,
} from '../../../shared/types/ipc'
import { loadExplorerTabs, saveExplorerTabs } from '../database/explorerTabsRepository'
import { renameEntries } from '../fileOps/renameEntries'
import { deleteEntries } from '../fileOps/deleteEntries'
import type { AppDatabase } from '../database/client'

export function registerExplorerHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.EXPLORER_LOAD_TABS, () => {
    return loadExplorerTabs(db)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_SAVE_TABS, (_event, payload: unknown) => {
    const { tabs } = SaveExplorerTabsRequestSchema.parse(payload)
    saveExplorerTabs(db, tabs)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_RENAME_ENTRIES, (_event, payload: unknown) => {
    const { renames } = RenameEntriesRequestSchema.parse(payload)
    return renameEntries(renames)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_DELETE_ENTRIES, (_event, payload: unknown) => {
    const { paths } = DeleteEntriesRequestSchema.parse(payload)
    return deleteEntries(paths, shell.trashItem)
  })
}
