import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { excludedEntries } from './schema'

export interface ExcludedEntryRow {
  path: string
  name: string
  excludedAt: string
}

export function listExcludedEntries(db: AppDatabase): ExcludedEntryRow[] {
  return db.select().from(excludedEntries).all()
}

export function excludeEntry(db: AppDatabase, path: string, name: string): void {
  const excludedAt = new Date().toISOString()
  db.insert(excludedEntries)
    .values({ path, name, excludedAt })
    .onConflictDoUpdate({ target: excludedEntries.path, set: { name, excludedAt } })
    .run()
}

export function restoreEntry(db: AppDatabase, path: string): void {
  db.delete(excludedEntries).where(eq(excludedEntries.path, path)).run()
}
