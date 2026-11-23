import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import {
  excludedEntries,
  gameUserData,
  mediaPlaylistTracks,
  mediaThumbnailOverrides,
  mediaTrackLikes,
  pathCodeOverrides,
} from './schema'
import { normalizeLibraryPath } from '../../../shared/normalizeLibraryPath'
import { parseJsonSafely } from './safeJsonParse'

function hasExecutablePath(value: unknown): value is { executablePath: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).executablePath === 'string'
  )
}

// Length-preserving comparison form (separator + case folding only), so a
// stored path's suffix can be sliced off at the same index as its prefix.
function comparable(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/**
 * If `stored` is `oldPath` or lies under it, returns the same location under
 * `newPath` (the remainder keeps its original spelling); otherwise null.
 * A sibling that only shares the string prefix ("Circle2" vs "Circle") does
 * not match.
 */
export function remapUnderPrefix(stored: string, oldPath: string, newPath: string): string | null {
  const trimmedStored = stored.replace(/[\\/]+$/, '')
  const storedCmp = comparable(trimmedStored)
  const oldCmp = comparable(oldPath)
  const newBase = newPath.replace(/[\\/]+$/, '')
  if (storedCmp === oldCmp) return newBase
  if (!storedCmp.startsWith(`${oldCmp}/`)) return null
  return newBase + trimmedStored.slice(oldCmp.length)
}

/**
 * Carries everything recorded against a filesystem location over to where
 * it now lives, after a successful move or rename of `oldPath` to `newPath`
 * (a file or a whole folder). Covers both rows KEYED by path and absolute
 * paths stored INSIDE rows:
 *  - game_user_data: path-keyed rows (the entry and everything below it),
 *    plus every row's launch_config.executablePath and save_path
 *  - path_code_overrides, excluded_entries (normalized keys)
 *  - media_playlist_tracks, media_track_likes, media_thumbnail_overrides
 *    (raw absolute paths)
 * A pre-existing row at a destination key is overwritten, same as the
 * previous exact-path rekeyPath: a filesystem move cannot produce two
 * independent histories at one destination.
 */
export function rekeyMovedPath(db: AppDatabase, oldPath: string, newPath: string): void {
  if (comparable(oldPath) === comparable(newPath)) return
  const remap = (stored: string): string | null => remapUnderPrefix(stored, oldPath, newPath)
  const now = new Date().toISOString()

  db.transaction((tx) => {
    for (const row of tx.select().from(gameUserData).all()) {
      const updates: Partial<typeof gameUserData.$inferInsert> = {}

      const config = row.launchConfig
        ? parseJsonSafely(row.launchConfig, hasExecutablePath, 'game_user_data.launch_config')
        : null
      if (config) {
        const moved = remap(config.executablePath)
        if (moved) updates.launchConfig = JSON.stringify({ ...config, executablePath: moved })
      }
      if (row.savePath) {
        const moved = remap(row.savePath)
        if (moved) updates.savePath = moved
      }

      const movedKey = row.keyType === 'path' ? remap(row.key) : null
      if (movedKey) {
        const newKey = normalizeLibraryPath(movedKey)
        tx.delete(gameUserData).where(eq(gameUserData.key, newKey)).run()
        tx.update(gameUserData)
          .set({ ...updates, key: newKey, updatedAt: now })
          .where(eq(gameUserData.key, row.key))
          .run()
      } else if (Object.keys(updates).length > 0) {
        tx.update(gameUserData)
          .set({ ...updates, updatedAt: now })
          .where(eq(gameUserData.key, row.key))
          .run()
      }
    }

    for (const row of tx.select().from(pathCodeOverrides).all()) {
      const moved = remap(row.path)
      if (!moved) continue
      const newKey = normalizeLibraryPath(moved)
      tx.delete(pathCodeOverrides).where(eq(pathCodeOverrides.path, newKey)).run()
      tx.update(pathCodeOverrides)
        .set({ path: newKey })
        .where(eq(pathCodeOverrides.path, row.path))
        .run()
    }

    for (const row of tx.select().from(excludedEntries).all()) {
      const moved = remap(row.path)
      if (!moved) continue
      const newKey = normalizeLibraryPath(moved)
      tx.delete(excludedEntries).where(eq(excludedEntries.path, newKey)).run()
      tx.update(excludedEntries)
        .set({ path: newKey })
        .where(eq(excludedEntries.path, row.path))
        .run()
    }

    for (const row of tx.select().from(mediaPlaylistTracks).all()) {
      const moved = remap(row.path)
      if (!moved) continue
      tx.update(mediaPlaylistTracks)
        .set({ path: moved })
        .where(
          and(
            eq(mediaPlaylistTracks.playlistId, row.playlistId),
            eq(mediaPlaylistTracks.position, row.position)
          )
        )
        .run()
    }

    for (const row of tx.select().from(mediaTrackLikes).all()) {
      const moved = remap(row.path)
      if (!moved) continue
      tx.delete(mediaTrackLikes).where(eq(mediaTrackLikes.path, moved)).run()
      tx.update(mediaTrackLikes)
        .set({ path: moved })
        .where(eq(mediaTrackLikes.path, row.path))
        .run()
    }

    for (const row of tx.select().from(mediaThumbnailOverrides).all()) {
      const moved = remap(row.path)
      if (!moved) continue
      tx.delete(mediaThumbnailOverrides).where(eq(mediaThumbnailOverrides.path, moved)).run()
      tx.update(mediaThumbnailOverrides)
        .set({ path: moved })
        .where(eq(mediaThumbnailOverrides.path, row.path))
        .run()
    }
  })
}
