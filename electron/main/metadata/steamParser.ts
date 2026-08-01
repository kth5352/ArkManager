import * as cheerio from 'cheerio'
import type { CrawledGameMetadata } from './dlsiteParser'

const STEAM_MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

// Steam's release date reads like "9 Dec, 2020" (day-month-year, comma
// before the year) in the English store locale this app always requests.
function parseSteamReleaseDate(text: string): string {
  const match = /(\d{1,2})\s+([A-Za-z]{3,}),?\s+(\d{4})/.exec(text.trim())
  if (!match) return ''
  const [, day, monthName, year] = match
  const month = STEAM_MONTHS[monthName.slice(0, 3).toLowerCase()]
  if (!month) return ''
  return `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`
}

// Steam 상점 페이지 HTML을 파싱한다. 연령 확인 페이지(성인/폭력성 콘텐츠 경고)로
// 대체되면 #appHubAppName이 없는 별도 페이지가 오므로 이를 null 신호로 쓴다 -
// 호출하는 쪽(crawlGameMetadata.ts)이 연령 확인을 통과한 것으로 치는 쿠키를 실어
// 보내야 애초에 진짜 페이지를 받는다. "장르"는 genresAndManufacturer의 공식
// Genre 필드(보통 1~2개) 대신 "인기 사용자 태그"(popular_tags, 보통 5~10개)를
// 쓴다 - DLsite 작품의 장르 태그와 개수/성격이 더 비슷하고, 카드에 뱃지로 보여주는
// 용도(장르 필터 등)에 더 적합하다.
export function parseSteamStorePage(html: string): CrawledGameMetadata | null {
  const $ = cheerio.load(html)
  const title = $('#appHubAppName').first().text().trim()
  if (!title) return null

  const circle = $('#developers_list a').first().text().trim()
  const releaseDate = parseSteamReleaseDate($('.release_date .date').first().text())
  const genres = $('.glance_tags.popular_tags a.app_tag')
    .map((_i, el) => $(el).text().trim())
    .get()
  const coverImageUrl = $('meta[property="og:image"]').attr('content') ?? null

  return { title, circle, releaseDate, genres, coverImageUrl }
}
