import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  crawlGameMetadata,
  crawlGameMetadataWithTrace,
  type CrawlGameMetadataDeps,
} from './crawlGameMetadata'
import { MetadataSourceError } from './metadataSourceError'

function createDeps(overrides: Partial<CrawlGameMetadataDeps> = {}): CrawlGameMetadataDeps {
  return {
    crawlDlsiteHtml: async () => null,
    crawlDlsiteJson: async () => null,
    crawlExternal: async () => null,
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('crawlGameMetadata', () => {
  it('tries html then json then enabled external provider for DLsite codes', async () => {
    const calls: string[] = []
    const result = await crawlGameMetadata(
      { type: 'RJ', value: 'RJ01494021' },
      createDeps({
        crawlDlsiteHtml: async () => {
          calls.push('html')
          return null
        },
        crawlDlsiteJson: async () => {
          calls.push('json')
          return null
        },
        crawlExternal: async () => {
          calls.push('external')
          return {
            title: 'External Title',
            circle: '',
            releaseDate: '',
            genres: [],
            coverImageUrl: null,
          }
        },
      })
    )

    expect(calls).toEqual(['html', 'json', 'external'])
    expect(result?.title).toBe('External Title')
  })

  it('stops after the first successful DLsite source', async () => {
    const crawlDlsiteJson = vi.fn(async () => null)
    const crawlExternal = vi.fn(async () => null)

    const result = await crawlGameMetadata(
      { type: 'VJ', value: 'VJ123456' },
      createDeps({
        crawlDlsiteHtml: async () => ({
          title: 'HTML Title',
          circle: '',
          releaseDate: '',
          genres: [],
          coverImageUrl: null,
        }),
        crawlDlsiteJson,
        crawlExternal,
      })
    )

    expect(result?.title).toBe('HTML Title')
    expect(crawlDlsiteJson).not.toHaveBeenCalled()
    expect(crawlExternal).not.toHaveBeenCalled()
  })
})

describe('crawlGameMetadataWithTrace', () => {
  it.each([
    [{ type: 'ST' as const, value: 'ST123' }, 'steam'],
    [{ type: 'VN' as const, value: 'VN17' }, 'vndb'],
    [{ type: 'VR' as const, value: 'VR45775' }, 'vndb'],
    [{ type: 'GC' as const, value: 'GC123' }, 'getchu'],
  ])('traces a network failure from %s without rejecting', async (code, source) => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    await expect(crawlGameMetadataWithTrace(code)).resolves.toEqual({
      metadata: null,
      attemptedSources: [source],
      reason: 'network',
    })
  })

  it('returns exact attempted sources and a blocked reason when all fallbacks return null', async () => {
    await expect(
      crawlGameMetadataWithTrace({ type: 'RJ', value: 'RJ01494021' }, createDeps())
    ).resolves.toEqual({
      metadata: null,
      attemptedSources: ['dlsite-html', 'dlsite-json', 'external'],
      reason: 'blocked',
    })
  })

  it('continues after an HTML network failure and records network when no fallback succeeds', async () => {
    await expect(
      crawlGameMetadataWithTrace(
        { type: 'RJ', value: 'RJ01494021' },
        createDeps({
          crawlDlsiteHtml: async () => {
            throw new TypeError('fetch failed')
          },
        })
      )
    ).resolves.toEqual({
      metadata: null,
      attemptedSources: ['dlsite-html', 'dlsite-json', 'external'],
      reason: 'network',
    })
  })

  it.each([
    ['parse' as const, 'parse'],
    ['blocked' as const, 'blocked'],
  ])('preserves a typed DLsite JSON %s failure in the trace', async (reason, expected) => {
    await expect(
      crawlGameMetadataWithTrace(
        { type: 'RJ', value: 'RJ01494021' },
        createDeps({
          crawlDlsiteJson: async () => {
            throw new MetadataSourceError(reason, 'typed failure')
          },
          shouldCrawlExternal: () => false,
        })
      )
    ).resolves.toEqual({
      metadata: null,
      attemptedSources: ['dlsite-html', 'dlsite-json'],
      reason: expected,
    })
  })

  it('does not record or call an external source when its provider gate is disabled', async () => {
    const crawlExternal = vi.fn(async () => null)

    await expect(
      crawlGameMetadataWithTrace(
        { type: 'RJ', value: 'RJ01494021' },
        createDeps({
          crawlExternal,
          shouldCrawlExternal: () => false,
        })
      )
    ).resolves.toEqual({
      metadata: null,
      attemptedSources: ['dlsite-html', 'dlsite-json'],
      reason: 'blocked',
    })
    expect(crawlExternal).not.toHaveBeenCalled()
  })
})
