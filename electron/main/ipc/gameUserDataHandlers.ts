import { app, clipboard, dialog, ipcMain } from 'electron'
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import {
  GetGameUserDataRequestSchema,
  IPC_CHANNELS,
  LinkCodeRequestSchema,
  SetCustomCoverFromFileRequestSchema,
  SetFavoriteRequestSchema,
  SetRatingAndMemoRequestSchema,
  UnlinkCodeRequestSchema,
  type GameUserDataDto,
} from '../../../shared/types/ipc'
import {
  getGameUserData,
  setFavorite,
  setRatingAndMemo,
  setCustomCoverPath,
  listFavoriteKeys,
  listRecentlyPlayedKeys,
  rekeyToCode,
} from '../database/gameUserDataRepository'
import {
  deletePathCodeOverride,
  setPathCodeOverride,
} from '../database/pathCodeOverridesRepository'
import { normalizeLibraryPath } from '../database/librariesRepository'
import { resolveGameEntryKey } from './resolveGameEntryKey'
import { saveCustomCoverImage } from '../customCover/saveCustomCoverImage'
import { encodeThumbnail } from './scannerHandlers'
import type { AppDatabase } from '../database/client'

function toDto(row: ReturnType<typeof getGameUserData>): GameUserDataDto | null {
  if (!row) return null
  return {
    isFavorite: row.isFavorite,
    rating: row.rating,
    memo: row.memo,
    totalPlaytimeMs: row.totalPlaytimeMs,
    launchConfig: row.launchConfig,
    customCoverPath: row.customCoverPath,
  }
}

function customCoverCacheDir(): string {
  return join(app.getPath('userData'), 'cache', 'custom-covers')
}

export function registerGameUserDataHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_GET, (_event, payload: unknown) => {
    const { identifier } = GetGameUserDataRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)
    return toDto(getGameUserData(db, key))
  })

  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_SET_FAVORITE, (_event, payload: unknown) => {
    const { identifier, isFavorite } = SetFavoriteRequestSchema.parse(payload)
    const { key, keyType } = resolveGameEntryKey(identifier)
    setFavorite(db, key, keyType, isFavorite)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_SET_RATING_AND_MEMO, (_event, payload: unknown) => {
    const { identifier, rating, memo } = SetRatingAndMemoRequestSchema.parse(payload)
    const { key, keyType } = resolveGameEntryKey(identifier)
    setRatingAndMemo(db, key, keyType, rating, memo)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_LIST_FAVORITE_KEYS, () => {
    return listFavoriteKeys(db)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_LIST_RECENTLY_PLAYED, () => {
    return listRecentlyPlayedKeys(db)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_LINK_CODE, (_event, payload: unknown) => {
    const { path, code } = LinkCodeRequestSchema.parse(payload)
    const normalizedPath = normalizeLibraryPath(path)
    // Two separate writes (the override record, then migrating/merging the
    // user-data row onto the new code key) - without a shared transaction, a
    // crash or thrown error between them would leave the override pointing
    // at a code whose user-data row was never actually migrated, silently
    // losing the path's rating/memo/launchConfig/playtime.
    db.transaction(() => {
      setPathCodeOverride(db, normalizedPath, code.value)
      rekeyToCode(db, normalizedPath, code.value)
    })
  })

  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_UNLINK_CODE, (_event, payload: unknown) => {
    const { path } = UnlinkCodeRequestSchema.parse(payload)
    const normalizedPath = normalizeLibraryPath(path)
    deletePathCodeOverride(db, normalizedPath)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_PICK_CUSTOM_COVER_FILE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(
    IPC_CHANNELS.GAME_USER_DATA_SET_CUSTOM_COVER_FROM_FILE,
    async (_event, payload: unknown) => {
      const { identifier, path } = SetCustomCoverFromFileRequestSchema.parse(payload)
      const { key, keyType } = resolveGameEntryKey(identifier)
      const buffer = await readFile(path)
      const savedPath = await saveCustomCoverImage(customCoverCacheDir(), key, buffer)
      setCustomCoverPath(db, key, keyType, savedPath)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GAME_USER_DATA_SET_CUSTOM_COVER_FROM_CLIPBOARD,
    async (_event, payload: unknown) => {
      const { identifier } = GetGameUserDataRequestSchema.parse(payload)
      const image = clipboard.readImage()
      if (image.isEmpty()) throw new Error('클립보드에 이미지가 없습니다.')
      const { key, keyType } = resolveGameEntryKey(identifier)
      const savedPath = await saveCustomCoverImage(customCoverCacheDir(), key, image.toPNG())
      setCustomCoverPath(db, key, keyType, savedPath)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GAME_USER_DATA_CLEAR_CUSTOM_COVER,
    async (_event, payload: unknown) => {
      const { identifier } = GetGameUserDataRequestSchema.parse(payload)
      const { key, keyType } = resolveGameEntryKey(identifier)
      const row = getGameUserData(db, key)
      if (row?.customCoverPath) {
        await unlink(row.customCoverPath).catch(() => {
          // 이미 지워졌거나 접근할 수 없음 - DB 쪽 정리는 계속 진행
        })
      }
      setCustomCoverPath(db, key, keyType, null)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.GAME_USER_DATA_GET_CUSTOM_COVER_IMAGE,
    async (_event, payload: unknown) => {
      const { identifier } = GetGameUserDataRequestSchema.parse(payload)
      const { key } = resolveGameEntryKey(identifier)
      const row = getGameUserData(db, key)
      if (!row?.customCoverPath) return null
      return encodeThumbnail(row.customCoverPath).catch(() => null)
    }
  )
}
