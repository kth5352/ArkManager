import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createDbClient, type AppDatabase } from '../database/client'
import { getGameMetadata, saveGameMetadata } from '../database/gameMetadataRepository'
import { getMetadataFailure, saveMetadataFailure } from '../database/metadataFailuresRepository'
import { createBulkCrawlQueue } from './bulkCrawlQueue'
import type { GameCode } from '../../../shared/types/scanner'
import type { CrawledGameMetadata, CrawlTraceResult } from './crawlGameMetadata'

const { crawlGameMetadataWithTraceMock } = vi.hoisted(() => ({
  crawlGameMetadataWithTraceMock: vi.fn<(code: GameCode) => Promise<CrawlTraceResult>>(),
}))
vi.mock('./crawlGameMetadata', () => ({
  crawlGameMetadataWithTrace: crawlGameMetadataWithTraceMock,
}))

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
    workType: null,
  }
}

function successTrace(value: string): CrawlTraceResult {
  return { metadata: metadataFor(value), attemptedSources: ['dlsite-html'], reason: null }
}

function failureTrace(
  reason: NonNullable<CrawlTraceResult['reason']> = 'not_found'
): CrawlTraceResult {
  return { metadata: null, attemptedSources: ['dlsite-html', 'dlsite-json'], reason }
}

