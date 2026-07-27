import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export function createDbClient(filePath: string) {
  const sqlite = new Database(filePath)
  sqlite.pragma('journal_mode = WAL')

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )
  `)

  return drizzle(sqlite, { schema })
}

export type AppDatabase = ReturnType<typeof createDbClient>
