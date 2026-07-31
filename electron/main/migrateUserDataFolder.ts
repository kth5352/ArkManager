import { existsSync, statSync } from 'node:fs'
import { readdir, rename } from 'node:fs/promises'
import { join } from 'node:path'

export const OLD_DB_FILENAME = 'dlibrary.db'
export const NEW_DB_FILENAME = 'ark-manager.db'

// SQLite in WAL mode (see client.ts) keeps not-yet-checkpointed writes in a
// sidecar file named after the main db file - these must move (and get
// renamed) alongside it, or a handful of very recent writes could be
// silently dropped when the app starts fresh at the new db filename instead
// of picking the WAL back up.
const DB_FILE_RENAMES: Readonly<Record<string, string>> = {
  [OLD_DB_FILENAME]: NEW_DB_FILENAME,
  [`${OLD_DB_FILENAME}-wal`]: `${NEW_DB_FILENAME}-wal`,
  [`${OLD_DB_FILENAME}-shm`]: `${NEW_DB_FILENAME}-shm`,
  [`${OLD_DB_FILENAME}-journal`]: `${NEW_DB_FILENAME}-journal`,
}

// Moves oldDir's entries into newDir, renaming any name found in renameMap.
// A name already present at the destination is not simply skipped: Windows'
// case-insensitive filesystem means this app's own cover-image cache
// (cacheCoverImage.ts creates userData/cache/covers) lands inside the very
// same physical directory as Chromium's own "Cache" folder, which already
// exists by the time this runs (see migrateUserDataFolder's own comment) -
// skipping the whole "cache" entry on sight would silently strand every
// cached cover image. Recursing into an existing directory collision merges
// in only what's actually missing, leaving anything already there (e.g.
// Chromium's own Cache_Data) untouched.
async function mergeMove(
  oldDir: string,
  newDir: string,
  renameMap: Readonly<Record<string, string>> = {}
): Promise<void> {
  const entries = await readdir(oldDir, { withFileTypes: true })

  for (const entry of entries) {
    const destinationName = renameMap[entry.name] ?? entry.name
    const from = join(oldDir, entry.name)
    const to = join(newDir, destinationName)

    if (!existsSync(to)) {
      try {
        await rename(from, to)
      } catch {
        // Best-effort - a locked/in-use file shouldn't abort migrating the
        // rest of the folder.
      }
      continue
    }

    if (entry.isDirectory() && statSync(to).isDirectory()) {
      await mergeMove(from, to)
    }
    // Otherwise something already occupies this name at the destination
    // (and isn't a directory pair to merge into) - leave the old copy in
    // place rather than risk clobbering something live.
  }
}

// The app was renamed from "dlibrary" to "ark-manager" (see package.json) -
// Electron derives the userData directory from the app's own name by
// default, so the rename alone would silently orphan every already-
// installed user's registered libraries, ratings, launch configs, and
// cover-image cache, left behind under the old-named folder forever.
//
// By the time this runs (inside app.whenReady(), before createDbClient),
// Electron/Chromium has already created and populated the NEW userData
// folder with its own internal files (Local State, Session Storage, GPU
// cache, etc.) as part of its own startup - it is never actually empty or
// missing here, so this can't just rename the whole old folder onto it.
// Whether a migration is needed is instead detected via the new db file's
// own presence. The old folder itself is left in place afterward rather
// than deleted - safer than risking removing something unexpected, and
// it's a few KB of leftover data at most.
export async function migrateUserDataFolder(oldPath: string, newPath: string): Promise<void> {
  if (oldPath === newPath) return
  if (existsSync(join(newPath, NEW_DB_FILENAME))) return // already migrated
  if (!existsSync(join(oldPath, OLD_DB_FILENAME))) return // nothing to migrate

  await mergeMove(oldPath, newPath, DB_FILE_RENAMES)
}
