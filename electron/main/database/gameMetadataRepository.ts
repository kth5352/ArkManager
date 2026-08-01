import { eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { gameMetadata } from './schema'
import type { CrawledGameMetadata } from '../metadata/crawlGameMetadata'

export interface GameMetadataRow {
  code: string
  title: string | null
  circle: string | null
  releaseDate: string | null
  genres: string[]
  coverImagePath: string | null
  createdAt: string
  updatedAt: string
}

export function getGameMetadata(db: AppDatabase, code: string): GameMetadataRow | undefined {
  const row = db.select().from(gameMetadata).where(eq(gameMetadata.code, code)).get()
  if (!row) return undefined
  return { ...row, genres: row.genres ? (JSON.parse(row.genres) as string[]) : [] }
}

export function getManyGameMetadata(
  db: AppDatabase,
  codes: string[]
): Map<string, GameMetadataRow> {
  if (codes.length === 0) return new Map()

  const rows = db.select().from(gameMetadata).where(inArray(gameMetadata.code, codes)).all()
  return new Map(
    rows.map((row) => [
      row.code,
      { ...row, genres: row.genres ? (JSON.parse(row.genres) as string[]) : [] },
    ])
  )
}

// 크롤링 결과를 저장한다. coverImagePath는 여기서 건드리지 않는다 - Task 3의
// 이미지 캐시 다운로드가 성공한 뒤 별도로 채운다 (크롤링 자체는 성공했지만
// 이미지 다운로드만 실패하는 경우를 구분하기 위함).
export function saveGameMetadata(db: AppDatabase, code: string, data: CrawledGameMetadata): void {
  const now = new Date().toISOString()
  db.insert(gameMetadata)
    .values({
      code,
      title: data.title,
      circle: data.circle,
      releaseDate: data.releaseDate,
      genres: JSON.stringify(data.genres),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: gameMetadata.code,
      set: {
        title: data.title,
        circle: data.circle,
        releaseDate: data.releaseDate,
        genres: JSON.stringify(data.genres),
        updatedAt: now,
      },
    })
    .run()
}

// "캐시 삭제" (Settings) - wipes every crawled DLsite row (title/circle/
// genres/cover path). Never touches game_user_data - favorites, ratings,
// memos, launch configs, playtime, and save paths are the user's own data,
// not re-downloadable cache, and must survive this untouched.
export function clearAllGameMetadata(db: AppDatabase): void {
  db.delete(gameMetadata).run()
}

export function setGameMetadataCoverPath(
  db: AppDatabase,
  code: string,
  coverImagePath: string
): void {
  db.update(gameMetadata)
    .set({ coverImagePath, updatedAt: new Date().toISOString() })
    .where(eq(gameMetadata.code, code))
    .run()
}

// cover_image_path stores an absolute filesystem path under userData (see
// METADATA_CRAWL_AND_SAVE's cacheDir), unlike every other column here -
// migrateUserDataFolder.ts moves the actual cached .webp files to a renamed
// userData folder, but a moved file doesn't rewrite path strings stored
// elsewhere in the database that still point at the old location. Without
// this, every cover crawled before a userData migration (e.g. the
// DLibrary -> Ark Manager rename) points at a file that no longer exists
// there, and silently fails to load (METADATA_GET_COVER_IMAGE catches the
// ENOENT and returns null) - not just the image, since the earlier symptom
// this fixes read as "no info at all" for those entries. Intentionally not
// gated behind "did a migration actually happen" the way
// migrateUserDataFolder is - a plain startsWith scan over game_metadata is
// cheap enough to just always run, and naturally does nothing once nothing
// matches the old prefix anymore.
export function rewriteCoverImagePathPrefix(
  db: AppDatabase,
  oldPrefix: string,
  newPrefix: string
): void {
  if (oldPrefix === newPrefix) return

  const rows = db
    .select({ code: gameMetadata.code, coverImagePath: gameMetadata.coverImagePath })
    .from(gameMetadata)
    .all()

  for (const row of rows) {
    if (!row.coverImagePath?.startsWith(oldPrefix)) continue
    const rewritten = newPrefix + row.coverImagePath.slice(oldPrefix.length)
    db.update(gameMetadata)
      .set({ coverImagePath: rewritten })
      .where(eq(gameMetadata.code, row.code))
      .run()
  }
}
