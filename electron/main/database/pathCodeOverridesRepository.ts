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

export function setPathCodeOverride(
  db: AppDatabase,
  normalizedPath: string,
  code: string
): void {
  const now = new Date().toISOString()
  db.insert(pathCodeOverrides)
    .values({ path: normalizedPath, code, createdAt: now })
    .onConflictDoUpdate({ target: pathCodeOverrides.path, set: { code } })
    .run()
}
