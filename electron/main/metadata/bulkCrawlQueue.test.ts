import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createDbClient, type AppDatabase } from '../database/client'
import { getGameMetadata, saveGameMetadata } from '../database/gameMetadataRepository'
import { createBulkCrawlQueue } from './bulkCrawlQueue'
import type { GameCode } from '../../../shared/types/scanner'
import type { CrawledGameMetadata } from './crawlGameMetadata'

const { crawlGameMetadataMock } = vi.hoisted(() => ({
  crawlGameMetadataMock: vi.fn<(code: GameCode) => Promise<CrawledGameMetadata | null>>(),
}))
vi.mock('./crawlGameMetadata', () => ({ crawlGameMetadata: crawlGameMetadataMock }))

const { cacheCoverImageMock } = vi.hoisted(() => ({
  cacheCoverImageMock: vi.fn<() => Promise<string | null>>(),
}))
vi.mock('./cacheCoverImage', () => ({ cacheCoverImage: cacheCoverImageMock }))

function code(value: string): GameCode {
  return { type: 'RJ', value }
}

function metadataFor(value: string): CrawledGameMetadata {
  return {
    title: `Title ${value}`,
    circle: 'Circle',
    releaseDate: '2025-01-01',
    genres: [],
    coverImageUrl: null,
  }
}

describe('createBulkCrawlQueue', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
    crawlGameMetadataMock.mockReset()
    cacheCoverImageMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('crawls each newly-enqueued code sequentially, one per second', async () => {
    crawlGameMetadataMock.mockImplementation(async (c) => metadataFor(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')
    const onProgress = vi.fn()

    queue.enqueue([code('RJ01111111'), code('RJ02222222')], onProgress)
    await vi.advanceTimersByTimeAsync(0)

    expect(crawlGameMetadataMock).toHaveBeenCalledTimes(1)
    expect(getGameMetadata(db, 'RJ01111111')?.title).toBe('Title RJ01111111')
    expect(getGameMetadata(db, 'RJ02222222')).toBeUndefined()

    await vi.advanceTimersByTimeAsync(1000)

    expect(crawlGameMetadataMock).toHaveBeenCalledTimes(2)
    expect(getGameMetadata(db, 'RJ02222222')?.title).toBe('Title RJ02222222')
  })

  it('reports completed/total progress after each code finishes', async () => {
    crawlGameMetadataMock.mockImplementation(async (c) => metadataFor(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')
    const onProgress = vi.fn()

    queue.enqueue([code('RJ01111111'), code('RJ02222222')], onProgress)
    await vi.advanceTimersByTimeAsync(0)
    expect(onProgress).toHaveBeenLastCalledWith({ completed: 1, total: 2 })

    await vi.advanceTimersByTimeAsync(1000)
    expect(onProgress).toHaveBeenLastCalledWith({ completed: 2, total: 2 })
  })

  it('skips a code that already has a game_metadata row', async () => {
    saveGameMetadata(db, 'RJ01111111', metadataFor('RJ01111111'))
    crawlGameMetadataMock.mockImplementation(async (c) => metadataFor(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')

    queue.enqueue([code('RJ01111111')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)

    expect(crawlGameMetadataMock).not.toHaveBeenCalled()
  })

  it('does not re-enqueue a code already attempted this session, even after enqueue is called again', async () => {
    crawlGameMetadataMock.mockResolvedValue(null) // simulates a delisted work - crawl "succeeds" but finds nothing
    const queue = createBulkCrawlQueue(db, '/cache/covers')

    queue.enqueue([code('RJ01111111')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    expect(crawlGameMetadataMock).toHaveBeenCalledTimes(1)

    queue.enqueue([code('RJ01111111')], vi.fn())
    await vi.advanceTimersByTimeAsync(1000)
    expect(crawlGameMetadataMock).toHaveBeenCalledTimes(1)
  })

  it('continues the queue after one code fails to crawl', async () => {
    crawlGameMetadataMock
      .mockRejectedValueOnce(new Error('network error'))
      .mockImplementationOnce(async (c) => metadataFor(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')

    queue.enqueue([code('RJ01111111'), code('RJ02222222')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)

    expect(getGameMetadata(db, 'RJ01111111')).toBeUndefined()
    expect(getGameMetadata(db, 'RJ02222222')?.title).toBe('Title RJ02222222')
  })

  it('merges a second enqueue call into the already-running queue instead of starting a second worker', async () => {
    crawlGameMetadataMock.mockImplementation(async (c) => metadataFor(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')
    const onProgress = vi.fn()

    queue.enqueue([code('RJ01111111')], onProgress)
    await vi.advanceTimersByTimeAsync(0)
    queue.enqueue([code('RJ02222222')], onProgress)

    expect(onProgress).toHaveBeenLastCalledWith({ completed: 1, total: 2 })

    await vi.advanceTimersByTimeAsync(1000)
    expect(crawlGameMetadataMock).toHaveBeenCalledTimes(2)
  })
})
