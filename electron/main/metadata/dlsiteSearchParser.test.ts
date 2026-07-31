import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseDlsiteSearchResults } from './dlsiteSearchParser'

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, '__fixtures__', name), 'utf-8')
}

describe('parseDlsiteSearchResults', () => {
  it('extracts code, title, and thumbnail for each result, across categories', async () => {
    const html = await loadFixture('dlsite-search-results-page.html')
    expect(parseDlsiteSearchResults(html)).toEqual([
      {
        code: { type: 'RJ', value: 'RJ01169914' },
        title: 'シニシスタ2 SiNiSistar2',
        thumbnailUrl:
          'https://img.dlsite.jp/resize/images2/work/doujin/RJ01170000/RJ01169914_img_main_240x240.webp',
      },
      {
        code: { type: 'VJ', value: 'VJ01004728' },
        title: 'サンプル作品2',
        thumbnailUrl:
          'https://img.dlsite.jp/resize/images2/work/professional/VJ01005000/VJ01004728_img_main_240x240.webp',
      },
    ])
  })

  it('ignores the icon-only review/cart anchors sharing the same product_id', async () => {
    const html = await loadFixture('dlsite-search-results-page.html')
    const results = parseDlsiteSearchResults(html)
    // 3 product_id anchors exist per item in the fixture (title, review,
    // cart) but only the title-bearing one should produce a result.
    expect(results).toHaveLength(2)
  })

  it('returns an empty array for a no-results page', async () => {
    const html = await loadFixture('dlsite-search-no-results-page.html')
    expect(parseDlsiteSearchResults(html)).toEqual([])
  })

  it('returns an empty array for unrecognized markup instead of throwing', () => {
    expect(
      parseDlsiteSearchResults('<html><body>completely different layout</body></html>')
    ).toEqual([])
  })

  it('deduplicates the thumbnail and title anchors pointing at the same product', async () => {
    const html = await loadFixture('dlsite-search-results-page.html')
    const results = parseDlsiteSearchResults(html)
    const codes = results.map((r) => r.code.value)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('ignores a product_id link whose type prefix is not RJ/VJ/ST', () => {
    const html = `
      <a href="//www.dlsite.com/maniax/work/=/product_id/BJ01234567.html" title="다른 타입">다른 타입</a>
    `
    expect(parseDlsiteSearchResults(html)).toEqual([])
  })
})
