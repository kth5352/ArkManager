import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { getGameMetadata } from '../database/gameMetadataRepository'
import { getMetadataFailure, saveMetadataFailure } from '../database/metadataFailuresRepository'
import { registerMetadataHandlers } from './metadataHandlers'

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(() => 'C:\\ArkManagerTest'),
  handle: vi.fn(),
}))

const crawlMocks = vi.hoisted(() => ({
  crawlGameMetadata: vi.fn(),
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
})
