import { parseDlsiteSearchResults, type DlsiteSearchResult } from './dlsiteSearchParser'

export type { DlsiteSearchResult }

// "home" spans every DLsite category (maniax/pro/appx/etc.) in one result
// set, unlike crawlGameMetadata.ts's per-category work-page URL - a title
// search doesn't know the work's category ahead of time, only its text.
function searchUrl(query: string): string {
  return `https://www.dlsite.com/home/fsr/=/language/jp/keyword/${encodeURIComponent(query)}/`
}

// Same timeout reasoning as crawlGameMetadata.ts - an unresponsive DLsite
// would otherwise hang the search indefinitely.
const NETWORK_TIMEOUT_MS = 15_000

export async function crawlDlsiteSearch(query: string): Promise<DlsiteSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed === '') return []

  const response = await fetch(searchUrl(trimmed), {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0' },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return []

  const html = await response.text()
  return parseDlsiteSearchResults(html)
}
