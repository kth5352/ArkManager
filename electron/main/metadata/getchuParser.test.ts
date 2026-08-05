import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseGetchuWorkPage } from './getchuParser'

// Fixtures in __fixtures__/ are UTF-8-transcoded from getchu.com's real
// EUC-JP response bytes (matching the arrayBuffer()+TextDecoder('euc-jp')
// decode crawlGetchu performs in crawlGameMetadata.ts) - re-capturing a
// fixture with a plain `curl` (no decode step) will NOT match and should
// not be used to replace these files.
async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, '__fixtures__', name), 'utf-8')
}

describe('parseGetchuWorkPage', () => {
  it('extracts title, circle, release date, genres, and cover image from a real work page', async () => {
    const html = await loadFixture('getchu-work-page.html')
    expect(parseGetchuWorkPage(html)).toEqual({
      title: '小金井荘と金色の揚羽蝶 初回限定特装版',
      circle: 'sprite',
      releaseDate: '2026-11-26',
      genres: ['FILMIC NOVEL', 'アドベンチャー'],
      coverImageUrl: 'https://www.getchu.com/brandnew/1366941/c1366941package.jpg',
    })
  })

  it('returns null for the age-verification/attestation page a mistyped or out-of-range id redirects to', async () => {
    const html = await loadFixture('getchu-not-found-page.html')
    expect(parseGetchuWorkPage(html)).toBeNull()
  })
})
