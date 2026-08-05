import * as cheerio from 'cheerio'
import type { CrawledGameMetadata } from './dlsiteParser'

// Getchu's release date reads like "2026/11/26" (slash-separated
// year/month/day), unlike DLsite's Japanese "X年Y月Z日" or Steam's
// "9 Dec, 2020" - each site this app scrapes uses its own real format.
function parseGetchuReleaseDate(text: string): string {
  const match = /(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(text.trim())
  if (!match) return ''
  const [, year, month, day] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

// Getchu 작품 페이지의 스펙 표(#soft_table)는 라벨(첫 td)/값(둘째 td) 형태의
// 행들로 이루어져 있다 - "발매일：" 같은 라벨 뒤에 전각 콜론이 붙어 있어
// DLsite의 th 라벨(콜론 없음)과 다르다.
function findSpecRowValue(
  $: ReturnType<typeof cheerio.load>,
  label: string
): ReturnType<typeof $> | null {
  let found: ReturnType<typeof $> | null = null
  $('#soft_table tr').each((_i, row) => {
    if (found) return
    const cells = $(row).find('td')
    if (cells.length < 2) return
    const rowLabel = cells
      .first()
      .text()
      .trim()
      .replace(/[：:]+$/, '')
    if (rowLabel === label) {
      found = cells.eq(1)
    }
  })
  return found
}

// Getchu는 상대 경로("/brandnew/...")로 이미지를 서빙한다 - DLsite(프로토콜
// 상대), Steam(절대 URL)과 또 다르다. 렌더러가 file:///http://localhost에서
// 로드되므로 상대 경로 그대로는 깨진다 - 항상 origin을 붙여 절대화한다.
function toAbsoluteImageUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url
  return `https://www.getchu.com${url.startsWith('/') ? '' : '/'}${url}`
}

// Getchu 작품 페이지 HTML을 파싱한다. 존재하지 않는/삭제된 id는 soft.phtml이
// 404(non-2xx)를 반환해 fetch 단계(crawlGameMetadata.ts)에서 이미 걸러지므로
// 여기서는 별도의 "찾을 수 없음" 페이지 모양을 모델링하지 않는다 - 다만 실제
// 작품 페이지가 아닌 다른 페이지(예: 연령 인증 페이지)로 넘어온 경우를 대비해
// #soft-title이 없으면 null을 반환한다 (DLsite의 #work_name 부재 신호와 같은
// 방식).
export function parseGetchuWorkPage(html: string): CrawledGameMetadata | null {
  const $ = cheerio.load(html)

  const titleEl = $('#soft-title').first().clone()
  titleEl.children('nobr').remove()
  const title = titleEl.text().trim()
  if (!title) return null

  const circle = $('#brandsite').first().text().trim()

  const releaseDateCell = findSpecRowValue($, '発売日')
  const releaseDate = releaseDateCell ? parseGetchuReleaseDate(releaseDateCell.text()) : ''

  const genres: string[] = []
  const genreCell = findSpecRowValue($, 'ジャンル')
  if (genreCell) {
    const genreText = genreCell.text().trim()
    genreText
      .split(/[/、,]/)
      .map((g) => g.trim())
      .filter((g) => g.length > 0)
      .forEach((g) => genres.push(g))
  }
  const subGenreCell = findSpecRowValue($, 'サブジャンル')
  if (subGenreCell) {
    subGenreCell.find('a').each((_i, el) => {
      const text = $(el).text().trim()
      // The subgenre cell also links to a "[一覧]" (list) page alongside
      // the actual subgenre tag - skip that one, it isn't a genre.
      if (text && !text.includes('一覧') && !genres.includes(text)) {
        genres.push(text)
      }
    })
  }

  const ogImage = $('meta[property="og:image"]').attr('content')
  const coverImageUrl = ogImage ? toAbsoluteImageUrl(ogImage) : null

  return { title, circle, releaseDate, genres, coverImageUrl }
}
