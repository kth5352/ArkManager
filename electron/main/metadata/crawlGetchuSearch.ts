import iconv from 'iconv-lite'
import { parseGetchuSearchResults, type GetchuSearchResult } from './getchuSearchParser'

export type { GetchuSearchResult }

const NETWORK_TIMEOUT_MS = 15_000

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'

// getchu serves AND parses in EUC-JP: its search form is a plain GET on an
// EUC-JP page with no accept-charset/_charset_ field, so a real browser
// submits search_keyword as EUC-JP bytes. The server's encoding
// auto-detection rejects UTF-8 for most Japanese input (verified live:
// real queries like 恋/戦国ランス/星空へ架かる橋 returned 0 results when
// UTF-8 percent-encoded, but their correct real result counts when EUC-JP
// percent-encoded) - encodeURIComponent, which is always UTF-8, cannot be
// used here. ASCII queries are byte-identical in both encodings, which is
// why this was invisible to every fixture/test built against an
// ASCII-only query ("sprite").
// Unreserved per RFC 3986 (same set encodeURIComponent leaves untouched) -
// keeping these bytes literal (instead of always emitting %XX) is what
// makes ASCII queries byte-identical to their encodeURIComponent output.
const UNRESERVED_BYTE = /^[A-Za-z0-9\-_.~]$/

export function encodeEucJpQuery(value: string): string {
  const bytes = iconv.encode(value, 'euc-jp')
  let encoded = ''
  for (const byte of bytes) {
    const char = String.fromCharCode(byte)
    encoded +=
      byte < 0x80 && UNRESERVED_BYTE.test(char)
        ? char
        : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return encoded
}

function searchUrl(query: string): string {
  return `https://www.getchu.com/php/nsearch.phtml?genre=pc_soft&search_keyword=${encodeEucJpQuery(query)}&check_key_dtl=1`
}

// Search does NOT need the ?gc=gc age-gate bypass crawlGetchu
// (crawlGameMetadata.ts) uses for the single-work page - confirmed live
// during design and re-confirmed against a much broader set of queries
// during final review that a real, age-gated title still appears in
// search results without it (just with a generic r18.jpg placeholder
// thumbnail instead of real cover art, not a bug).
export async function crawlGetchuSearch(query: string): Promise<GetchuSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed === '') return []

  const response = await fetch(searchUrl(trimmed), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return []

  const buffer = await response.arrayBuffer()
  const html = new TextDecoder('euc-jp').decode(buffer)
  return parseGetchuSearchResults(html)
}
