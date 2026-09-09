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
// This function itself never touches the DB - a plain read (getGameUserData,
// getGameMetadata, getManyGameMetadata, getMetadataFailure) leaves the
// original (corrupted) column value on disk exactly as-is. That guarantee
// does NOT extend to every caller of those read functions, though -
// gameUserDataRepository's rekeyToCode/rekeyPath read a row via
// getGameUserData and then WRITE it back (re-serializing whatever
// launchConfig came back, i.e. null for a corrupted one) as part of their
// own normal move/merge behavior, which does replace the original bytes.
// That's an accepted, pre-existing consequence of reusing the read path
// there, not something this helper can or should prevent.
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
