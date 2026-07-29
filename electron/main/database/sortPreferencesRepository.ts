import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { sortPreferences } from './schema'

export type SortField = 'name' | 'mtime'
export type SortDirection = 'asc' | 'desc'
export type SortPage = 'gallery' | 'list' | 'explorer' | 'detail-list'

export interface SortPreference {
  field: SortField
  direction: SortDirection
}

export function getSortPreference(db: AppDatabase, page: SortPage): SortPreference | undefined {
  const row = db.select().from(sortPreferences).where(eq(sortPreferences.page, page)).get()
  if (!row) return undefined
  return { field: row.field as SortField, direction: row.direction as SortDirection }
}

export function setSortPreference(
  db: AppDatabase,
  page: SortPage,
  field: SortField,
  direction: SortDirection
): void {
  db.insert(sortPreferences)
    .values({ page, field, direction })
    .onConflictDoUpdate({ target: sortPreferences.page, set: { field, direction } })
    .run()
}
