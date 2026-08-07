import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { metadataFailures } from './schema'

export type MetadataFailureReason = 'not_found' | 'blocked' | 'network' | 'parse' | 'provider_error'

export interface MetadataFailureRow {
  code: string
  attemptedSources: string[]
  reason: MetadataFailureReason
  updatedAt: string
}

export function saveMetadataFailure(
  db: AppDatabase,
  code: string,
  attemptedSources: string[],
  reason: MetadataFailureReason
): void {
  const now = new Date().toISOString()
  const serializedSources = JSON.stringify(attemptedSources)
  db.insert(metadataFailures)
    .values({ code, attemptedSources: serializedSources, reason, updatedAt: now })
    .onConflictDoUpdate({
      target: metadataFailures.code,
      set: { attemptedSources: serializedSources, reason, updatedAt: now },
    })
    .run()
}

export function getMetadataFailure(db: AppDatabase, code: string): MetadataFailureRow | undefined {
  const row = db.select().from(metadataFailures).where(eq(metadataFailures.code, code)).get()
  if (!row) return undefined

  const parsedSources: unknown = JSON.parse(row.attemptedSources)
  return {
    ...row,
    attemptedSources: Array.isArray(parsedSources)
      ? parsedSources.filter((source): source is string => typeof source === 'string')
      : [],
    reason: row.reason as MetadataFailureReason,
  }
}

export function clearMetadataFailure(db: AppDatabase, code: string): void {
  db.delete(metadataFailures).where(eq(metadataFailures.code, code)).run()
}
