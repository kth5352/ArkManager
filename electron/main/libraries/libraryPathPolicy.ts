import { resolve } from 'node:path'

// A registered library becomes a trust root: the app may rename, move, trash
// and launch things under it, and every other path check ("is it inside a
// library?") is relative to it. Registering the wrong folder silently turns
// those guards into no-ops, so a few folders can never be libraries:
//   - the app's own data folder, or any folder that CONTAINS it (C:\, C:\Users,
//     the user profile, AppData ...) - otherwise the database, save backups
//     and caches become "library files"
//   - Windows, Program Files and ProgramData (system / installed programs)
export interface ProtectedLocations {
  userDataDir: string
  windowsDir?: string
  programFilesDirs?: string[]
  programDataDir?: string
}

function norm(p: string): string {
  return resolve(p)
    .replace(/[\\/]+$/, '')
    .replace(/\\/g, '/')
    .toLowerCase()
}

function isSameOrInside(child: string, parent: string): boolean {
  const c = norm(child)
  const p = norm(parent)
  return c === p || c.startsWith(`${p}/`)
}

/** Returns a human-readable reason when `candidate` must not be a library, otherwise null. */
export function libraryPathRejection(candidate: string, loc: ProtectedLocations): string | null {
  if (candidate.includes('\0')) return 'invalid path'
  const resolved = resolve(candidate)
  if (isSameOrInside(loc.userDataDir, resolved) || isSameOrInside(resolved, loc.userDataDir)) {
    return 'contains the application data folder'
  }
  const protectedRoots = [loc.windowsDir, loc.programDataDir, ...(loc.programFilesDirs ?? [])].filter(
    (p): p is string => Boolean(p)
  )
  for (const root of protectedRoots) {
    if (isSameOrInside(resolved, root) || isSameOrInside(root, resolved)) {
      return 'is a protected system folder'
    }
  }
  return null
}
