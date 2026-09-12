import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { migrateBareDriveLibraryPaths } from './migrateBareDriveLibraryPaths'

function createLibrariesDb(): Database.Database {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE libraries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )
  `)
  return sqlite
}

describe('migrateBareDriveLibraryPaths', () => {
  it('appends a trailing backslash to an already-stored bare drive-letter path', () => {
    const sqlite = createLibrariesDb()
    sqlite
      .prepare(`INSERT INTO libraries (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
      .run('lib-1', 'F Drive', 'f:', '2026-01-01T00:00:00.000Z')

    migrateBareDriveLibraryPaths(sqlite)

    expect(sqlite.prepare(`SELECT path FROM libraries WHERE id = 'lib-1'`).pluck().get()).toBe(
      'f:\\'
    )
  })

  it('leaves an already-canonical subfolder path untouched', () => {
    const sqlite = createLibrariesDb()
    sqlite
      .prepare(`INSERT INTO libraries (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
      .run('lib-1', 'Games', 'f:\\games', '2026-01-01T00:00:00.000Z')

    migrateBareDriveLibraryPaths(sqlite)

    expect(sqlite.prepare(`SELECT path FROM libraries WHERE id = 'lib-1'`).pluck().get()).toBe(
      'f:\\games'
    )
  })

  it('is idempotent across repeated runs (simulating multiple app launches)', () => {
    const sqlite = createLibrariesDb()
    sqlite
      .prepare(`INSERT INTO libraries (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
      .run('lib-1', 'F Drive', 'f:', '2026-01-01T00:00:00.000Z')

    migrateBareDriveLibraryPaths(sqlite)
    migrateBareDriveLibraryPaths(sqlite)
    migrateBareDriveLibraryPaths(sqlite)

    expect(sqlite.prepare(`SELECT path FROM libraries WHERE id = 'lib-1'`).pluck().get()).toBe(
      'f:\\'
    )
  })

  it('does not crash if both the bare and already-corrected path somehow already exist', () => {
    const sqlite = createLibrariesDb()
    sqlite
      .prepare(`INSERT INTO libraries (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
      .run('lib-1', 'F Drive (bad)', 'f:', '2026-01-01T00:00:00.000Z')
    sqlite
      .prepare(`INSERT INTO libraries (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
      .run('lib-2', 'F Drive (already fixed)', 'f:\\', '2026-01-02T00:00:00.000Z')

    expect(() => migrateBareDriveLibraryPaths(sqlite)).not.toThrow()
  })
})
