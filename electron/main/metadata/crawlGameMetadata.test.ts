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
            workType: null,
          }
        },
      })
    )

    expect(calls).toEqual(['html', 'json', 'external'])
    expect(result?.title).toBe('External Title')
  })

  it('stops after the first complete DLsite source', async () => {
    const crawlDlsiteJson = vi.fn(async () => null)
    const crawlExternal = vi.fn(async () => null)

    const result = await crawlGameMetadata(
      { type: 'VJ', value: 'VJ123456' },
      createDeps({
        crawlDlsiteHtml: async () => ({
          title: 'HTML Title',
          circle: 'Brand',
          releaseDate: '2024-01-02',
          genres: ['ADV'],
          coverImageUrl: null,
          workType: 'ADV',
        }),
        crawlDlsiteJson,
        crawlExternal,
      })
    )

    expect(result?.title).toBe('HTML Title')
    expect(crawlDlsiteJson).not.toHaveBeenCalled()
    expect(crawlExternal).not.toHaveBeenCalled()
  })

  // A DLsite markup change (2026-11) left the HTML parser returning a title
  // and cover but no genres/circle/date/workType - and because a title alone
  // counted as success, the JSON source that still had them was never asked.
  it('fills fields the HTML page is missing from the DLsite JSON source', async () => {
    const result = await crawlGameMetadata(
      { type: 'RJ', value: 'RJ299717' },
      createDeps({
        crawlDlsiteHtml: async () => ({
          title: 'HTML Title',
          circle: '',
          releaseDate: '',
          genres: [],
          coverImageUrl: 'https://img.dlsite.jp/html.jpg',
          workType: null,
        }),
        crawlDlsiteJson: async () => ({
          title: 'JSON Title',
          circle: 'Circle',
          releaseDate: '2020-10-05',
          genres: ['ASMR'],
          coverImageUrl: 'https://img.dlsite.jp/json.jpg',
          workType: 'SOU',
        }),
      })
    )

    expect(result).toEqual({
      title: 'HTML Title',
      circle: 'Circle',
      releaseDate: '2020-10-05',
      genres: ['ASMR'],
      coverImageUrl: 'https://img.dlsite.jp/html.jpg',
      workType: 'SOU',
    })
  })

  it('keeps the HTML result when the JSON enrichment fails', async () => {
    const html = {
      title: 'HTML Title',
      circle: '',
      releaseDate: '',
      genres: [],
      coverImageUrl: null,
      workType: null,
    }
    const result = await crawlGameMetadata(
      { type: 'RJ', value: 'RJ299717' },
      createDeps({
        crawlDlsiteHtml: async () => html,
        crawlDlsiteJson: async () => {
          throw new MetadataSourceError('network', 'down')
        },
      })
    )
    expect(result).toEqual(html)
  })
})

describe('crawlGameMetadataWithTrace', () => {
  it.each([
    [{ type: 'ST' as const, value: 'ST123' }, 'steam'],
    [{ type: 'VNV' as const, value: 'VNV17' }, 'vndb'],
    [{ type: 'VNR' as const, value: 'VNR45775' }, 'vndb'],
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
