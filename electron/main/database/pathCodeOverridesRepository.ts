import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { pathCodeOverrides } from './schema'

export function getPathCodeOverride(db: AppDatabase, normalizedPath: string): string | null {
  const row = db
    .select({ code: pathCodeOverrides.code })
    .from(pathCodeOverrides)
    .where(eq(pathCodeOverrides.path, normalizedPath))
    .get()
  return row?.code ?? null
}

export function setPathCodeOverride(db: AppDatabase, normalizedPath: string, code: string): void {
  const now = new Date().toISOString()
  db.insert(pathCodeOverrides)
    .values({ path: normalizedPath, code, createdAt: now })
    .onConflictDoUpdate({ target: pathCodeOverrides.path, set: { code } })
    .run()
}

// Loads every override once per scan request (normalized path -> code), so
// the scanner can look overrides up in-memory per entry instead of issuing
// one DB query per entry during a recursive scan.
export function listPathCodeOverrides(db: AppDatabase): Map<string, string> {
  const rows = db.select().from(pathCodeOverrides).all()
  return new Map(rows.map((row) => [row.path, row.code]))
}

// Removes a manually-linked code for a path (the "연동 해제" feature).
// Deliberately does NOT touch game_user_data - the accumulated
// favorite/rating/memo/playtime for the code this path was linked to stays
// exactly where it is. Reversing rekeyToCode's merge back onto the path key
// is not attempted: the code row may have had its own independent data
// before this link existed (or gained more after), so there is no way to
// tell which fields "belong" to this path versus the code itself without
// risking silently discarding real data. See gameUserDataHandlers.ts's
// unlink-code handler for where this is called from.
export function deletePathCodeOverride(db: AppDatabase, normalizedPath: string): void {
  db.delete(pathCodeOverrides).where(eq(pathCodeOverrides.path, normalizedPath)).run()
}
