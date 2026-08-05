import { parseGetchuSearchResults, type GetchuSearchResult } from './getchuSearchParser'

export type { GetchuSearchResult }

const NETWORK_TIMEOUT_MS = 15_000

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'

function searchUrl(query: string): string {
  return `https://www.getchu.com/php/nsearch.phtml?genre=pc_soft&search_keyword=${encodeURIComponent(query)}&check_key_dtl=1`
}

// Search does NOT need the ?gc=gc age-gate bypass crawlGetchu
// (crawlGameMetadata.ts) uses for the single-work page - confirmed live
// during design that a real, age-gated title still appears in search
// results without it (just with a generic r18.jpg placeholder thumbnail
// instead of real cover art, not a bug).
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
