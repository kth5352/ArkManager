import type Database from 'better-sqlite3'
import { normalizeLibraryPath } from '../../../shared/normalizeLibraryPath'

// One-time self-heal for libraries registered before normalizeLibraryPath
// started keeping a bare drive letter's trailing backslash ("f:\", not
// "f:"). addLibrary only ever normalizes a path at insert time, so an
// already-stored "f:" row would otherwise sit broken forever even after
// updating - a live user registered a whole drive this way and got zero
// games detected, with no error, because fs calls against "f:" alone
// resolve to that process's current working directory ON that drive (a
// legacy per-drive-CWD quirk), not the drive's actual root. Runs on every
// startup (see client.ts) but is a no-op once every row is already
// canonical, same as this project's other startup migrations.
export function migrateBareDriveLibraryPaths(sqlite: Database.Database): void {
  const rows = sqlite.prepare(`SELECT id, path FROM libraries`).all() as {
    id: string
    path: string
  }[]
  const update = sqlite.prepare(`UPDATE OR IGNORE libraries SET path = ? WHERE id = ?`)

  for (const row of rows) {
    const normalized = normalizeLibraryPath(row.path)
    if (normalized !== row.path) update.run(normalized, row.id)
  }
}
