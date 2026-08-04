import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

// CREATE TABLE IF NOT EXISTS only helps a table that doesn't exist yet - a
// column added to this file's DDL after a user's database already has that
// table (this project has added several columns to game_user_data across
// past plans: is_favorite, launch_config, total_playtime_ms, last_played_at,
// save_path) silently never reaches an existing install, since the CREATE
// statement is a no-op there. There's no drizzle-kit migration pipeline in
// this project, so this backfills any columns the live table is missing by
// comparing against the DDL below, run once per table right after its
// CREATE TABLE IF NOT EXISTS. Every column added here so far is either
// nullable or NOT NULL with a DEFAULT, both of which SQLite's
// ALTER TABLE ADD COLUMN accepts even on a non-empty table.
function ensureColumns(
  sqlite: Database.Database,
  table: string,
  columns: { name: string; ddl: string }[]
): void {
  const existing = new Set(
    (sqlite.pragma(`table_info(${table})`) as { name: string }[]).map((col) => col.name)
  )
  for (const column of columns) {
    if (!existing.has(column.name)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column.ddl}`)
    }
  }
}

export function createDbClient(filePath: string) {
  const sqlite = new Database(filePath)
  sqlite.pragma('journal_mode = WAL')
  // WAL already lets readers and a writer proceed concurrently, but two
  // near-simultaneous writers (e.g. two IPC handlers firing in the same
  // tick) can still hit SQLITE_BUSY without this - better-sqlite3 defaults
  // to a 0ms busy timeout (fail immediately) rather than SQLite's own
  // more forgiving default.
  sqlite.pragma('busy_timeout = 5000')

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

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS explorer_tabs (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      path TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_active INTEGER NOT NULL
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sort_preferences (
      page TEXT PRIMARY KEY,
      field TEXT NOT NULL,
      direction TEXT NOT NULL
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS game_metadata (
      code TEXT PRIMARY KEY,
      title TEXT,
      circle TEXT,
      release_date TEXT,
      genres TEXT,
      cover_image_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  ensureColumns(sqlite, 'game_metadata', [
    { name: 'cover_image_path', ddl: 'cover_image_path TEXT' },
  ])

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS game_user_data (
      key TEXT PRIMARY KEY,
      key_type TEXT NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_cleared INTEGER NOT NULL DEFAULT 0,
      rating INTEGER,
      memo TEXT,
      launch_config TEXT,
      total_playtime_ms INTEGER NOT NULL DEFAULT 0,
      last_played_at TEXT,
      save_path TEXT,
      custom_cover_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  ensureColumns(sqlite, 'game_user_data', [
    { name: 'is_favorite', ddl: 'is_favorite INTEGER NOT NULL DEFAULT 0' },
    { name: 'is_cleared', ddl: 'is_cleared INTEGER NOT NULL DEFAULT 0' },
    { name: 'rating', ddl: 'rating INTEGER' },
    { name: 'memo', ddl: 'memo TEXT' },
    { name: 'launch_config', ddl: 'launch_config TEXT' },
    { name: 'total_playtime_ms', ddl: 'total_playtime_ms INTEGER NOT NULL DEFAULT 0' },
    { name: 'last_played_at', ddl: 'last_played_at TEXT' },
    { name: 'save_path', ddl: 'save_path TEXT' },
    { name: 'custom_cover_path', ddl: 'custom_cover_path TEXT' },
  ])

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS path_code_overrides (
      path TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS save_snapshot_labels (
      key TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      memo TEXT,
      version TEXT,
      PRIMARY KEY (key, timestamp)
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS media_thumbnail_overrides (
      path TEXT PRIMARY KEY,
      thumbnail_path TEXT NOT NULL
    )
  `)

  // One-time cleanup: this table briefly shipped (within this same
  // development cycle, never released) with a `key`/`key_type` shape
  // before the identity model was corrected to always be path-only (see
  // schema.ts's own comment on why). CREATE TABLE IF NOT EXISTS alone
  // can't restructure an already-existing table's columns, and the row
  // shape genuinely changed (not just an added column, ensureColumns
  // doesn't apply) - dropping is safe here specifically because no
  // release ever shipped the old shape, so no real exclusion the drop
  // could lose has ever existed outside this dev machine.
  const existingExcludedEntriesColumns = new Set(
    (sqlite.pragma('table_info(excluded_entries)') as { name: string }[]).map((col) => col.name)
  )
  if (existingExcludedEntriesColumns.size > 0 && !existingExcludedEntriesColumns.has('path')) {
    sqlite.exec(`DROP TABLE excluded_entries`)
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS excluded_entries (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      excluded_at TEXT NOT NULL
    )
  `)

  return drizzle(sqlite, { schema })
}

export type AppDatabase = ReturnType<typeof createDbClient>
