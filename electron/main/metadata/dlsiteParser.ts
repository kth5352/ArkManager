import * as cheerio from 'cheerio'

export interface CrawledGameMetadata {
  title: string
  circle: string
  releaseDate: string // 'YYYY-MM-DD', 파싱 실패 시 빈 문자열
  genres: string[]
  coverImageUrl: string | null
  workType: string | null // DLsite work_type 코드 (예: 'SOU', 'MOV', 'RPG'), 作品形式 행이 없으면 null
}

function parseJapaneseDate(text: string): string {
  const match = /(\d+)年(\d+)月(\d+)日/.exec(text)
  if (!match) return ''
  const [, year, month, day] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

// 作品形式 행에는 여러 태그가 나열될 수 있지만, 오직 첫 번째 태그만
// /work_type/XXX/ 링크를 가진다 - 두 번째 태그부터는(音声あり, 音楽あり 등)
// /fsr/=/work_category[0]/pc/options/XXX/ 형태의 전혀 다른 URL 패턴을 쓰는
// 부가 필터 옵션이므로, "첫 번째 work_type 링크를 찾는다"는 것 자체가 곧
// "가장 핵심적인 태그를 고른다"는 뜻이 된다 - 별도 우선순위 로직 불필요.
function extractWorkType($: cheerio.CheerioAPI, row: ReturnType<cheerio.CheerioAPI>): string | null {
  let workType: string | null = null
  row.find('a').each((_i, el) => {
    if (workType) return
    const href = $(el).attr('href') ?? ''
    const match = /\/work_type\/([A-Z0-9]+)\//.exec(href)
    if (match) workType = match[1]
  })
  return workType
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
  let workType: string | null = null
  $('#work_outline tr').each((_, row) => {
    const $row = $(row)
    const label = $row.find('th').text().trim()
    if (label === '販売日') {
      releaseDate = parseJapaneseDate($row.find('td').text())
    } else if (label === 'ジャンル') {
      genres = $row
        .find('.main_genre a')
        .map((_i, el) => $(el).text().trim())
        .get()
    } else if (label === '作品形式') {
      workType = extractWorkType($, $row.find('td'))
    }
  })

  const coverImageUrl = $('meta[property="og:image"]').attr('content') ?? null

  return { title, circle, releaseDate, genres, coverImageUrl, workType }
}
