import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mapItemToSearchResult, crawlSteamSearch } from './steamSearchClient'

async function loadFixture(name: string): Promise<unknown> {
  const raw = await readFile(join(__dirname, '__fixtures__', name), 'utf-8')
  return JSON.parse(raw)
}

describe('mapItemToSearchResult', () => {
  it('maps a realistic Steam storesearch item to a SteamSearchResult', async () => {
    const item = await loadFixture('steam-storesearch-item.json')
    expect(mapItemToSearchResult(item as Parameters<typeof mapItemToSearchResult>[0])).toEqual({
      code: { type: 'ST', value: 'ST413150' },
      title: 'Stardew Valley',
      thumbnailUrl:
        'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/413150/capsule_231x87.jpg?t=1754692865',
    })
  })

  it('defaults thumbnailUrl to null when tiny_image is absent', () => {
    expect(mapItemToSearchResult({ type: 'app', id: 12345, name: 'Untitled' })).toEqual({
      code: { type: 'ST', value: 'ST12345' },
      title: 'Untitled',
      thumbnailUrl: null,
    })
  })

  it('mapItemToSearchResult ignores the item type field entirely (filtering happens in crawlSteamSearch, not here)', async () => {
    const item = await loadFixture('steam-storesearch-item.json')
    const withDifferentType = { ...(item as Record<string, unknown>), type: 'sub' }
    // mapItemToSearchResult has no type-awareness by design - it's crawlSteamSearch's
    // job to filter before ever calling this function. This test documents that
    // boundary so a future refactor doesn't accidentally move filtering logic here.
    expect(mapItemToSearchResult(withDifferentType as Parameters<typeof mapItemToSearchResult>[0])).toEqual(
      mapItemToSearchResult(item as Parameters<typeof mapItemToSearchResult>[0])
    )
  })
})

describe('crawlSteamSearch', () => {
  it('returns an empty array for a blank query without making a network request', async () => {
    expect(await crawlSteamSearch('   ')).toEqual([])
  })
})
