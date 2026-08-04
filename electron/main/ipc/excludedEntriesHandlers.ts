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
import { resolveGameEntryKey } from './resolveGameEntryKey'
import type { AppDatabase } from '../database/client'

export function registerExcludedEntriesHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.GAME_ENTRY_EXCLUDE, (_event, payload: unknown) => {
    const { identifier, name } = ExcludeEntryRequestSchema.parse(payload)
    const { key, keyType } = resolveGameEntryKey(identifier)
    excludeEntry(db, key, keyType, name)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_ENTRY_RESTORE, (_event, payload: unknown) => {
    const { key } = RestoreEntryRequestSchema.parse(payload)
    restoreEntry(db, key)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_ENTRY_LIST_EXCLUDED, (): ExcludedEntryDto[] => {
    return listExcludedEntries(db)
  })
}
