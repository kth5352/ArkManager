import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { createDbClient } from './client'
import { gameUserData } from './schema'

describe('createDbClient column backfill', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('backfills columns missing from a game_user_data table created before they existed', async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-db-'))
    const dbPath = join(dir, 'old.db')

    // Simulates a real user's database created before is_favorite (and
    // several other columns added across later plans) existed - only the
    // table's very first shape, which client.ts's CREATE TABLE IF NOT
    // EXISTS alone can never reach once the table already exists.
    const raw = new Database(dbPath)
    raw.exec(`
      CREATE TABLE game_user_data (
        key TEXT PRIMARY KEY,
        key_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    raw
      .prepare(
        `INSERT INTO game_user_data (key, key_type, created_at, updated_at) VALUES (?, ?, ?, ?)`
      )
      .run('RJ01234567', 'code', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    raw.close()

    const db = createDbClient(dbPath)

    try {
      // The real bug this reproduces: querying a column client.ts's DDL
      // declares but the live table predates throws SQLITE_ERROR "no such
      // column" - not a drizzle-level type mismatch.
      const row = db.select().from(gameUserData).get()
      expect(row?.isFavorite).toBe(false)
      expect(row?.totalPlaytimeMs).toBe(0)
      expect(row?.rating).toBeNull()
      expect(row?.memo).toBeNull()
      expect(row?.launchConfig).toBeNull()
      expect(row?.lastPlayedAt).toBeNull()
      expect(row?.savePath).toBeNull()
    } finally {
      db.$client.close()
    }
  })

  it('is idempotent - running it again on an already-current table does not error', async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-db-'))
    const dbPath = join(dir, 'current.db')

    const first = createDbClient(dbPath)
    first.$client.close()

    const second = createDbClient(dbPath)
    second.$client.close()
  })
})
