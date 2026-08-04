import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { excludedEntries } from './schema'

export interface ExcludedEntryRow {
  key: string
  keyType: string // 'code' | 'path'
  name: string
  excludedAt: string
}

export function listExcludedEntries(db: AppDatabase): ExcludedEntryRow[] {
  return db.select().from(excludedEntries).all()
}

export function excludeEntry(db: AppDatabase, key: string, keyType: string, name: string): void {
  const excludedAt = new Date().toISOString()
  db.insert(excludedEntries)
    .values({ key, keyType, name, excludedAt })
    .onConflictDoUpdate({ target: excludedEntries.key, set: { keyType, name, excludedAt } })
    .run()
}

export function restoreEntry(db: AppDatabase, key: string): void {
  db.delete(excludedEntries).where(eq(excludedEntries.key, key)).run()
}
