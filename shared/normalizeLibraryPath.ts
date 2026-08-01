// Lowercased, trailing slash/backslash stripped - the canonical form used
// wherever a filesystem path is compared or stored as a lookup key (path-
// keyed favorites/ratings, library registration, code-less entry matching).
// Shared between main (source of truth for what's actually stored in the
// DB) and renderer (must normalize a live scanner path the same way before
// comparing it against a stored key) so the two can never drift apart.
export function normalizeLibraryPath(path: string): string {
  return path.toLowerCase().replace(/[\\/]+$/, '')
}
