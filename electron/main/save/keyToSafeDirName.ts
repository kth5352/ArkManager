import { createHash } from 'node:crypto'

// resolveGameEntryKey() returns either a code (e.g. "RJ01234567", already a
// bare-safe filename) or, for code-less games, a normalized raw filesystem
// path (e.g. "d:\\games\\myfolder" - see normalizeLibraryPath). The latter
// cannot be used directly as a single join()/mkdir() path segment: the
// drive-letter colon and backslashes are structural/reserved on Windows, so
// passing one straight through throws (e.g. ENOENT) instead of creating a
// literal folder named that. Hash anything that isn't already a safe bare
// segment into a fixed-length hex token instead.
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/

export function keyToSafeDirName(key: string): string {
  if (SAFE_SEGMENT.test(key)) return key
  return createHash('sha256').update(key).digest('hex')
}
