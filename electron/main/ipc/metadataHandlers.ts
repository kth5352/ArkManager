import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import {
  CrawlAndSaveMetadataRequestSchema,
  GetMetadataRequestSchema,
  GetManyMetadataRequestSchema,
  GetCoverImageRequestSchema,
  MetadataSearchRequestSchema,
  CrawlMissingMetadataRequestSchema,
  IPC_CHANNELS,
  type GameMetadataDto,
  type MetadataSearchSource,
  type MetadataSearchResultDto,
} from '../../../shared/types/ipc'
import {
  crawlGameMetadataWithTrace,
  createCrawlGameMetadataDeps,
} from '../metadata/crawlGameMetadata'
import { crawlDlsiteSearch } from '../metadata/crawlDlsiteSearch'
import { searchVndb } from '../metadata/vndbClient'
import { crawlSteamSearch } from '../metadata/steamSearchClient'
import { crawlGetchuSearch } from '../metadata/crawlGetchuSearch'
import { cacheCoverImage } from '../metadata/cacheCoverImage'
import { createBulkCrawlQueue } from '../metadata/bulkCrawlQueue'
import {
  getGameMetadata,
  saveGameMetadata,
  setGameMetadataCoverPath,
  getManyGameMetadata,
} from '../database/gameMetadataRepository'
import type { AppDatabase } from '../database/client'
import { clearMetadataFailure, saveMetadataFailure } from '../database/metadataFailuresRepository'
import { getSetting } from '../database/settingsRepository'
import { encodeThumbnail } from './scannerHandlers'
import type { GameCode } from '../../../shared/types/scanner'
import { metadataFailureReasonFromError } from '../metadata/metadataSourceError'

const metadataSearchFns: Record<
  MetadataSearchSource,
  (query: string) => Promise<MetadataSearchResultDto[]>
> = {
  dlsite: crawlDlsiteSearch,
  steam: crawlSteamSearch,
  vndb: searchVndb,
  getchu: crawlGetchuSearch,
}

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

function initialMetadataSource(code: GameCode): string {
  if (code.type === 'ST') return 'steam'
  if (code.type === 'VN' || code.type === 'VR') return 'vndb'
  if (code.type === 'GC') return 'getchu'
  return 'dlsite-html'
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

    clearMetadataFailure(db, code.value)
    let result
    try {
      const externalConfig = {
        enabled: getSetting(db, 'external-metadata-provider-enabled') === 'true',
        endpointUrl: getSetting(db, 'external-metadata-provider-url') ?? '',
        apiKey: getSetting(db, 'external-metadata-provider-api-key'),
      }
      result = await crawlGameMetadataWithTrace(code, createCrawlGameMetadataDeps(externalConfig))
    } catch (error) {
      saveMetadataFailure(
        db,
        code.value,
        [initialMetadataSource(code)],
        metadataFailureReasonFromError(error, 'network')
      )
      return null
    }
    const crawled = result.metadata
    if (!crawled) {
      saveMetadataFailure(db, code.value, result.attemptedSources, result.reason ?? 'blocked')
      return null
    }

    saveGameMetadata(db, code.value, crawled)
    clearMetadataFailure(db, code.value)

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

  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH, async (_event, payload: unknown) => {
    const { source, query } = MetadataSearchRequestSchema.parse(payload)
    return metadataSearchFns[source](query)
  })

  ipcMain.handle(IPC_CHANNELS.METADATA_CRAWL_MISSING, (event, payload: unknown) => {
    const { codes } = CrawlMissingMetadataRequestSchema.parse(payload)
    bulkCrawlQueue.enqueue(codes, (progress) => {
      event.sender.send(IPC_CHANNELS.METADATA_BULK_CRAWL_PROGRESS, progress)
    })
  })
}
