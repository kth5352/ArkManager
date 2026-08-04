import { normalizeLibraryPath } from '../../shared/normalizeLibraryPath'
import type { ScannedEntry } from '../../shared/types/scanner'

// Same identity model resolveGameEntryKey uses main-process-side (code
// value when linked, else normalizeLibraryPath(path)) - kept in sync by
// importing the same shared normalization function, not a duplicated copy.
export function isEntryExcluded(
  entry: Pick<ScannedEntry, 'code' | 'path'>,
  excludedKeys: Set<string>
): boolean {
  const key = entry.code ? entry.code.value : normalizeLibraryPath(entry.path)
  return excludedKeys.has(key)
}
