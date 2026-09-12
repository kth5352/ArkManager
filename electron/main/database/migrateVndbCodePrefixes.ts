import Database from 'better-sqlite3'

interface TableMigration {
  table: string
  keyColumn: string
  columns: string[]
  deleteColumns: string[]
}

const TABLE_MIGRATIONS: TableMigration[] = [
  {
    table: 'game_metadata',
    keyColumn: 'code',
    columns: [
      'code',
      'title',
      'circle',
      'release_date',
      'genres',
      'cover_image_path',
      'work_type',
      'created_at',
      'updated_at',
    ],
    deleteColumns: ['code'],
  },
  {
    table: 'metadata_failures',
    keyColumn: 'code',
    columns: ['code', 'attempted_sources', 'reason', 'updated_at'],
    deleteColumns: ['code'],
  },
  {
    table: 'game_user_data',
    keyColumn: 'key',
    columns: [
      'key',
      'key_type',
      'is_favorite',
      'is_cleared',
      'rating',
      'memo',
      'launch_config',
      'total_playtime_ms',
      'last_played_at',
      'save_path',
      'custom_cover_path',
      'created_at',
      'updated_at',
    ],
    deleteColumns: ['key'],
  },
  {
    table: 'save_snapshot_labels',
    keyColumn: 'key',
    columns: ['key', 'timestamp', 'memo', 'version'],
    deleteColumns: ['key', 'timestamp'],
  },
]

export function legacyVndbCodeToCanonical(value: string): string | null {
  const vn = /^VN(\d+)$/.exec(value)
  if (vn) return `VNV${vn[1]}`
  const vr = /^VR(\d+)$/.exec(value)
  return vr ? `VNR${vr[1]}` : null
}

function vndbCodeToCanonicalIdentity(value: string): string | null {
  const migrated = legacyVndbCodeToCanonical(value)
  if (migrated) return migrated
  return /^(?:VNV|VNR)\d+$/.test(value) ? value : null
}

function collectReferencedCanonicalCodes(sqlite: Database.Database): Set<string> {
  const referenced = new Set<string>()
  const rows = sqlite
    .prepare(
      `SELECT key AS value FROM game_user_data WHERE key_type = 'code'
       UNION SELECT code AS value FROM path_code_overrides
       UNION SELECT key AS value FROM save_snapshot_labels`
    )
    .all() as { value: string }[]

  for (const row of rows) {
    const canonicalIdentity = vndbCodeToCanonicalIdentity(row.value)
    if (canonicalIdentity) referenced.add(canonicalIdentity)
  }

  return referenced
}

export function migrateVndbCodePrefixes(sqlite: Database.Database): void {
  sqlite.transaction(() => {
    const referenced = collectReferencedCanonicalCodes(sqlite)

    for (const migration of TABLE_MIGRATIONS) {
      const rows = sqlite.prepare(`SELECT * FROM ${migration.table}`).all() as Record<
        string,
        unknown
      >[]
      const placeholders = migration.columns.map(() => '?').join(', ')
      const insert = sqlite.prepare(
        `INSERT OR IGNORE INTO ${migration.table} (${migration.columns.join(', ')}) VALUES (${placeholders})`
      )
      const deleteSource = sqlite.prepare(
        `DELETE FROM ${migration.table} WHERE ${migration.deleteColumns
          .map((column) => `${column} = ?`)
          .join(' AND ')}`
      )

      for (const row of rows) {
        const legacyKey = row[migration.keyColumn]
        if (typeof legacyKey !== 'string') continue
        if (migration.table === 'game_user_data' && row.key_type !== 'code') continue
        const canonicalKey = legacyVndbCodeToCanonical(legacyKey)
        const isCacheTable =
          migration.table === 'game_metadata' || migration.table === 'metadata_failures'
        // Only a genuinely LEGACY-keyed cache row (canonicalKey non-null - "VN"/"VR", not
        // already "VNV"/"VNR") is ever a migration candidate at all, so only that kind of
        // row should be discarded here when unreferenced - it's a stale row about to be
        // superseded (or simply orphaned) by the migration below. Using
        // vndbCodeToCanonicalIdentity's broader match (which also accepts an ALREADY-
        // canonical code) as this branch's own gate deleted every VNDB game_metadata/
        // metadata_failures row on every single app launch unless the game had a
        // favorite/rating/save/override too - a live user found this: a normal library
        // entry nobody had rated/favorited yet, sitting in canonical VNV/VNR form with a
        // perfectly good crawled row already, got wiped and re-crawled from scratch on
        // every startup, forever, since nothing here actually needed migrating.
        if (isCacheTable && canonicalKey && !referenced.has(canonicalKey)) {
          deleteSource.run(...migration.deleteColumns.map((column) => row[column]))
          continue
        }
        if (!canonicalKey) continue

        const values = migration.columns.map((column) =>
          column === migration.keyColumn ? canonicalKey : row[column]
        )
        const result = insert.run(...values)
        if (result.changes === 1) {
          deleteSource.run(...migration.deleteColumns.map((column) => row[column]))
        }
      }
    }

    const overrides = sqlite.prepare(`SELECT path, code FROM path_code_overrides`).all() as {
      path: string
      code: string
    }[]
    const updateOverride = sqlite.prepare(
      `UPDATE path_code_overrides SET code = ? WHERE path = ? AND code = ?`
    )
    for (const override of overrides) {
      const canonicalCode = legacyVndbCodeToCanonical(override.code)
      if (canonicalCode) {
        updateOverride.run(canonicalCode, override.path, override.code)
      }
    }
  })()
}
