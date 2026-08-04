import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  ExcludeEntryRequestSchema,
  RestoreEntryRequestSchema,
  type ExcludedEntryDto,
} from '../../../shared/types/ipc'
import {
  excludeEntry,
  restoreEntry,
  listExcludedEntries,
} from '../database/excludedEntriesRepository'
import { normalizeLibraryPath } from '../../../shared/normalizeLibraryPath'
import type { AppDatabase } from '../database/client'

export function registerExcludedEntriesHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.GAME_ENTRY_EXCLUDE, (_event, payload: unknown) => {
    const { path, name } = ExcludeEntryRequestSchema.parse(payload)
    excludeEntry(db, normalizeLibraryPath(path), name)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_ENTRY_RESTORE, (_event, payload: unknown) => {
    const { path } = RestoreEntryRequestSchema.parse(payload)
    restoreEntry(db, normalizeLibraryPath(path))
  })

  ipcMain.handle(IPC_CHANNELS.GAME_ENTRY_LIST_EXCLUDED, (): ExcludedEntryDto[] => {
    return listExcludedEntries(db)
  })
}
