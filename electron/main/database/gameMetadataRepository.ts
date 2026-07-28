import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { gameMetadata } from './schema'

export interface GameMetadataRow {
  code: string
  createdAt: string
  updatedAt: string
}

export function getGameMetadata(db: AppDatabase, code: string): GameMetadataRow | undefined {
  return db.select().from(gameMetadata).where(eq(gameMetadata.code, code)).get()
}

// Ensures a row exists for `code` and refreshes updatedAt - later tasks
// (A group's DLsite crawler) call this alongside writing the actual
// crawled columns they add via their own migration.
export function touchGameMetadata(db: AppDatabase, code: string): void {
  const now = new Date().toISOString()
  db.insert(gameMetadata)
    .values({ code, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameMetadata.code, set: { updatedAt: now } })
    .run()
}
