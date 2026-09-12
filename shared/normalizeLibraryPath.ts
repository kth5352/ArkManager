// Lowercased, trailing slash/backslash stripped - the canonical form used
// wherever a filesystem path is compared or stored as a lookup key (path-
// keyed favorites/ratings, library registration, code-less entry matching).
// Shared between main (source of truth for what's actually stored in the
// DB) and renderer (must normalize a live scanner path the same way before
// comparing it against a stored key) so the two can never drift apart.
//
// Exception: a bare drive letter ("f:", no trailing backslash) is NOT the
// same path as its root ("f:\") on Windows - fs calls against "f:" alone
// resolve to that process's current working directory ON the F: drive (a
// legacy per-drive-CWD quirk: e.g. fs.readdirSync('C:') on a real machine
// returned the current process's own cwd's files, not C:\'s root), not the
// drive's actual root, and silently succeed against the wrong directory
// instead of throwing anything a caller could detect. A live user
// registered a whole drive as a library this way and got zero games
// detected, with no error at all. Stripping the trailing separator is safe
// for every other path ("F:\Games\" and "F:\Games" mean the same thing)
// but corrupts a drive-root path's meaning entirely, so a bare drive letter
// gets exactly one trailing backslash appended back instead.
export function normalizeLibraryPath(path: string): string {
  const stripped = path.toLowerCase().replace(/[\\/]+$/, '')
  return /^[a-z]:$/.test(stripped) ? `${stripped}\\` : stripped
}
