import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { getGameMetadata, saveGameMetadata } from '../database/gameMetadataRepository'
import { getMetadataFailure, saveMetadataFailure } from '../database/metadataFailuresRepository'
import { registerMetadataHandlers } from './metadataHandlers'

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(() => 'C:\\ArkManagerTest'),
  handle: vi.fn(),
}))

const crawlMocks = vi.hoisted(() => ({
  crawlGameMetadataWithTrace: vi.fn(),
  createCrawlGameMetadataDeps: vi.fn((config: { enabled: boolean; endpointUrl: string }) => ({
    crawlDlsiteHtml: vi.fn(),
    crawlDlsiteJson: vi.fn(),
    crawlExternal: vi.fn(),
    shouldCrawlExternal: () => config.enabled && config.endpointUrl.trim() !== '',
  })),
}))

vi.mock('electron', () => ({
  app: { getPath: electronMocks.getPath },
  ipcMain: { handle: electronMocks.handle },
}))

vi.mock('../metadata/crawlGameMetadata', () => crawlMocks)

type RegisteredHandler = (_event: unknown, payload: unknown) => unknown

function crawlAndSaveHandler(): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([channel]) => channel === IPC_CHANNELS.METADATA_CRAWL_AND_SAVE
  )
  if (!registration) throw new Error('metadata crawl handler was not registered')
  return registration[1] as RegisteredHandler
}

function getFailureHandler(): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([channel]) => channel === IPC_CHANNELS.METADATA_GET_FAILURE
  )
  if (!registration) throw new Error('metadata failure handler was not registered')
  return registration[1] as RegisteredHandler
}

describe('METADATA_CRAWL_AND_SAVE', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    crawlMocks.crawlGameMetadataWithTrace.mockReset()
    crawlMocks.createCrawlGameMetadataDeps.mockClear()
    db = createDbClient(':memory:')
    registerMetadataHandlers(db)
  })

  afterEach(() => {
    db.$client.close()
  })

  it('clears stale state before crawling and persists the exact replacement trace', async () => {
    saveMetadataFailure(db, 'RJ01494021', ['old-source'], 'parse')
    crawlMocks.crawlGameMetadataWithTrace.mockImplementation(async () => {
      expect(getMetadataFailure(db, 'RJ01494021')).toBeUndefined()
      return {
        metadata: null,
        attemptedSources: ['dlsite-html', 'dlsite-json'],
        reason: 'network',
      }
    })

    await expect(
      crawlAndSaveHandler()({}, { code: { type: 'RJ', value: 'RJ01494021' } })
    ).resolves.toBeNull()
    expect(getMetadataFailure(db, 'RJ01494021')).toMatchObject({
      attemptedSources: ['dlsite-html', 'dlsite-json'],
      reason: 'network',
    })
  })

  it('saves successful metadata and clears a previous failure', async () => {
    saveMetadataFailure(db, 'RJ01494021', ['dlsite-html'], 'blocked')
    crawlMocks.crawlGameMetadataWithTrace.mockResolvedValue({
      metadata: {
        title: 'Recovered Title',
        circle: '',
        releaseDate: '',
        genres: [],
        coverImageUrl: null,
      },
      attemptedSources: ['dlsite-html'],
      reason: null,
    })

    await expect(
      crawlAndSaveHandler()({}, { code: { type: 'RJ', value: 'RJ01494021' } })
    ).resolves.toMatchObject({ title: 'Recovered Title' })
    expect(getGameMetadata(db, 'RJ01494021')?.title).toBe('Recovered Title')
    expect(getMetadataFailure(db, 'RJ01494021')).toBeUndefined()
  })

  it('passes disabled provider settings when no provider is configured', async () => {
    crawlMocks.crawlGameMetadataWithTrace.mockResolvedValue({
      metadata: null,
      attemptedSources: ['dlsite-html', 'dlsite-json'],
      reason: 'not_found',
    })

    await crawlAndSaveHandler()({}, { code: { type: 'RJ', value: 'RJ01494021' } })

    expect(crawlMocks.createCrawlGameMetadataDeps).toHaveBeenCalledWith({
      enabled: false,
      endpointUrl: '',
      apiKey: undefined,
    })
    const crawlDeps = crawlMocks.crawlGameMetadataWithTrace.mock.calls[0][1]
    expect(crawlDeps.shouldCrawlExternal()).toBe(false)
  })

  it('stores a replacement failure when the traced crawler unexpectedly rejects', async () => {
    saveMetadataFailure(db, 'ST123', ['old-source'], 'blocked')
    crawlMocks.crawlGameMetadataWithTrace.mockRejectedValue(new TypeError('fetch failed'))

    await expect(
      crawlAndSaveHandler()({}, { code: { type: 'ST', value: 'ST123' } })
    ).resolves.toBeNull()
    expect(getMetadataFailure(db, 'ST123')).toMatchObject({
      attemptedSources: ['steam'],
      reason: 'network',
    })
  })

  it('returns the stored metadata failure for a code', () => {
    saveMetadataFailure(db, 'RJ01494021', ['dlsite-html', 'dlsite-json'], 'blocked')

    expect(getFailureHandler()({}, { code: { type: 'RJ', value: 'RJ01494021' } })).toMatchObject({
      code: 'RJ01494021',
      attemptedSources: ['dlsite-html', 'dlsite-json'],
      reason: 'blocked',
    })
  })
})

