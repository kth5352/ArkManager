import { ipcMain } from 'electron'
import {
  GetGameUserDataRequestSchema,
  IPC_CHANNELS,
  SetFavoriteRequestSchema,
  SetRatingAndMemoRequestSchema,
  type GameUserDataDto,
} from '../../../shared/types/ipc'
import { getGameUserData, setFavorite, setRatingAndMemo } from '../database/gameUserDataRepository'
import { resolveGameEntryKey } from './resolveGameEntryKey'
import type { AppDatabase } from '../database/client'

function toDto(row: ReturnType<typeof getGameUserData>): GameUserDataDto | null {
  if (!row) return null
  return { isFavorite: row.isFavorite, rating: row.rating, memo: row.memo }
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
}
