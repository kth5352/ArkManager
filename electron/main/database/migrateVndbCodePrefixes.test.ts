import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { legacyVndbCodeToCanonical, migrateVndbCodePrefixes } from './migrateVndbCodePrefixes'

describe('legacyVndbCodeToCanonical', () => {
  it('converts only exact legacy VNDB codes', () => {
    expect(legacyVndbCodeToCanonical('VN17')).toBe('VNV17')
    expect(legacyVndbCodeToCanonical('VR45775')).toBe('VNR45775')
    expect(legacyVndbCodeToCanonical('VNV17')).toBeNull()
    expect(legacyVndbCodeToCanonical('VN1junk')).toBeNull()
  })
})

describe('migrateVndbCodePrefixes', () => {
  it('preserves caches only for exact user-owned legacy code references', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE game_metadata (
        code TEXT PRIMARY KEY,
        title TEXT,
        circle TEXT,
        release_date TEXT,
        genres TEXT,
        cover_image_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE metadata_failures (
        code TEXT PRIMARY KEY,
        attempted_sources TEXT NOT NULL,
        reason TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE game_user_data (
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
      );
      CREATE TABLE path_code_overrides (
        path TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE save_snapshot_labels (
        key TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        memo TEXT,
        version TEXT,
        PRIMARY KEY (key, timestamp)
      );
    `)
    const createdAt = '2026-01-01T00:00:00.000Z'
    const metadataInsert = sqlite.prepare(
      `INSERT INTO game_metadata
        (code, title, circle, release_date, genres, cover_image_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const code of ['VN17', 'VN30', 'VN40', 'VN1']) {
      metadataInsert.run(code, code, null, null, null, null, createdAt, createdAt)
    }
    const failureInsert = sqlite.prepare(
      `INSERT INTO metadata_failures (code, attempted_sources, reason, updated_at)
       VALUES (?, ?, ?, ?)`
    )
    failureInsert.run('VR20', '["vndb"]', 'not_found', createdAt)
    failureInsert.run('VR2', '["vndb"]', 'not_found', createdAt)
    const userDataInsert = sqlite.prepare(
      `INSERT INTO game_user_data (key, key_type, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    )
    userDataInsert.run('VN17', 'code', createdAt, createdAt)
    userDataInsert.run('VN40', 'path', createdAt, createdAt)
    sqlite
      .prepare(`INSERT INTO path_code_overrides (path, code, created_at) VALUES (?, ?, ?)`)
      .run('C:\\games\\legacy-vr', 'VR20', createdAt)
    sqlite
      .prepare(
        `INSERT INTO save_snapshot_labels (key, timestamp, memo, version) VALUES (?, ?, ?, ?)`
      )
      .run('VN30', createdAt, 'owned snapshot', '1.0.0')

    migrateVndbCodePrefixes(sqlite)

    expect(sqlite.prepare(`SELECT code FROM game_metadata ORDER BY code`).pluck().all()).toEqual([
      'VNV17',
      'VNV30',
    ])
    expect(
      sqlite.prepare(`SELECT code FROM metadata_failures ORDER BY code`).pluck().all()
    ).toEqual(['VNR20'])
    expect(sqlite.prepare(`SELECT key, key_type FROM game_user_data ORDER BY key`).all()).toEqual([
      { key: 'VN40', key_type: 'path' },
      { key: 'VNV17', key_type: 'code' },
    ])
    expect(sqlite.prepare(`SELECT code FROM path_code_overrides`).pluck().get()).toBe('VNR20')
    expect(sqlite.prepare(`SELECT key FROM save_snapshot_labels`).pluck().get()).toBe('VNV30')

    sqlite.close()
  })
})
