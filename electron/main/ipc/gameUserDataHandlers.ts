import { ipcMain } from 'electron'
import {
  GetGameUserDataRequestSchema,
  IPC_CHANNELS,
  LinkCodeRequestSchema,
  SetFavoriteRequestSchema,
  SetRatingAndMemoRequestSchema,
  UnlinkCodeRequestSchema,
  type GameUserDataDto,
} from '../../../shared/types/ipc'
import {
  getGameUserData,
  setFavorite,
  setRatingAndMemo,
  listFavoriteKeys,
  listRecentlyPlayedKeys,
  rekeyToCode,
} from '../database/gameUserDataRepository'
import { deletePathCodeOverride, setPathCodeOverride } from '../database/pathCodeOverridesRepository'
import { normalizeLibraryPath } from '../database/librariesRepository'
import { resolveGameEntryKey } from './resolveGameEntryKey'
import type { AppDatabase } from '../database/client'

function toDto(row: ReturnType<typeof getGameUserData>): GameUserDataDto | null {
  if (!row) return null
  return {
    isFavorite: row.isFavorite,
    rating: row.rating,
    memo: row.memo,
    totalPlaytimeMs: row.totalPlaytimeMs,
  }
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
    setPathCodeOverride(db, normalizedPath, code.value)
    rekeyToCode(db, normalizedPath, code.value)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_UNLINK_CODE, (_event, payload: unknown) => {
    const { path } = UnlinkCodeRequestSchema.parse(payload)
    const normalizedPath = normalizeLibraryPath(path)
    deletePathCodeOverride(db, normalizedPath)
  })
}
