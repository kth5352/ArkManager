import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { crawlSteamStoreApi, createSteamTagNameCache } from './steamStoreApi'

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, '__fixtures__', name), 'utf-8')
}

function jsonResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
}

async function fixtureFetch(itemsFixture: string) {
  const items = await loadFixture(itemsFixture)
  const tags = await loadFixture('steam-taglist-response.json')
  return vi.fn(async (url: string) => {
    if (url.includes('/IStoreBrowseService/GetItems/')) return jsonResponse(items)
    if (url.includes('/IStoreService/GetTagList/')) return jsonResponse(tags)
    return new Response(null, { status: 404 })
  })
}

describe('crawlSteamStoreApi', () => {
  // The store HTML page cannot be read anonymously for "adult only" titles
  // (302 to /agecheck -> Steam login) nor for titles region-locked in the
  // user's country ("Site Error: unavailable in your region"). The public
  // store API with country_code US returns them without login or cookies.
  it('maps an adult-only / region-locked app from the store API', async () => {
    const fetchImpl = await fixtureFetch('steam-getitems-response.json')

    const result = await crawlSteamStoreApi('1754870', {
      fetchImpl,
      tagNames: createSteamTagNameCache(),
    })

    expect(result).toEqual({
      title: 'Lust Theory Season 2',
      circle: 'Inceton Games',
      releaseDate: '2023-01-28',
      genres: [
        'Sexual Content',
        'Nudity',
        'Dating Sim',
        'Choices Matter',
        'Hentai',
        'Realistic',
        'Dark Humor',
        'Interactive Fiction',
        'Immersive Sim',
        'Colorful',
      ],
      coverImageUrl:
        'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1754870/header.jpg?t=1792157155',
      workType: null,
    })
    const itemsUrl = String(fetchImpl.mock.calls[0][0])
    expect(decodeURIComponent(itemsUrl)).toContain('"country_code":"US"')
  })

  it('returns null for an app id Steam does not know', async () => {
    const fetchImpl = await fixtureFetch('steam-getitems-not-found.json')
    await expect(
      crawlSteamStoreApi('99999999', { fetchImpl, tagNames: createSteamTagNameCache() })
    ).resolves.toBeNull()
  })

  it('still returns the record without genres when the tag list is unavailable', async () => {
    const items = await loadFixture('steam-getitems-response.json')
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('/GetItems/') ? jsonResponse(items) : new Response(null, { status: 500 })
    )
    const result = await crawlSteamStoreApi('1754870', {
      fetchImpl,
      tagNames: createSteamTagNameCache(),
    })
    expect(result?.title).toBe('Lust Theory Season 2')
    expect(result?.genres).toEqual([])
  })

  it('fetches the tag list once and reuses it', async () => {
    const fetchImpl = await fixtureFetch('steam-getitems-response.json')
    const tagNames = createSteamTagNameCache()
    await crawlSteamStoreApi('1754870', { fetchImpl, tagNames })
    await crawlSteamStoreApi('1754870', { fetchImpl, tagNames })
    const tagListCalls = fetchImpl.mock.calls.filter(([url]) => String(url).includes('GetTagList'))
    expect(tagListCalls).toHaveLength(1)
  })

  it('throws (so the caller can fall back) when the store API itself fails', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }))
    await expect(
      crawlSteamStoreApi('1754870', { fetchImpl, tagNames: createSteamTagNameCache() })
    ).rejects.toMatchObject({ name: 'MetadataSourceError' })
  })
})
