import { app, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import {
  BackupSaveNowRequestSchema,
  IPC_CHANNELS,
  SetSavePathRequestSchema,
} from '../../../shared/types/ipc'
import { backupSave } from '../save/backupSave'
import { keyToSafeDirName } from '../save/keyToSafeDirName'
import { getGameUserData, setSavePath } from '../database/gameUserDataRepository'
import { resolveGameEntryKey } from './resolveGameEntryKey'
import type { AppDatabase } from '../database/client'

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

  ipcMain.handle(IPC_CHANNELS.SAVE_BACKUP_NOW, async (_event, payload: unknown) => {
    const { identifier } = BackupSaveNowRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)

    const userData = getGameUserData(db, key)
    if (!userData?.savePath) {
      throw new Error('백업할 세이브 경로가 지정되어 있지 않습니다.')
    }

    // key is the DB lookup key (raw for path-type games) - it must NOT be
    // used raw as a filesystem directory segment (see keyToSafeDirName).
    const backupDir = join(app.getPath('userData'), 'saves', keyToSafeDirName(key))
    await backupSave(userData.savePath, backupDir)
  })
}
