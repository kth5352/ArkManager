import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { mediaThumbnailOverrides } from './schema'

export function getMediaThumbnailOverride(db: AppDatabase, filePath: string): string | null {
  const row = db
    .select({ thumbnailPath: mediaThumbnailOverrides.thumbnailPath })
    .from(mediaThumbnailOverrides)
    .where(eq(mediaThumbnailOverrides.path, filePath))
    .get()
  return row?.thumbnailPath ?? null
}

export function setMediaThumbnailOverride(
  db: AppDatabase,
  filePath: string,
  thumbnailPath: string
): void {
  db.insert(mediaThumbnailOverrides)
    .values({ path: filePath, thumbnailPath })
    .onConflictDoUpdate({ target: mediaThumbnailOverrides.path, set: { thumbnailPath } })
    .run()
}
