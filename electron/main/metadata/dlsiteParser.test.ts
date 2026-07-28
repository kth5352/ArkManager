import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseDlsiteWorkPage } from './dlsiteParser'

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, '__fixtures__', name), 'utf-8')
}

describe('parseDlsiteWorkPage', () => {
  it('extracts title, circle, release date, genres, and cover image from a real work page', async () => {
    const html = await loadFixture('dlsite-work-page.html')
    expect(parseDlsiteWorkPage(html)).toEqual({
      title: 'シニシスタ2 SiNiSistar2',
      circle: 'ウー',
      releaseDate: '2025-04-12',
      genres: ['ドット', 'シスター', '丸呑み'],
      coverImageUrl:
        'https://img.dlsite.jp/modpub/images2/work/doujin/RJ01170000/RJ01169914_img_main.jpg',
    })
  })

  it('returns null for a delisted/nonexistent-work error page', async () => {
    const html = await loadFixture('dlsite-error-page.html')
    expect(parseDlsiteWorkPage(html)).toBeNull()
  })
})
