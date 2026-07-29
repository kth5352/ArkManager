import type { AppDatabase } from '../database/client'
import { getPathCodeOverride } from '../database/pathCodeOverridesRepository'
import { normalizeLibraryPath } from '../database/librariesRepository'
import type { GameCode, GameCodeType, ScannedEntry } from '../../../shared/types/scanner'

function toGameCode(code: string): GameCode {
  const type = code.slice(0, 2) as GameCodeType
  return { type, value: code }
}

// The scanner (folderScanner.ts) derives ScannedEntry.code purely from the
// filename and has no database dependency. This runs as a post-processing
// step over its results so a manually-linked code (see path_code_overrides,
// set via the "코드 연동" feature) keeps showing up on future scans without
// requiring the user to rename the folder.
export function applyPathCodeOverrides(db: AppDatabase, entries: ScannedEntry[]): ScannedEntry[] {
  return entries.map((entry) => {
    if (entry.code) return entry
    const overrideCode = getPathCodeOverride(db, normalizeLibraryPath(entry.path))
    if (!overrideCode) return entry
    return { ...entry, code: toGameCode(overrideCode) }
  })
}