// The File menu's "전체 메타데이터 새로고침"/"Refresh All Metadata" item
// (electron/main/index.ts) calls this returned API function directly - it
// isn't reached through ipcMain at all, unlike every handler above.
describe('refreshAllMetadata', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    crawlMocks.crawlGameMetadataWithTrace.mockReset()
    db = createDbClient(':memory:')
    vi.useFakeTimers()
  })

  afterEach(() => {
    db.$client.close()
    vi.useRealTimers()
  })

  it('force re-crawls every code that already has a game_metadata row, overwriting it', async () => {
    saveGameMetadata(db, 'RJ01111111', {
      title: 'Stale',
      circle: 'Stale Circle',
      releaseDate: '2020-01-01',
      genres: [],
      coverImageUrl: null,
      workType: null,
    })
    saveGameMetadata(db, 'VJ02222222', {
      title: 'Also Stale',
      circle: 'Also Stale Circle',
      releaseDate: '2020-02-02',
      genres: [],
      coverImageUrl: null,
      workType: null,
    })
    crawlMocks.crawlGameMetadataWithTrace.mockImplementation(async (c: { value: string }) => ({
      metadata: {
        title: `Fresh ${c.value}`,
        circle: 'Fresh Circle',
        releaseDate: '2026-01-01',
        genres: [],
        coverImageUrl: null,
        workType: null,
      },
      attemptedSources: ['dlsite-html'],
      reason: null,
    }))
    const api = registerMetadataHandlers(db)
    const onProgress = vi.fn()

    api.refreshAllMetadata(onProgress)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)

    expect(crawlMocks.crawlGameMetadataWithTrace).toHaveBeenCalledTimes(2)
    expect(getGameMetadata(db, 'RJ01111111')?.title).toBe('Fresh RJ01111111')
    expect(getGameMetadata(db, 'VJ02222222')?.title).toBe('Fresh VJ02222222')
    expect(onProgress).toHaveBeenLastCalledWith({ completed: 2, total: 2 })
  })

  it('does nothing when nothing has been crawled yet', async () => {
    const api = registerMetadataHandlers(db)
    const onProgress = vi.fn()

    api.refreshAllMetadata(onProgress)
    await vi.advanceTimersByTimeAsync(0)

    expect(crawlMocks.crawlGameMetadataWithTrace).not.toHaveBeenCalled()
    expect(onProgress).not.toHaveBeenCalled()
  })
})
