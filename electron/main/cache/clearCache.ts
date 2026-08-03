import { rm } from 'node:fs/promises'
import { join } from 'node:path'

export interface ClearCacheOptions {
  deleteSaveBackups: boolean
}

// Only deletes userData/cache/covers, never the whole userData/cache/
// directory - on Windows, that folder is the same physical directory as
// Chromium's own "Cache" (case-insensitive filesystem, see
// migrateUserDataFolder.ts's own note on this), which the running app still
// has open. userData/saves (see saveHandlers.ts - one subfolder per game,
// each containing one timestamped snapshot subfolder per backup taken) is
// the one thing here that can't be recreated from DLsite - only deleted
// when the caller explicitly opts in.
export async function clearCache(userDataPath: string, options: ClearCacheOptions): Promise<void> {
  await rm(join(userDataPath, 'cache', 'covers'), { recursive: true, force: true })
  // cache/media-thumbnails is the auto-extraction cache resolveMediaThumbnail
  // writes to (video frames / embedded audio art pulled via ffmpeg) - a
  // regenerable, machine-derived cache exactly analogous to cache/covers, so
  // it's deleted unconditionally the same way. Deliberately NOT
  // cache/media-thumbnail-overrides (the manual-override cache) - that holds
  // an explicit user choice and must never be silently destroyed by "clear
  // cache", the same precedent that already keeps cache/custom-covers (game
  // covers) untouched here.
  await rm(join(userDataPath, 'cache', 'media-thumbnails'), { recursive: true, force: true })

  if (options.deleteSaveBackups) {
    await rm(join(userDataPath, 'saves'), { recursive: true, force: true })
  }
}