describe('createBulkCrawlQueue', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
    crawlGameMetadataWithTraceMock.mockReset()
    cacheCoverImageMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('crawls each newly-enqueued code sequentially, one per second', async () => {
    crawlGameMetadataWithTraceMock.mockImplementation(async (c) => successTrace(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')
    const onProgress = vi.fn()

    queue.enqueue([code('RJ01111111'), code('RJ02222222')], onProgress)
    await vi.advanceTimersByTimeAsync(0)

    expect(crawlGameMetadataWithTraceMock).toHaveBeenCalledTimes(1)
    expect(getGameMetadata(db, 'RJ01111111')?.title).toBe('Title RJ01111111')
    expect(getGameMetadata(db, 'RJ02222222')).toBeUndefined()

    await vi.advanceTimersByTimeAsync(1000)

    expect(crawlGameMetadataWithTraceMock).toHaveBeenCalledTimes(2)
    expect(getGameMetadata(db, 'RJ02222222')?.title).toBe('Title RJ02222222')
  })

  it('reports completed/total progress after each code finishes', async () => {
    crawlGameMetadataWithTraceMock.mockImplementation(async (c) => successTrace(c.value))
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
    crawlGameMetadataWithTraceMock.mockImplementation(async (c) => successTrace(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')

    queue.enqueue([code('RJ01111111')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)

    expect(crawlGameMetadataWithTraceMock).not.toHaveBeenCalled()
  })

  it('does not re-enqueue a code already attempted this session, even after enqueue is called again', async () => {
    crawlGameMetadataWithTraceMock.mockResolvedValue(failureTrace('not_found')) // simulates a delisted work - crawl "succeeds" but finds nothing
    const queue = createBulkCrawlQueue(db, '/cache/covers')

    queue.enqueue([code('RJ01111111')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    expect(crawlGameMetadataWithTraceMock).toHaveBeenCalledTimes(1)

    queue.enqueue([code('RJ01111111')], vi.fn())
    await vi.advanceTimersByTimeAsync(1000)
    expect(crawlGameMetadataWithTraceMock).toHaveBeenCalledTimes(1)
  })

  // Regression: a live user found the exact same ~21 codes re-crawling on
  // every single app launch, forever. Root cause - a code that legitimately
  // fails to crawl (delisted, blocked, network/parse error) never got any
  // persisted record of that: no game_metadata row (nothing to save) and no
  // metadata_failures row either (processNext silently dropped it), so
  // enqueue's own "no game_metadata row yet" filter still saw it as
  // never-attempted on the NEXT app launch - a fresh createBulkCrawlQueue
  // call, with `attempted` reset to empty - and queued it right back up.
  it('records a metadata failure on a failed crawl, so a fresh queue instance (simulating a new app launch) skips it', async () => {
    crawlGameMetadataWithTraceMock.mockResolvedValue(failureTrace('blocked'))
    const firstLaunchQueue = createBulkCrawlQueue(db, '/cache/covers')

    firstLaunchQueue.enqueue([code('RJ01111111')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    expect(crawlGameMetadataWithTraceMock).toHaveBeenCalledTimes(1)
    expect(getMetadataFailure(db, 'RJ01111111')).toMatchObject({
      reason: 'blocked',
      attemptedSources: ['dlsite-html', 'dlsite-json'],
    })

    // A brand new queue instance - same as a fresh app process, `attempted`
    // starts empty again - must still skip this code via the persisted
    // metadata_failures row, not just the in-memory Set.
    crawlGameMetadataWithTraceMock.mockClear()
    const secondLaunchQueue = createBulkCrawlQueue(db, '/cache/covers')
    secondLaunchQueue.enqueue([code('RJ01111111')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)

    expect(crawlGameMetadataWithTraceMock).not.toHaveBeenCalled()
  })

  it('enqueue skips a code with an existing metadata failure record even within the same queue instance', async () => {
    saveMetadataFailure(db, 'RJ01111111', ['dlsite-html'], 'network')
    crawlGameMetadataWithTraceMock.mockImplementation(async (c) => successTrace(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')

    queue.enqueue([code('RJ01111111')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)

    expect(crawlGameMetadataWithTraceMock).not.toHaveBeenCalled()
  })

  it('clears a previously-recorded failure once forceEnqueue re-crawls it successfully', async () => {
    saveMetadataFailure(db, 'RJ01111111', ['dlsite-html'], 'network')
    crawlGameMetadataWithTraceMock.mockImplementation(async (c) => successTrace(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')

    queue.forceEnqueue([code('RJ01111111')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)

    expect(getGameMetadata(db, 'RJ01111111')?.title).toBe('Title RJ01111111')
    expect(getMetadataFailure(db, 'RJ01111111')).toBeUndefined()
  })

  it('continues the queue after one code fails to crawl', async () => {
    crawlGameMetadataWithTraceMock
      .mockResolvedValueOnce(failureTrace('parse'))
      .mockImplementationOnce(async (c) => successTrace(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')

    queue.enqueue([code('RJ01111111'), code('RJ02222222')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)

    expect(getGameMetadata(db, 'RJ01111111')).toBeUndefined()
    expect(getMetadataFailure(db, 'RJ01111111')).toMatchObject({ reason: 'parse' })
    expect(getGameMetadata(db, 'RJ02222222')?.title).toBe('Title RJ02222222')
  })

  it('continues the queue if crawlGameMetadataWithTrace itself unexpectedly throws', async () => {
    crawlGameMetadataWithTraceMock
      .mockRejectedValueOnce(new Error('unexpected'))
      .mockImplementationOnce(async (c) => successTrace(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')

    queue.enqueue([code('RJ01111111'), code('RJ02222222')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)

    expect(getGameMetadata(db, 'RJ01111111')).toBeUndefined()
    expect(getGameMetadata(db, 'RJ02222222')?.title).toBe('Title RJ02222222')
  })

  it('continues the queue after onProgress throws (e.g. the window that started it was closed)', async () => {
    crawlGameMetadataWithTraceMock.mockImplementation(async (c) => successTrace(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')
    // Simulates event.sender.send(...) throwing because the calling
    // window's webContents was destroyed mid-crawl.
    const onProgress = vi.fn(() => {
      throw new Error('Object has been destroyed')
    })

    queue.enqueue([code('RJ01111111'), code('RJ02222222')], onProgress)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)

    // Both codes still get crawled and saved despite every progress report
    // throwing - a throw here must not leave the queue permanently stuck.
    expect(crawlGameMetadataWithTraceMock).toHaveBeenCalledTimes(2)
    expect(getGameMetadata(db, 'RJ01111111')?.title).toBe('Title RJ01111111')
    expect(getGameMetadata(db, 'RJ02222222')?.title).toBe('Title RJ02222222')

    // One more tick for the empty-queue branch (which resets `processing`
    // to false) to actually run - it's scheduled a further CRAWL_INTERVAL_MS
    // after the second code finishes, so it lands just past the 1000ms
    // window already advanced above.
    await vi.advanceTimersByTimeAsync(1000)

    // The queue is genuinely idle now (processing reset to false), not just
    // coincidentally caught up - a later enqueue must still actually start
    // a new worker rather than silently no-op forever because `processing`
    // was left stuck true by the earlier throws.
    crawlGameMetadataWithTraceMock.mockClear()
    queue.enqueue([code('RJ03333333')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    expect(crawlGameMetadataWithTraceMock).toHaveBeenCalledTimes(1)
  })

  it('forceEnqueue re-crawls and overwrites a code that already has a game_metadata row', async () => {
    saveGameMetadata(db, 'RJ01111111', {
      title: 'Stale Title',
      circle: 'Stale Circle',
      releaseDate: '2020-01-01',
      genres: ['old'],
      coverImageUrl: null,
      workType: null,
    })
    crawlGameMetadataWithTraceMock.mockImplementation(async (c) => successTrace(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')

    queue.forceEnqueue([code('RJ01111111')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)

    expect(crawlGameMetadataWithTraceMock).toHaveBeenCalledTimes(1)
    expect(getGameMetadata(db, 'RJ01111111')?.title).toBe('Title RJ01111111')
  })

  it('forceEnqueue still marks codes attempted, so a concurrent enqueue does not double-queue them', async () => {
    crawlGameMetadataWithTraceMock.mockImplementation(async (c) => successTrace(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')

    queue.forceEnqueue([code('RJ01111111')], vi.fn())
    queue.enqueue([code('RJ01111111')], vi.fn())
    await vi.advanceTimersByTimeAsync(0)

    expect(crawlGameMetadataWithTraceMock).toHaveBeenCalledTimes(1)
  })

  it('merges a second enqueue call into the already-running queue instead of starting a second worker', async () => {
    crawlGameMetadataWithTraceMock.mockImplementation(async (c) => successTrace(c.value))
    const queue = createBulkCrawlQueue(db, '/cache/covers')
    const onProgress = vi.fn()

    queue.enqueue([code('RJ01111111')], onProgress)
    await vi.advanceTimersByTimeAsync(0)
    queue.enqueue([code('RJ02222222')], onProgress)

    expect(onProgress).toHaveBeenLastCalledWith({ completed: 1, total: 2 })

    await vi.advanceTimersByTimeAsync(1000)
    expect(crawlGameMetadataWithTraceMock).toHaveBeenCalledTimes(2)
  })
})
