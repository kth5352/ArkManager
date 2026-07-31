import * as cheerio from 'cheerio'
import type { GameCode, GameCodeType } from '../../../shared/types/scanner'

export interface DlsiteSearchResult {
  code: GameCode
  title: string
  thumbnailUrl: string | null
}

const VALID_CODE_TYPES: readonly GameCodeType[] = ['RJ', 'VJ', 'ST']

// DLsite's search-result list markup (class names, item wrapper element)
// isn't something this app can verify against a live page, and past
// redesigns have changed it - but every product's own detail-page link has
// always followed the stable /product_id/RJ01234567.html URL shape
// regardless of listing layout. Matching on that pattern instead of a
// specific selector is deliberately more resilient to markup drift: a
// selector guess that's wrong returns zero results (a safe, honest "no
// matches" state - see DlsiteSearchPage.tsx), never a crash or garbage data.
const PRODUCT_ID_PATTERN = /product_id\/([A-Za-z]{2}\d+)\.html/

// DLsite serves image URLs as protocol-relative ("//img.dlsite.jp/...")
// rather than absolute. That resolves against the CURRENT page's own scheme
// when rendered - fine on an https:// work page, but this app's renderer
// loads over file:// (packaged) or http://localhost (dev), where a
// protocol-relative URL would silently resolve to a broken address instead
// of the image host. Pin it to https explicitly so it's safe to render from
// either renderer origin.
function toAbsoluteImageUrl(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url
}

// DLsite's search results are Vue-hydrated: the <img> actually shown to a
// browser starts as a 1x1 placeholder ("data:image/gif;base64,...") and
// only gets its real src assigned client-side, by JS this app never runs.
// The real URL is still present in the raw HTML this app fetches, though -
// as literal text inside a Vue binding attribute (e.g.
// :thumb-candidates="['//img.dlsite.jp/.../foo_240x240.webp', ...]") rather
// than a plain attribute a DOM query could target directly, and the exact
// attribute/component name is exactly the kind of implementation detail
// likely to shift across DLsite's own redesigns. Scanning the surrounding
// container's raw HTML text for the first plausible image URL sidesteps
// depending on that name entirely.
const IMAGE_URL_PATTERN = /\/\/img\.dlsite\.jp\/[^"'\s]+?\.(?:jpg|jpeg|png|webp)/i

// 자유 텍스트 검색 결과 페이지를 파싱해 작품 목록을 추출한다. 마크업이
// 예상과 다르면(사이트 개편 등) 빈 배열을 반환한다 - 이는 "검색 결과 없음"과
// 구분되지 않지만, 잘못된 데이터를 보여주는 것보다 안전한 실패 방식이다.
export function parseDlsiteSearchResults(html: string): DlsiteSearchResult[] {
  const $ = cheerio.load(html)
  const results: DlsiteSearchResult[] = []
  const seen = new Set<string>()

  $('a[href*="/product_id/"]').each((_i, el) => {
    const anchor = $(el)
    const href = anchor.attr('href') ?? ''
    const match = PRODUCT_ID_PATTERN.exec(href)
    if (!match) return

    const codeValue = match[1].toUpperCase()
    if (seen.has(codeValue)) return

    const type = codeValue.slice(0, 2) as GameCodeType
    if (!VALID_CODE_TYPES.includes(type)) return

    // The thumbnail-wrapping anchor around the same product has no text and
    // no title attribute - skip it, only the title-bearing anchor should
    // produce a result.
    const title = (anchor.attr('title') ?? anchor.text()).trim()
    if (!title) return

    seen.add(codeValue)

    // A search result typically renders as two separate
    // <a href="/product_id/...">anchors sharing one ancestor block - one
    // wrapping the thumbnail <img> (no text, skipped above), one wrapping
    // the title text (this one). Walk up from the title anchor to find that
    // shared block, so the thumbnail can be read out of it even though it
    // isn't inside the title anchor itself. Falls back progressively to a
    // looser ancestor if none of the more specific ones match.
    const container = anchor.closest(
      'li, dl.work_1col, div.search_result_img_box_inner, div.search_result_box'
    )
    const scope = container.length > 0 ? container : anchor.closest('li, dl, div')
    const imageMatch = IMAGE_URL_PATTERN.exec(scope.html() ?? '')
    const thumbnailUrl = imageMatch ? toAbsoluteImageUrl(imageMatch[0]) : null

    results.push({ code: { type, value: codeValue }, title, thumbnailUrl })
  })

  return results
}
