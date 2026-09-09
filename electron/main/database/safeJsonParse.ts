// A DB row's JSON-in-a-text-column value can go corrupt in ways the app
// itself never produces - a partial write from a crash mid-save, manual
// editing of the .db file, a future migration bug. JSON.parse() throws on
// invalid syntax, and even valid JSON can have the wrong shape (e.g. a
// launchConfig written by some future/older version of this app with
// different fields). Used by gameUserDataRepository, gameMetadataRepository,
// and metadataFailuresRepository so one corrupted row degrades to a safe
// fallback for just that field instead of throwing - which would otherwise
// fail a whole batch fetch (getManyGameMetadata) or a single game's entire
// read, not just the one corrupted field.
//
// Never touches the DB - the caller decides what to return to the UI, but
// the original (corrupted) value on disk is left exactly as-is, so a future
// app version with different parsing logic (or a manual fix) still has the
// original bytes to work with.
export function parseJsonSafely<T>(
  raw: string,
  isValid: (value: unknown) => value is T,
  context: string
): T | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.warn(`[safeJsonParse] Corrupted JSON in ${context}, ignoring:`, error)
    return null
  }
  if (!isValid(parsed)) {
    console.warn(`[safeJsonParse] JSON in ${context} has an unexpected shape, ignoring:`, parsed)
    return null
  }
  return parsed
}
