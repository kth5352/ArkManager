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

  // This fixture was captured from id=1366999 BEFORE the ?gc=gc age-gate
  // bypass was discovered (see crawlGameMetadata.ts's crawlGetchu comment) -
  // that id turned out to be a real, valid title, just an age-gated one, and
  // now resolves normally in production since every request carries the
  // bypass. This test is purely defensive: if getchu's age-gate mechanism
  // ever changes and the bypass stops working, this confirms the parser
  // still fails safely (null, not a throw) rather than validating a
  // "not found" case that can actually happen today.
  it('returns null for the age-verification/attestation interstitial (defensive - unreachable in production while the ?gc=gc bypass works)', async () => {
    const html = await loadFixture('getchu-not-found-page.html')
    expect(parseGetchuWorkPage(html)).toBeNull()
  })
})
