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
  // href shapes seen: legacy .../work_type/RPG/..., Nuxt
  // .../work_category/doujin/work_type/SOU/from/icon.work - both match below.
  let workType: string | null = null
  row.find('a').each((_i, el) => {
    if (workType) return
    const href = $(el).attr('href') ?? ''
    const match = /\/work_type\/([A-Z0-9]+)\//.exec(href)
    if (match) workType = match[1]
  })
  return workType
}

type Cheerio = ReturnType<cheerio.CheerioAPI>

// Label -> value-cell pairs of the work's spec block, for BOTH page layouts
// DLsite has served:
//  - legacy: <table id="work_outline"><tr><th>ラベル</th><td>…</td></tr>
//  - 2026-11 Nuxt layout: <div class="c-productInfo__item">
//      <dt class="c-productInfo__key">ラベル</dt><dd class="c-productInfo__value">…</dd>
// The Nuxt layout also dropped #work_maker, so the circle/brand now only
// exists as the サークル名 / ブランド名 row. Title and og:image survived the
// redesign, which is why the old parser kept "succeeding" with empty
// genres/circle/date/workType instead of failing over to the JSON source.
function collectSpecRows($: cheerio.CheerioAPI): Map<string, Cheerio> {
  const rows = new Map<string, Cheerio>()
  $('#work_outline tr').each((_i, row) => {
    const label = $(row).find('th').first().text().trim()
    if (label && !rows.has(label)) rows.set(label, $(row).find('td').first())
  })
  $('.c-productInfo__item').each((_i, item) => {
    const label = $(item).find('.c-productInfo__key').first().text().trim()
    if (label && !rows.has(label)) rows.set(label, $(item).find('.c-productInfo__value').first())
  })
  return rows
}

function linkTexts($: cheerio.CheerioAPI, cell: Cheerio): string[] {
  const texts = cell
    .find('a')
    .map((_i, el) => $(el).text().trim())
    .get()
    .filter((text) => text !== '')
  return [...new Set(texts)]
}

// DLsite 작품 페이지 HTML을 파싱한다. 삭제된/존재하지 않는 작품 페이지는
// #work_name이 없는 별도 에러 페이지를 반환하므로 이를 null 신호로 쓴다.
export function parseDlsiteWorkPage(html: string): CrawledGameMetadata | null {
  const $ = cheerio.load(html)
  const title = $('#work_name').first().text().trim()
  if (!title) return null

  const rows = collectSpecRows($)

  const makerCell = rows.get('サークル名') ?? rows.get('ブランド名')
  const circle =
    $('#work_maker .maker_name a').first().text().trim() ||
    (makerCell ? (linkTexts($, makerCell)[0] ?? makerCell.text().trim()) : '')

  const dateCell = rows.get('販売日')
  const releaseDate = dateCell ? parseJapaneseDate(dateCell.text()) : ''

  // Legacy pages wrap genre links in .main_genre (other links in that cell
  // were unrelated); the Nuxt layout puts only genre tags in the cell.
  const genreCell = rows.get('ジャンル')
  let genres: string[] = []
  if (genreCell) {
    const legacy = genreCell.find('.main_genre')
    genres = linkTexts($, legacy.length > 0 ? legacy : genreCell)
  }

  const workTypeCell = rows.get('作品形式')
  const workType = workTypeCell ? extractWorkType($, workTypeCell) : null

  const coverImageUrl = $('meta[property="og:image"]').attr('content') ?? null

  return { title, circle, releaseDate, genres, coverImageUrl, workType }
}
