import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { saveSnapshotLabels } from './schema'

export interface SnapshotLabel {
  memo: string | null
  version: string | null
}

export function getSnapshotLabel(db: AppDatabase, key: string, timestamp: string): SnapshotLabel {
  const row = db
    .select({ memo: saveSnapshotLabels.memo, version: saveSnapshotLabels.version })
    .from(saveSnapshotLabels)
    .where(and(eq(saveSnapshotLabels.key, key), eq(saveSnapshotLabels.timestamp, timestamp)))
    .get()
  return row ?? { memo: null, version: null }
}

export function setSnapshotLabel(
  db: AppDatabase,
  key: string,
  timestamp: string,
  updates: { memo?: string; version?: string }
): void {
  const existing = getSnapshotLabel(db, key, timestamp)
  const memo = updates.memo !== undefined ? updates.memo : existing.memo
  const version = updates.version !== undefined ? updates.version : existing.version
  db.insert(saveSnapshotLabels)
    .values({ key, timestamp, memo, version })
    .onConflictDoUpdate({
      target: [saveSnapshotLabels.key, saveSnapshotLabels.timestamp],
      set: { memo, version },
    })
    .run()
}

export function deleteSnapshotLabel(db: AppDatabase, key: string, timestamp: string): void {
  db.delete(saveSnapshotLabels)
    .where(and(eq(saveSnapshotLabels.key, key), eq(saveSnapshotLabels.timestamp, timestamp)))
    .run()
}

export function deleteSnapshotLabelsForKey(db: AppDatabase, key: string): void {
  db.delete(saveSnapshotLabels).where(eq(saveSnapshotLabels.key, key)).run()
}
