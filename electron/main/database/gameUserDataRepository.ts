import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { gameUserData } from './schema'

export type GameUserDataKeyType = 'code' | 'path'

export interface GameUserDataRow {
  key: string
  keyType: GameUserDataKeyType
  isFavorite: boolean
  rating: number | null
  memo: string | null
  createdAt: string
  updatedAt: string
}

export function getGameUserData(db: AppDatabase, key: string): GameUserDataRow | undefined {
  const row = db.select().from(gameUserData).where(eq(gameUserData.key, key)).get()
  if (!row) return undefined
  return { ...row, keyType: row.keyType as GameUserDataKeyType }
}

export function setFavorite(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType,
  isFavorite: boolean
): void {
  const now = new Date().toISOString()
  db.insert(gameUserData)
    .values({ key, keyType, isFavorite, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameUserData.key, set: { isFavorite, updatedAt: now } })
    .run()
}

export function setRatingAndMemo(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType,
  rating: number | null,
  memo: string | null
): void {
  const now = new Date().toISOString()
  db.insert(gameUserData)
    .values({ key, keyType, rating, memo, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameUserData.key, set: { rating, memo, updatedAt: now } })
    .run()
}

// Ensures a row exists for `key` and refreshes updatedAt - later tasks
// (D/B group features) call this alongside writing the actual user-data
// columns they add via their own migration.
export function touchGameUserData(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType
): void {
  const now = new Date().toISOString()
  db.insert(gameUserData)
    .values({ key, keyType, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameUserData.key, set: { updatedAt: now } })
    .run()
}

// Moves a path-keyed row (a code-less file the user later assigned a code
// to) onto the code as its new primary key, preserving createdAt as well as
// isFavorite/rating/memo. No-op if the old path key was never recorded -
// nothing to migrate.
export function rekeyToCode(db: AppDatabase, oldPathKey: string, newCode: string): void {
  const existing = getGameUserData(db, oldPathKey)
  if (!existing || existing.keyType !== 'path') return

  db.transaction((tx) => {
    tx.delete(gameUserData).where(eq(gameUserData.key, oldPathKey)).run()
    tx.insert(gameUserData)
      .values({
        key: newCode,
        keyType: 'code',
        isFavorite: existing.isFavorite,
        rating: existing.rating,
        memo: existing.memo,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: gameUserData.key,
        set: { updatedAt: new Date().toISOString() },
      })
      .run()
  })
}
