import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mapItemToSearchResult } from './steamSearchClient'

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
    expect(mapItemToSearchResult({ id: 12345, name: 'Untitled' })).toEqual({
      code: { type: 'ST', value: 'ST12345' },
      title: 'Untitled',
      thumbnailUrl: null,
    })
  })
})
