import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseGetchuSearchResults } from './getchuSearchParser'

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, '__fixtures__', name), 'utf-8')
}

describe('parseGetchuSearchResults', () => {
  it('extracts id, title, and thumbnail for a real search result', async () => {
    const html = await loadFixture('getchu-search-results.html')
    const results = parseGetchuSearchResults(html)
    const target = results.find((r) => r.code.value === 'GC1366941')
    expect(target).toEqual({
      code: { type: 'GC', value: 'GC1366941' },
      title: '小金井荘と金色の揚羽蝶 初回限定特装版',
      thumbnailUrl: 'https://www.getchu.com/brandnew/1366941/c1366941package_ss.jpg',
    })
  })

  it('does not return duplicate results for the same id', async () => {
    const html = await loadFixture('getchu-search-results.html')
    const results = parseGetchuSearchResults(html)
    const ids = results.map((r) => r.code.value)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns every result with a non-empty title', async () => {
    const html = await loadFixture('getchu-search-results.html')
    const results = parseGetchuSearchResults(html)
    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      expect(result.title.length).toBeGreaterThan(0)
    }
  })

  it('extracts a gated result with its r18 placeholder thumbnail and real title, same as an ungated result', async () => {
    const html = await loadFixture('getchu-search-results.html')
    const results = parseGetchuSearchResults(html)
    const gated = results.find((r) => r.thumbnailUrl?.includes('r18.jpg'))
    expect(gated).toBeDefined()
    expect(gated!.title.length).toBeGreaterThan(0)
    expect(gated!.code.type).toBe('GC')
  })

  it('returns an empty array for unrecognized markup instead of throwing', () => {
    expect(parseGetchuSearchResults('<html><body>completely different layout</body></html>')).toEqual([])
  })
})
