import { app, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import {
  IPC_CHANNELS,
  PickSaveFolderRequestSchema,
  RestoreSaveSnapshotRequestSchema,
  SaveDiffRequestSchema,
  SaveSnapshotRequestSchema,
  SetSavePathRequestSchema,
  SetSnapshotLabelRequestSchema,
  DeleteSnapshotRequestSchema,
  DeleteAllSnapshotsRequestSchema,
  ShowSnapshotInFolderRequestSchema,
  CheckVersionMismatchRequestSchema,
  type GameWithSavePathDto,
  type SaveDiffEntryDto,
  type SaveSnapshotDto,
  type VersionMismatchDto,
} from '../../../shared/types/ipc'
import { createSnapshot } from '../save/createSnapshot'
import { listSnapshots } from '../save/listSnapshots'
import { restoreSnapshot } from '../save/restoreSnapshot'
import { diffSaveFolders } from '../save/diffSaveFolders'
import { keyToSafeDirName } from '../save/keyToSafeDirName'
import { detectGameVersion } from '../save/detectGameVersion'
import { compareVersions } from '../save/compareVersions'
import {
  getGameUserData,
  listGamesWithSavePath,
  setSavePath,
} from '../database/gameUserDataRepository'
import {
  getSnapshotLabel,
  setSnapshotLabel,
  deleteSnapshotLabel,
  deleteSnapshotLabelsForKey,
} from '../database/saveSnapshotLabelsRepository'
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
  ipcMain.handle(IPC_CHANNELS.SAVE_PICK_FOLDER, async (_event, payload: unknown) => {
    const { startPath } = PickSaveFolderRequestSchema.parse(payload)
    // If startPath is a file (an unextracted archive), the native dialog
    // opens to its containing folder rather than preselecting it - only
    // directories can be selected here anyway (properties: ['openDirectory']).
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      ...(startPath ? { defaultPath: startPath } : {}),
    })
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
      const snapshots = await listSnapshots(backupRootDir(key))
      return snapshots.map((snapshot) => {
        const label = getSnapshotLabel(db, key, snapshot.timestamp)
        return { ...snapshot, memo: label.memo, version: label.version }
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.SAVE_CREATE_SNAPSHOT, async (_event, payload: unknown) => {
    const { identifier } = SaveSnapshotRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)

    const userData = getGameUserData(db, key)
    if (!userData?.savePath) {
      throw new Error('백업할 세이브 경로가 지정되어 있지 않습니다.')
    }
    const timestamp = await createSnapshot(userData.savePath, backupRootDir(key))
    const version = await detectGameVersion(
      identifier.path,
      userData.launchConfig?.executablePath ?? null
    )
    if (version) setSnapshotLabel(db, key, timestamp, { version })
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

  ipcMain.handle(IPC_CHANNELS.SAVE_SET_SNAPSHOT_LABEL, (_event, payload: unknown) => {
    const { identifier, timestamp, memo, version } = SetSnapshotLabelRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)
    setSnapshotLabel(db, key, timestamp, { memo, version })
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_DELETE_SNAPSHOT, async (_event, payload: unknown) => {
    const { identifier, timestamp } = DeleteSnapshotRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)
    await rm(join(backupRootDir(key), timestamp), { recursive: true, force: true })
    deleteSnapshotLabel(db, key, timestamp)
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_DELETE_ALL_SNAPSHOTS, async (_event, payload: unknown) => {
    const { identifier } = DeleteAllSnapshotsRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)
    await rm(backupRootDir(key), { recursive: true, force: true })
    deleteSnapshotLabelsForKey(db, key)
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_SHOW_SNAPSHOT_IN_FOLDER, (_event, payload: unknown) => {
    const { identifier, timestamp } = ShowSnapshotInFolderRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)
    shell.showItemInFolder(join(backupRootDir(key), timestamp))
  })

  ipcMain.handle(
    IPC_CHANNELS.SAVE_CHECK_VERSION_MISMATCH,
    async (_event, payload: unknown): Promise<VersionMismatchDto> => {
      const { identifier, timestamp } = CheckVersionMismatchRequestSchema.parse(payload)
      const { key } = resolveGameEntryKey(identifier)
      const label = getSnapshotLabel(db, key, timestamp)
      const userData = getGameUserData(db, key)
      const currentVersion = await detectGameVersion(
        identifier.path,
        userData?.launchConfig?.executablePath ?? null
      )
      const comparison =
        label.version && currentVersion ? compareVersions(label.version, currentVersion) : null
      return {
        snapshotVersion: label.version,
        currentVersion,
        isSnapshotNewer: comparison === 1,
      }
    }
  )
}
