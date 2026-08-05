import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import {
  CrawlAndSaveMetadataRequestSchema,
  GetMetadataRequestSchema,
  GetManyMetadataRequestSchema,
  GetCoverImageRequestSchema,
  SearchDlsiteRequestSchema,
  SearchVndbRequestSchema,
  SearchSteamRequestSchema,
  CrawlMissingMetadataRequestSchema,
  IPC_CHANNELS,
  type GameMetadataDto,
} from '../../../shared/types/ipc'
import { crawlGameMetadata } from '../metadata/crawlGameMetadata'
import { crawlDlsiteSearch } from '../metadata/crawlDlsiteSearch'
import { searchVndb } from '../metadata/vndbClient'
import { crawlSteamSearch } from '../metadata/steamSearchClient'
import { cacheCoverImage } from '../metadata/cacheCoverImage'
import { createBulkCrawlQueue } from '../metadata/bulkCrawlQueue'
import {
  getGameMetadata,
  saveGameMetadata,
  setGameMetadataCoverPath,
  getManyGameMetadata,
} from '../database/gameMetadataRepository'
import type { AppDatabase } from '../database/client'
import { encodeThumbnail } from './scannerHandlers'

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
  const bulkCrawlQueue = createBulkCrawlQueue(db, join(app.getPath('userData'), 'cache', 'covers'))

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

  ipcMain.handle(IPC_CHANNELS.METADATA_GET_COVER_IMAGE, async (_event, payload: unknown) => {
    const { code } = GetCoverImageRequestSchema.parse(payload)

    const row = getGameMetadata(db, code.value)
    if (!row?.coverImagePath) return null

    return encodeThumbnail(row.coverImagePath).catch(() => null)
  })

  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH_DLSITE, async (_event, payload: unknown) => {
    const { query } = SearchDlsiteRequestSchema.parse(payload)
    return crawlDlsiteSearch(query)
  })

  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH_VNDB, async (_event, payload: unknown) => {
    const { query } = SearchVndbRequestSchema.parse(payload)
    return searchVndb(query)
  })

  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH_STEAM, async (_event, payload: unknown) => {
    const { query } = SearchSteamRequestSchema.parse(payload)
    return crawlSteamSearch(query)
  })

  ipcMain.handle(IPC_CHANNELS.METADATA_CRAWL_MISSING, (event, payload: unknown) => {
    const { codes } = CrawlMissingMetadataRequestSchema.parse(payload)
    bulkCrawlQueue.enqueue(codes, (progress) => {
      event.sender.send(IPC_CHANNELS.METADATA_BULK_CRAWL_PROGRESS, progress)
    })
  })
}
