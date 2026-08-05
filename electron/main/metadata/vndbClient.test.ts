import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mapVnToMetadata } from './vndbClient'

async function loadFixture(name: string): Promise<unknown> {
  const raw = await readFile(join(__dirname, '__fixtures__', name), 'utf-8')
  return JSON.parse(raw)
}

describe('mapVnToMetadata', () => {
  it('maps a realistic VNDB /vn response record to CrawledGameMetadata, capping genres at the top 10 tags by rating', async () => {
    const vn = await loadFixture('vndb-vn-response.json')
    expect(mapVnToMetadata(vn as Parameters<typeof mapVnToMetadata>[0])).toEqual({
      title: 'Steins;Gate',
      circle: 'Nitroplus',
      releaseDate: '2009-10-15',
      genres: [
        'Time Travel',
        'Mad Scientist',
        'Protagonist',
        'Alternate History',
        'Tsundere',
        'Foreshadowing',
        'Memory Alteration',
        'Amnesia',
        'Female Antagonist',
        'Twins',
      ],
      coverImageUrl: 'https://t.vndb.org/cv/38/86738.jpg',
    })
  })

  it('defaults circle to empty string when no developer is listed', () => {
    expect(
      mapVnToMetadata({ id: 'v1', title: 'Untitled', released: null, image: null, developers: [], tags: [] })
    ).toEqual({
      title: 'Untitled',
      circle: '',
      releaseDate: '',
      genres: [],
      coverImageUrl: null,
    })
  })

  it('defaults releaseDate to empty string for a TBA/unreleased title (VNDB returns null)', () => {
    const result = mapVnToMetadata({
      id: 'v2',
      title: 'Unreleased VN',
      released: null,
      image: null,
      developers: [{ name: 'Some Circle' }],
      tags: [],
    })
    expect(result.releaseDate).toBe('')
  })
})
