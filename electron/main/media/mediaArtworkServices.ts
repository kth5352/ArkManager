import { isVideoFile } from '../../../shared/isMediaFile'
import { artworkDepsWithWorkCover, resolveMediaArtwork } from './resolveMediaThumbnail'
import type { MediaArtwork } from './resolveMediaThumbnail'
import { workCoverLookupFromDb } from './workCoverLookup'
import type { ArtworkCache } from './mediaArtworkCache'
import type { AppDatabase } from '../database/client'

// The one object the handlers/protocol share: owns the single artwork cache and
// is the ONLY place invalidation + the renderer notification happen together.
export interface MediaArtworkServices {
  cache: ArtworkCache
  resolve(filePath: string): Promise<MediaArtwork | null>
  /** One track's artwork changed (embedded cover inserted, user override set). */
  invalidateTrack(filePath: string): Promise<void>
  /** Any work-level cover changed (crawl, custom cover, code link): notifies everything. */
  bumpWorkCover(): Promise<void>
  /** Persist the generation bump without notifying (bulk crawl batches the notification). */
  bumpWorkCoverQuiet(): Promise<void>
  notifyWorkCover(): void
}

export function createMediaArtworkServices(
  cache: ArtworkCache,
  notify: (filePath: string | null) => void,
  findWorkCover?: (filePath: string) => Promise<string | null>
): MediaArtworkServices {
  const deps = artworkDepsWithWorkCover(async (filePath) => {
    try {
      return (await findWorkCover?.(filePath)) ?? null
    } catch {
      return null
    }
  })
  // The in-memory generation is already incremented, so views refetch
  // correctly even when persisting it fails; never make the caller's
  // (already committed) operation look failed.
  async function bumpWorkCoverQuiet(): Promise<void> {
    try {
      await cache.bumpWorkCoverGeneration()
    } catch (error) {
      console.error('Failed to persist work cover generation:', error)
    }
  }
  return {
    cache,
    resolve: (filePath) => resolveMediaArtwork(cache, filePath, isVideoFile(filePath), deps),
    async invalidateTrack(filePath) {
      try {
        await cache.invalidate(filePath)
      } catch (error) {
        console.error('Failed to invalidate media artwork cache:', error)
      }
      notify(filePath)
    },
    bumpWorkCoverQuiet,
    notifyWorkCover: () => notify(null),
    async bumpWorkCover() {
      await bumpWorkCoverQuiet()
      notify(null)
    },
  }
}

export function createMediaArtworkServicesFromDb(
  db: AppDatabase,
  cache: ArtworkCache,
  notify: (filePath: string | null) => void
): MediaArtworkServices {
  return createMediaArtworkServices(cache, notify, workCoverLookupFromDb(db))
}
