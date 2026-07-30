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
