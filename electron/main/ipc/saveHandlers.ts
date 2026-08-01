import { app, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import {
  IPC_CHANNELS,
  RestoreSaveSnapshotRequestSchema,
  SaveDiffRequestSchema,
  SaveSnapshotRequestSchema,
  SetSavePathRequestSchema,
  type GameWithSavePathDto,
  type SaveDiffEntryDto,
  type SaveSnapshotDto,
} from '../../../shared/types/ipc'
import { createSnapshot } from '../save/createSnapshot'
import { listSnapshots } from '../save/listSnapshots'
import { restoreSnapshot } from '../save/restoreSnapshot'
import { diffSaveFolders } from '../save/diffSaveFolders'
import { keyToSafeDirName } from '../save/keyToSafeDirName'
import {
  getGameUserData,
  listGamesWithSavePath,
  setSavePath,
} from '../database/gameUserDataRepository'
import { resolveGameEntryKey } from './resolveGameEntryKey'
import type { AppDatabase } from '../database/client'

// Every snapshot for a game lives under its own backup-root subfolder
// (userData/saves/{safeKey}/{timestamp}/) - key is the DB lookup key (raw
// for path-type games), which must NOT be used raw as a filesystem
// directory segment (see keyToSafeDirName).
function backupRootDir(key: string): string {
  return join(app.getPath('userData'), 'saves', keyToSafeDirName(key))
}

export function registerSaveHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SAVE_PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_SET_PATH, (_event, payload: unknown) => {
    const { identifier, savePath } = SetSavePathRequestSchema.parse(payload)
    const { key, keyType } = resolveGameEntryKey(identifier)
    setSavePath(db, key, keyType, savePath)
  })

  ipcMain.handle(
    IPC_CHANNELS.SAVE_LIST_SNAPSHOTS,
    async (_event, payload: unknown): Promise<SaveSnapshotDto[]> => {
      const { identifier } = SaveSnapshotRequestSchema.parse(payload)
      const { key } = resolveGameEntryKey(identifier)
      return listSnapshots(backupRootDir(key))
    }
  )

  ipcMain.handle(IPC_CHANNELS.SAVE_CREATE_SNAPSHOT, async (_event, payload: unknown) => {
    const { identifier } = SaveSnapshotRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)

    const userData = getGameUserData(db, key)
    if (!userData?.savePath) {
      throw new Error('백업할 세이브 경로가 지정되어 있지 않습니다.')
    }
    await createSnapshot(userData.savePath, backupRootDir(key))
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_RESTORE_SNAPSHOT, async (_event, payload: unknown) => {
    const { identifier, timestamp } = RestoreSaveSnapshotRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)

    const userData = getGameUserData(db, key)
    if (!userData?.savePath) {
      throw new Error('복원할 세이브 경로가 지정되어 있지 않습니다.')
    }
    await restoreSnapshot(backupRootDir(key), timestamp, userData.savePath)
  })

  ipcMain.handle(
    IPC_CHANNELS.SAVE_DIFF,
    async (_event, payload: unknown): Promise<SaveDiffEntryDto[]> => {
      const { identifier, timestamp } = SaveDiffRequestSchema.parse(payload)
      const { key } = resolveGameEntryKey(identifier)

      const userData = getGameUserData(db, key)
      if (!userData?.savePath) return []

      const snapshotDir = timestamp ? join(backupRootDir(key), timestamp) : null
      return diffSaveFolders(snapshotDir, userData.savePath)
    }
  )

  ipcMain.handle(IPC_CHANNELS.SAVE_LIST_GAMES_WITH_SAVE_PATH, (): GameWithSavePathDto[] =>
    listGamesWithSavePath(db)
  )
}
