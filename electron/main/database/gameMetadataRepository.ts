import { eq } from 'drizzle-orm'
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

export function touchGameMetadata(db: AppDatabase, code: string): void {
  const now = new Date().toISOString()
  db.insert(gameMetadata)
    .values({ code, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: gameMetadata.code, set: { updatedAt: now } })
    .run()
}

// 크롤링 결과를 저장한다. coverImagePath는 여기서 건드리지 않는다 - Task 3의
// 이미지 캐시 다운로드가 성공한 뒤 별도로 채운다 (크롤링 자체는 성공했지만
// 이미지 다운로드만 실패하는 경우를 구분하기 위함).
export function saveGameMetadata(
  db: AppDatabase,
  code: string,
  data: CrawledGameMetadata
): void {
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
