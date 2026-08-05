import * as cheerio from 'cheerio'
import type { GameCode } from '../../../shared/types/scanner'

export interface GetchuSearchResult {
  code: GameCode
  title: string
  thumbnailUrl: string | null
}

// Same relative-path problem confirmed for the single-work crawl
// (getchuParser.ts) - getchu serves images as relative paths, and this
// value ends up passed to cacheCoverImage.ts's main-process fetch() (via
// this app's normal crawl-and-save flow once a search result is selected),
// which can't resolve a relative path with no <base> context.
function toAbsoluteImageUrl(url: string): string {
  return new URL(url, 'https://www.getchu.com/').href
}

const RESULT_ID_PATTERN = /soft\.phtml\?id=(\d+)/

// getchu 자유 텍스트 검색 결과 페이지를 파싱한다. 결과 항목은 <li> 하나에
// 썸네일 앵커(.package 안, data-original에 실제 이미지)와 제목 앵커
// (class="blueb")가 따로 들어있는 구조 - DLsite의 "두 개의 별도 앵커가 하나의
// 컨테이너를 공유" 패턴과 같은 종류의 문제다. class="blueb"는 실제 검색
// 결과의 제목 링크에만 쓰이는 것으로 확인되어, DLsite처럼 문서 전체를
// href 패턴으로 훑을 필요 없이 이 선택자 하나로 결과를 특정할 수 있다.
// 마크업이 예상과 다르면(사이트 개편 등) 빈 배열을 반환한다 - "검색 결과
// 없음"과 구분되지 않지만, 잘못된 데이터를 보여주는 것보다 안전하다.
export function parseGetchuSearchResults(html: string): GetchuSearchResult[] {
  const $ = cheerio.load(html)
  const results: GetchuSearchResult[] = []
  const seen = new Set<string>()

  $('a.blueb[href*="soft.phtml?id="]').each((_i, el) => {
    const anchor = $(el)
    const href = anchor.attr('href') ?? ''
    const match = RESULT_ID_PATTERN.exec(href)
    if (!match) return

    const id = match[1]
    if (seen.has(id)) return

    const title = anchor.text().trim()
    if (!title) return

    seen.add(id)

    const container = anchor.closest('li')
    const scope = container.length > 0 ? container : anchor.closest('div, td')
    const thumbnailAttr =
      scope.find('.package img[data-original]').first().attr('data-original') ??
      scope.find('img[data-original]').first().attr('data-original')
    const thumbnailUrl = thumbnailAttr ? toAbsoluteImageUrl(thumbnailAttr) : null

    results.push({ code: { type: 'GC', value: `GC${id}` }, title, thumbnailUrl })
  })

  return results
}
