import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import {
  CrawlAndSaveMetadataRequestSchema,
  GetMetadataRequestSchema,
  GetManyMetadataRequestSchema,
  IPC_CHANNELS,
  type GameMetadataDto,
} from '../../../shared/types/ipc'
import { crawlGameMetadata } from '../metadata/crawlGameMetadata'
import { cacheCoverImage } from '../metadata/cacheCoverImage'
import {
  getGameMetadata,
  saveGameMetadata,
  setGameMetadataCoverPath,
  getManyGameMetadata,
} from '../database/gameMetadataRepository'
import type { AppDatabase } from '../database/client'

function toDto(row: ReturnType<typeof getGameMetadata>): GameMetadataDto | null {
  if (!row) return null
  return {
    code: row.code,
    title: row.title,
    circle: row.circle,
    releaseDate: row.releaseDate,
    genres: row.genres,
    coverImagePath: row.coverImagePath,
  }
}

export function registerMetadataHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.METADATA_GET, (_event, payload: unknown) => {
    const { code } = GetMetadataRequestSchema.parse(payload)
    return toDto(getGameMetadata(db, code.value))
  })

  ipcMain.handle(IPC_CHANNELS.METADATA_GET_MANY, (_event, payload: unknown) => {
    const { codes } = GetManyMetadataRequestSchema.parse(payload)
    const rows = getManyGameMetadata(db, codes)
    const result: Record<string, GameMetadataDto> = {}
    for (const [code, row] of rows) {
      result[code] = {
        code: row.code,
        title: row.title,
        circle: row.circle,
        releaseDate: row.releaseDate,
        genres: row.genres,
        coverImagePath: row.coverImagePath,
      }
    }
    return result
  })

  ipcMain.handle(IPC_CHANNELS.METADATA_CRAWL_AND_SAVE, async (_event, payload: unknown) => {
    const { code } = CrawlAndSaveMetadataRequestSchema.parse(payload)

    const crawled = await crawlGameMetadata(code)
    if (!crawled) return null

    saveGameMetadata(db, code.value, crawled)

    if (crawled.coverImageUrl) {
      const cacheDir = join(app.getPath('userData'), 'cache', 'covers')
      const coverPath = await cacheCoverImage(cacheDir, code.value, crawled.coverImageUrl)
      if (coverPath) setGameMetadataCoverPath(db, code.value, coverPath)
    }

    return toDto(getGameMetadata(db, code.value))
  })
}
