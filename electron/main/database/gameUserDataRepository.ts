import { desc, eq, isNotNull, sql } from 'drizzle-orm'
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
  isCleared: boolean
  rating: number | null
  memo: string | null
  launchConfig: LaunchConfig | null
  totalPlaytimeMs: number
  lastPlayedAt: string | null
  savePath: string | null
  customCoverPath: string | null
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

export function setCleared(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType,
  isCleared: boolean
): void {
  const now = new Date().toISOString()
  db.insert(gameUserData)
    .values({ key, keyType, isCleared, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameUserData.key, set: { isCleared, updatedAt: now } })
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

// customCoverPath: null clears it (see clearCustomCoverImage's caller) -
// distinct from omitting the column entirely, which onConflictDoUpdate's
// `set` always includes here since this is the one function whose whole
// purpose is setting-or-clearing this specific column.
export function setCustomCoverPath(
  db: AppDatabase,
  key: string,
  keyType: GameUserDataKeyType,
  customCoverPath: string | null
): void {
  const now = new Date().toISOString()
  db.insert(gameUserData)
    .values({ key, keyType, customCoverPath, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameUserData.key, set: { customCoverPath, updatedAt: now } })
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

export interface RecentlyPlayedEntry {
  key: string
  lastPlayedAt: string
}

// Ties on lastPlayedAt (Date#toISOString() is only millisecond-precision, so
// two sessions recorded in quick succession - e.g. in tests, or a user
// launching two games back-to-back - can land on the identical instant) are
// broken by rowid, which increases with each new row's first INSERT and is
// left untouched by later UPDATEs, so it stays a stable proxy for insertion
// (i.e. "first played") order.
export function listRecentlyPlayedKeys(db: AppDatabase, limit = 50): RecentlyPlayedEntry[] {
  return db
    .select({ key: gameUserData.key, lastPlayedAt: gameUserData.lastPlayedAt })
    .from(gameUserData)
    .where(isNotNull(gameUserData.lastPlayedAt))
    .orderBy(desc(gameUserData.lastPlayedAt), desc(sql`rowid`))
    .limit(limit)
    .all()
    .map((row) => ({ key: row.key, lastPlayedAt: row.lastPlayedAt! }))
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
// isFavorite/isCleared/rating/memo/launchConfig/totalPlaytimeMs/lastPlayedAt/savePath.
// No-op if the old path key was never recorded - nothing to migrate.
//
// If the code already has its own row (e.g. crawled/favorited independently
// before the user linked the path to it), the two rows are merged
// deterministically rather than one silently clobbering the other:
//   - isFavorite/isCleared: true if either side is favorited/cleared.
//   - rating/memo/launchConfig/lastPlayedAt/savePath/customCoverPath: the
//     code row's value wins when set, otherwise falls back to the path
//     row's value.
//   - totalPlaytimeMs: the code row's value wins when non-zero, otherwise
//     falls back to the path row's value (does not sum - the two totals
//     aren't known to be non-overlapping).
//   - createdAt: the code row's, since it is the earlier-created row.
export function rekeyToCode(db: AppDatabase, oldPathKey: string, newCode: string): void {
  const existing = getGameUserData(db, oldPathKey)
  if (!existing || existing.keyType !== 'path') return

  const currentCodeRow = getGameUserData(db, newCode)
  const now = new Date().toISOString()

  const merged = {
    isFavorite: (currentCodeRow?.isFavorite ?? false) || existing.isFavorite,
    isCleared: (currentCodeRow?.isCleared ?? false) || existing.isCleared,
    rating: currentCodeRow?.rating ?? existing.rating,
    memo: currentCodeRow?.memo ?? existing.memo,
    launchConfig: currentCodeRow?.launchConfig ?? existing.launchConfig,
    totalPlaytimeMs:
      currentCodeRow && currentCodeRow.totalPlaytimeMs !== 0
        ? currentCodeRow.totalPlaytimeMs
        : existing.totalPlaytimeMs,
    lastPlayedAt: currentCodeRow?.lastPlayedAt ?? existing.lastPlayedAt,
    savePath: currentCodeRow?.savePath ?? existing.savePath,
    customCoverPath: currentCodeRow?.customCoverPath ?? existing.customCoverPath,
    createdAt: currentCodeRow?.createdAt ?? existing.createdAt,
  }

  db.transaction((tx) => {
    tx.delete(gameUserData).where(eq(gameUserData.key, oldPathKey)).run()
    tx.insert(gameUserData)
      .values({
        key: newCode,
        keyType: 'code',
        isFavorite: merged.isFavorite,
        isCleared: merged.isCleared,
        rating: merged.rating,
        memo: merged.memo,
        launchConfig: merged.launchConfig ? JSON.stringify(merged.launchConfig) : null,
        totalPlaytimeMs: merged.totalPlaytimeMs,
        lastPlayedAt: merged.lastPlayedAt,
        savePath: merged.savePath,
        customCoverPath: merged.customCoverPath,
        createdAt: merged.createdAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: gameUserData.key,
        set: {
          isFavorite: merged.isFavorite,
          isCleared: merged.isCleared,
          rating: merged.rating,
          memo: merged.memo,
          launchConfig: merged.launchConfig ? JSON.stringify(merged.launchConfig) : null,
          totalPlaytimeMs: merged.totalPlaytimeMs,
          lastPlayedAt: merged.lastPlayedAt,
          savePath: merged.savePath,
          customCoverPath: merged.customCoverPath,
          updatedAt: now,
        },
      })
      .run()
  })
}

// Moves a path-keyed row onto the entry's new path after it's physically
// moved on disk (see moveEntries.ts / EXPLORER_MOVE_ENTRIES) - a coded
// entry never needs this (its key is the code, unaffected by location), but
// a code-less entry's favorite/rating/memo/playtime/customCoverPath would
// otherwise silently orphan at the old path once the file itself is gone
// from there. Any pre-existing row at the new path is overwritten outright
// (not merged like rekeyToCode) - two entries already having independent
// history at the exact same destination path is not a real scenario a
// filesystem move can produce.
export function rekeyPath(db: AppDatabase, oldPathKey: string, newPathKey: string): void {
  const existing = getGameUserData(db, oldPathKey)
  if (!existing || existing.keyType !== 'path' || oldPathKey === newPathKey) return

  const now = new Date().toISOString()
  const launchConfig = existing.launchConfig ? JSON.stringify(existing.launchConfig) : null

  db.transaction((tx) => {
    tx.delete(gameUserData).where(eq(gameUserData.key, oldPathKey)).run()
    tx.insert(gameUserData)
      .values({
        key: newPathKey,
        keyType: 'path',
        isFavorite: existing.isFavorite,
        isCleared: existing.isCleared,
        rating: existing.rating,
        memo: existing.memo,
        launchConfig,
        totalPlaytimeMs: existing.totalPlaytimeMs,
        lastPlayedAt: existing.lastPlayedAt,
        savePath: existing.savePath,
        customCoverPath: existing.customCoverPath,
        createdAt: existing.createdAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: gameUserData.key,
        set: {
          isFavorite: existing.isFavorite,
          isCleared: existing.isCleared,
          rating: existing.rating,
          memo: existing.memo,
          launchConfig,
          totalPlaytimeMs: existing.totalPlaytimeMs,
          lastPlayedAt: existing.lastPlayedAt,
          savePath: existing.savePath,
          customCoverPath: existing.customCoverPath,
          updatedAt: now,
        },
      })
      .run()
  })
}
