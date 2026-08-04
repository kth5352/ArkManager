import { normalizeLibraryPath } from '../../shared/normalizeLibraryPath'
import type { ScannedEntry } from '../../shared/types/scanner'

// Deliberately always path-based, even for code-linked entries - excluding
// is "hide this specific file/folder", not "hide this game". Keying by
// code (like game_user_data/favorites do) would hide every duplicate
// sharing that code the moment one copy was excluded, which isn't what a
// user right-clicking one specific card means.
export function isEntryExcluded(
  entry: Pick<ScannedEntry, 'path'>,
  excludedPaths: Set<string>
): boolean {
  return excludedPaths.has(normalizeLibraryPath(entry.path))
}
