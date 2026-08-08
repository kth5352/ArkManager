import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  mapReleaseToMetadata,
  mapVnToMetadata,
  mapVnToSearchResult,
  toVndbId,
} from './vndbClient'

async function loadFixture(name: string): Promise<unknown> {
  const raw = await readFile(join(__dirname, '__fixtures__', name), 'utf-8')
  return JSON.parse(raw)
}

it('maps app VNV and VNR codes to VNDB ids', () => {
  expect(toVndbId({ type: 'VNV', value: 'VNV17' })).toBe('v17')
  expect(toVndbId({ type: 'VNR', value: 'VNR45775' })).toBe('r45775')
})

it('maps a VNDB release response to metadata without changing identity', () => {
  expect(
    mapReleaseToMetadata({
      id: 'r45775',
      title: 'Release Title',
      released: '2024-01-02',
      producers: [{ developer: true, name: 'Release Developer' }],
      vns: [{ title: 'Fallback VN Title', image: { url: 'https://t.vndb.org/cv/1.jpg' } }],
    })
  ).toEqual({
    title: 'Release Title',
    circle: 'Release Developer',
    releaseDate: '2024-01-02',
    genres: [],
    coverImageUrl: 'https://t.vndb.org/cv/1.jpg',
  })
})

describe('mapVnToMetadata', () => {
  it('maps a realistic VNDB /vn response record to CrawledGameMetadata, capping genres at the top 10 tags by rating, excluding spoiler tags', async () => {
    // Fixture has 12 tags; 3 are spoiler-tagged (Time Travel: 2, Memory
    // Alteration: 1, Amnesia: 1) and are excluded entirely, leaving 9
    // eligible (spoiler === 0) tags - fewer than MAX_GENRES, so all 9 make
    // it into the output, sorted by rating descending:
    //   Mad Scientist 2.9, Protagonist 2.8, Alternate History 2.5,
    //   Tsundere 2.0, Foreshadowing 1.8, Female Antagonist 1.0, Twins 0.9,
    //   Nosebleed 0.7, Loli 0.5
    const vn = await loadFixture('vndb-vn-response.json')
    expect(mapVnToMetadata(vn as Parameters<typeof mapVnToMetadata>[0])).toEqual({
      title: 'Steins;Gate',
      circle: 'Nitroplus',
      releaseDate: '2009-10-15',
      genres: [
        'Mad Scientist',
        'Protagonist',
        'Alternate History',
        'Tsundere',
        'Foreshadowing',
        'Female Antagonist',
        'Twins',
        'Nosebleed',
        'Loli',
      ],
      coverImageUrl: 'https://t.vndb.org/cv/38/86738.jpg',
    })
  })

  it('defaults circle to empty string when no developer is listed', () => {
    expect(
      mapVnToMetadata({
        id: 'v1',
        title: 'Untitled',
        released: null,
        image: null,
        developers: [],
        tags: [],
      })
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

describe('mapVnToSearchResult', () => {
  it('reattaches the VNV prefix so the code round-trips like a filename-recognized code', () => {
    expect(
      mapVnToSearchResult({
        id: 'v17',
        title: 'Steins;Gate',
        image: { url: 'https://t.vndb.org/cv/38/86738.jpg' },
      })
    ).toEqual({
      code: { type: 'VNV', value: 'VNV17' },
      title: 'Steins;Gate',
      thumbnailUrl: 'https://t.vndb.org/cv/38/86738.jpg',
    })
  })

  it('defaults thumbnailUrl to null when image is absent', () => {
    expect(mapVnToSearchResult({ id: 'v2', title: 'Untitled', image: null })).toEqual({
      code: { type: 'VNV', value: 'VNV2' },
      title: 'Untitled',
      thumbnailUrl: null,
    })
  })
})
