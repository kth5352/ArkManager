import * as cheerio from 'cheerio'

export interface CrawledGameMetadata {
  title: string
  circle: string
  releaseDate: string // 'YYYY-MM-DD', 파싱 실패 시 빈 문자열
  genres: string[]
  coverImageUrl: string | null
}

function parseJapaneseDate(text: string): string {
  const match = /(\d+)年(\d+)月(\d+)日/.exec(text)
  if (!match) return ''
  const [, year, month, day] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

// DLsite 작품 페이지 HTML을 파싱한다. 삭제된/존재하지 않는 작품 페이지는
// #work_name이 없는 별도 에러 페이지를 반환하므로 이를 null 신호로 쓴다.
export function parseDlsiteWorkPage(html: string): CrawledGameMetadata | null {
  const $ = cheerio.load(html)
  const title = $('#work_name').text().trim()
  if (!title) return null

  const circle = $('#work_maker .maker_name a').first().text().trim()

  let releaseDate = ''
  let genres: string[] = []
  $('#work_outline tr').each((_, row) => {
    const label = $(row).find('th').text().trim()
    if (label === '販売日') {
      releaseDate = parseJapaneseDate($(row).find('td').text())
    } else if (label === 'ジャンル') {
      genres = $(row)
        .find('.main_genre a')
        .map((_i, el) => $(el).text().trim())
        .get()
    }
  })

  const coverImageUrl = $('meta[property="og:image"]').attr('content') ?? null

  return { title, circle, releaseDate, genres, coverImageUrl }
}
