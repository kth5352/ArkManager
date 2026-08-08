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
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-db-'))
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
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-db-'))
    const dbPath = join(dir, 'current.db')

    const first = createDbClient(dbPath)
    first.$client.close()

    const second = createDbClient(dbPath)
    second.$client.close()
  })
})

describe('createDbClient legacy VNDB code migration', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('migrates exact legacy database identities and is idempotent', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-db-'))
    const dbPath = join(dir, 'legacy-vndb.db')
    const raw = new Database(dbPath)

    raw.exec(`
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
    const createdAt = '2026-01-08T00:00:00.000Z'
    const metadataInsert = raw.prepare(
      `INSERT INTO game_metadata
        (code, title, circle, release_date, genres, cover_image_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    metadataInsert.run(
      'VN17',
      'Legacy VN',
      'Legacy Circle',
      '2025-02-03',
      '["adventure","drama"]',
      'C:\\covers\\VN17.webp',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    )
    metadataInsert.run('VNV1', 'False filename cache', null, null, null, null, createdAt, createdAt)
    const failureInsert = raw.prepare(
      `INSERT INTO metadata_failures (code, attempted_sources, reason, updated_at)
       VALUES (?, ?, ?, ?)`
    )
    failureInsert.run('VR20', '["vndb"]', 'not found', '2026-01-03T00:00:00.000Z')
    failureInsert.run('VNV912', '["vndb"]', 'not_found', createdAt)
    raw
      .prepare(
        `INSERT INTO game_user_data
          (key, key_type, is_favorite, is_cleared, rating, memo, launch_config,
           total_playtime_ms, last_played_at, save_path, custom_cover_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'VN17',
        'code',
        1,
        1,
        5,
        'keep this memo',
        '{"executablePath":"C:\\\\games\\\\vn17.exe","launchMode":"direct"}',
        123456,
        '2026-01-04T00:00:00.000Z',
        'C:\\saves\\VN17',
        'C:\\covers\\custom-VN17.webp',
        '2026-01-01T00:00:00.000Z',
        '2026-01-05T00:00:00.000Z'
      )
    raw
      .prepare(`INSERT INTO path_code_overrides (path, code, created_at) VALUES (?, ?, ?)`)
      .run('C:\\games\\legacy-vn', 'VN17', '2026-01-06T00:00:00.000Z')
    raw
      .prepare(
        `INSERT INTO save_snapshot_labels (key, timestamp, memo, version) VALUES (?, ?, ?, ?)`
      )
      .run('VR20', '2026-01-07T00:00:00.000Z', 'before route', '1.2.3')
    raw.close()

    const first = createDbClient(dbPath)
    const firstRows = {
      metadata: first.$client.prepare(`SELECT * FROM game_metadata ORDER BY code`).all(),
      failures: first.$client.prepare(`SELECT * FROM metadata_failures ORDER BY code`).all(),
      userData: first.$client.prepare(`SELECT * FROM game_user_data ORDER BY key`).all(),
      overrides: first.$client.prepare(`SELECT * FROM path_code_overrides ORDER BY path`).all(),
      labels: first.$client
        .prepare(`SELECT * FROM save_snapshot_labels ORDER BY key, timestamp`)
        .all(),
    }
    first.$client.close()

    const metadataCodes = firstRows.metadata.map((row) => (row as { code: string }).code)
    const failureCodes = firstRows.failures.map((row) => (row as { code: string }).code)
    expect(metadataCodes).toEqual(['VNV17'])
    expect(failureCodes).toEqual(['VNR20'])
    expect(metadataCodes).not.toContain('VNV1')
    expect(failureCodes).not.toContain('VNV912')

    expect(firstRows.metadata).toEqual([
      {
        code: 'VNV17',
        title: 'Legacy VN',
        circle: 'Legacy Circle',
        release_date: '2025-02-03',
        genres: '["adventure","drama"]',
        cover_image_path: 'C:\\covers\\VN17.webp',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
    ])
    expect(firstRows.failures).toEqual([
      {
        code: 'VNR20',
        attempted_sources: '["vndb"]',
        reason: 'not found',
        updated_at: '2026-01-03T00:00:00.000Z',
      },
    ])
    expect(firstRows.userData).toEqual([
      {
        key: 'VNV17',
        key_type: 'code',
        is_favorite: 1,
        is_cleared: 1,
        rating: 5,
        memo: 'keep this memo',
        launch_config: '{"executablePath":"C:\\\\games\\\\vn17.exe","launchMode":"direct"}',
        total_playtime_ms: 123456,
        last_played_at: '2026-01-04T00:00:00.000Z',
        save_path: 'C:\\saves\\VN17',
        custom_cover_path: 'C:\\covers\\custom-VN17.webp',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-05T00:00:00.000Z',
      },
    ])
    expect(firstRows.overrides).toEqual([
      {
        path: 'C:\\games\\legacy-vn',
        code: 'VNV17',
        created_at: '2026-01-06T00:00:00.000Z',
      },
    ])
    expect(firstRows.labels).toEqual([
      {
        key: 'VNR20',
        timestamp: '2026-01-07T00:00:00.000Z',
        memo: 'before route',
        version: '1.2.3',
      },
    ])

    const second = createDbClient(dbPath)
    try {
      expect({
        metadata: second.$client.prepare(`SELECT * FROM game_metadata ORDER BY code`).all(),
        failures: second.$client.prepare(`SELECT * FROM metadata_failures ORDER BY code`).all(),
        userData: second.$client.prepare(`SELECT * FROM game_user_data ORDER BY key`).all(),
        overrides: second.$client.prepare(`SELECT * FROM path_code_overrides ORDER BY path`).all(),
        labels: second.$client
          .prepare(`SELECT * FROM save_snapshot_labels ORDER BY key, timestamp`)
          .all(),
      }).toEqual(firstRows)
    } finally {
      second.$client.close()
    }
  })

  it('preserves legacy and canonical metadata rows when the canonical key exists', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-db-'))
    const dbPath = join(dir, 'legacy-vndb-conflict.db')
    const raw = new Database(dbPath)

    raw.exec(`
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
      CREATE TABLE path_code_overrides (
        path TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
    const insert = raw.prepare(
      `INSERT INTO game_metadata
        (code, title, circle, release_date, genres, cover_image_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    insert.run(
      'VN17',
      'Legacy title',
      null,
      null,
      null,
      null,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z'
    )
    insert.run(
      'VNV17',
      'Canonical title',
      null,
      null,
      null,
      null,
      '2026-02-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z'
    )
    raw
      .prepare(`INSERT INTO path_code_overrides (path, code, created_at) VALUES (?, ?, ?)`)
      .run('C:\\games\\legacy-vn', 'VN17', '2026-01-03T00:00:00.000Z')
    raw.close()

    const first = createDbClient(dbPath)
    const firstRows = {
      metadata: first.$client.prepare(`SELECT * FROM game_metadata ORDER BY code`).all(),
      overrides: first.$client.prepare(`SELECT * FROM path_code_overrides ORDER BY path`).all(),
    }
    first.$client.close()

    expect(firstRows).toEqual({
      metadata: [
        {
          code: 'VN17',
          title: 'Legacy title',
          circle: null,
          release_date: null,
          genres: null,
          cover_image_path: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          code: 'VNV17',
          title: 'Canonical title',
          circle: null,
          release_date: null,
          genres: null,
          cover_image_path: null,
          created_at: '2026-02-01T00:00:00.000Z',
          updated_at: '2026-02-01T00:00:00.000Z',
        },
      ],
      overrides: [
        {
          path: 'C:\\games\\legacy-vn',
          code: 'VNV17',
          created_at: '2026-01-03T00:00:00.000Z',
        },
      ],
    })

    const second = createDbClient(dbPath)
    try {
      expect({
        metadata: second.$client.prepare(`SELECT * FROM game_metadata ORDER BY code`).all(),
        overrides: second.$client.prepare(`SELECT * FROM path_code_overrides ORDER BY path`).all(),
      }).toEqual(firstRows)
    } finally {
      second.$client.close()
    }
  })
})
