import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseSteamStorePage } from './steamParser'

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, '__fixtures__', name), 'utf-8')
}

describe('parseSteamStorePage', () => {
  it('extracts title, developer, release date, popular tags, and cover image from a real store page', async () => {
    const html = await loadFixture('steam-store-page.html')
    expect(parseSteamStorePage(html)).toEqual({
      title: 'Cyberpunk 2077',
      circle: 'CD PROJEKT RED',
      releaseDate: '2020-12-09',
      genres: ['Cyberpunk', 'Open World', 'RPG'],
      coverImageUrl:
        'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1091500/capsule_616x353.jpg',
    })
  })

  it('returns null for an age-verification interstitial page', async () => {
    const html = await loadFixture('steam-agecheck-page.html')
    expect(parseSteamStorePage(html)).toBeNull()
  })
})
