import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { gameUserData } from './schema'

export type GameUserDataKeyType = 'code' | 'path'

export interface LaunchConfig {
  executablePath: string
  launchMode: 'normal' | 'locale-emulator'
}

export interface GameUserDataRow {
  key: string
  keyType: GameUserDataKeyType
  isFavorite: boolean
  rating: number | null
  memo: string | null
  launchConfig: LaunchConfig | null
  totalPlaytimeMs: number
  lastPlayedAt: string | null
  savePath: string | null
  createdAt: string
  updatedAt: string
}

export function getGameUserData(db: AppDatabase, key: string): GameUserDataRow | undefined {
  const row = db.select().from(gameUserData).where(eq(gameUserData.key, key)).get()
  if (!row) return undefined
  return {
    ...row,
    keyType: row.keyType as GameUserDataKeyType,
    launchConfig: row.launchConfig ? (JSON.parse(row.launchConfig) as LaunchConfig) : null,
  }
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

export function setLaunchConfig(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType,
  config: LaunchConfig
): void {
  const now = new Date().toISOString()
  const launchConfig = JSON.stringify(config)
  db.insert(gameUserData)
    .values({ key, keyType, launchConfig, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameUserData.key, set: { launchConfig, updatedAt: now } })
    .run()
}

export function recordPlaySession(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType,
  sessionMs: number
): void {
  const existing = getGameUserData(db, key)
  const now = new Date().toISOString()
  const totalPlaytimeMs = (existing?.totalPlaytimeMs ?? 0) + sessionMs
  db.insert(gameUserData)
    .values({ key, keyType, totalPlaytimeMs, lastPlayedAt: now, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: gameUserData.key,
      set: { totalPlaytimeMs, lastPlayedAt: now, updatedAt: now },
    })
    .run()
}

export function setSavePath(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType,
  savePath: string
): void {
  const now = new Date().toISOString()
  db.insert(gameUserData)
    .values({ key, keyType, savePath, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameUserData.key, set: { savePath, updatedAt: now } })
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

export function listFavoriteKeys(db: AppDatabase): string[] {
  return db
    .select({ key: gameUserData.key })
    .from(gameUserData)
    .where(eq(gameUserData.isFavorite, true))
    .all()
    .map((row) => row.key)
}

// Moves a path-keyed row (a code-less file the user later assigned a code
// to) onto the code as its new primary key, preserving createdAt as well as
// isFavorite/rating/memo/launchConfig/totalPlaytimeMs/lastPlayedAt/savePath.
// No-op if the old path key was never recorded - nothing to migrate.
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
        launchConfig: existing.launchConfig ? JSON.stringify(existing.launchConfig) : null,
        totalPlaytimeMs: existing.totalPlaytimeMs,
        lastPlayedAt: existing.lastPlayedAt,
        savePath: existing.savePath,
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
