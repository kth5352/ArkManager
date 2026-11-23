import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseDlsiteWorkPage } from './dlsiteParser'

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, '__fixtures__', name), 'utf-8')
}

describe('parseDlsiteWorkPage', () => {
  it('extracts title, circle, release date, genres, cover image, and work type from a real work page', async () => {
    const html = await loadFixture('dlsite-work-page.html')
    expect(parseDlsiteWorkPage(html)).toEqual({
      title: 'シニシスタ2 SiNiSistar2',
      circle: 'ウー',
      releaseDate: '2025-04-12',
      genres: ['ドット', 'シスター', '丸呑み'],
      coverImageUrl:
        'https://img.dlsite.jp/modpub/images2/work/doujin/RJ01170000/RJ01169914_img_main.jpg',
      workType: 'RPG',
    })
  })

  it('extracts SOU (voice/ASMR) work type', async () => {
    const html = await loadFixture('dlsite-work-page-asmr.html')
    expect(parseDlsiteWorkPage(html)?.workType).toBe('SOU')
  })

  it('returns null work type when the 作品形式 row is absent', async () => {
    const html = await loadFixture('dlsite-work-page-no-worktype.html')
    expect(parseDlsiteWorkPage(html)?.workType).toBeNull()
  })

  // DLsite moved work pages to a Nuxt layout (2026-11): the old
  // #work_outline <table> became .c-productInfo__item <dt>/<dd> pairs and
  // #work_maker disappeared. Title and og:image kept working, which is why
  // only genres/circle/release date/work type silently went missing.
  it('parses the 2026 c-productInfo markup (maniax / circle)', async () => {
    const html = await loadFixture('dlsite-work-page-2026-markup.html')
    expect(parseDlsiteWorkPage(html)).toEqual({
      title:
        '【寝落ちASMR】悪魔娘が最高に癒すのでものすごく眠れる(耳かき・囁き・マッサージ・泡オイル)',
      circle: '周防パトラ',
      releaseDate: '2020-10-05',
      genres: [
        'ASMR',
        '癒し',
        '健全',
        'バイノーラル/ダミヘ',
        '萌え',
        '耳かき',
        'ささやき',
        'Vtuber本人出演作品',
      ],
      coverImageUrl:
        'https://img.dlsite.jp/modpub/images2/work/doujin/RJ300000/RJ299717_img_main.jpg',
      workType: 'SOU',
    })
  })

  it('parses the 2026 c-productInfo markup (pro / brand)', async () => {
    const html = await loadFixture('dlsite-work-page-2026-markup-pro.html')
    expect(parseDlsiteWorkPage(html)).toMatchObject({
      circle: 'ULTRANOVA Entertainment',
      releaseDate: '2023-04-28',
      genres: ['3D作品', 'おさわり', '幼なじみ', '姉妹', '同居', 'ラブラブ/あまあま', '巨乳/爆乳'],
      workType: 'ADV',
    })
  })

  it('returns null for a delisted/nonexistent-work error page', async () => {
    const html = await loadFixture('dlsite-error-page.html')
    expect(parseDlsiteWorkPage(html)).toBeNull()
  })
})
