import { describe, expect, it, vi } from 'vitest'
import {
  crawlGameMetadata,
  crawlGameMetadataWithTrace,
  type CrawlGameMetadataDeps,
} from './crawlGameMetadata'

function createDeps(overrides: Partial<CrawlGameMetadataDeps> = {}): CrawlGameMetadataDeps {
  return {
    crawlDlsiteHtml: async () => null,
    crawlDlsiteJson: async () => null,
    crawlExternal: async () => null,
    ...overrides,
  }
}

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
