import { parseDlsiteWorkPage, type CrawledGameMetadata } from './dlsiteParser'
import type { GameCode } from '../../../shared/types/scanner'

export type { CrawledGameMetadata }

// Without this, an unresponsive DLsite (or a captive portal / dead network)
// leaves this fetch pending forever - the awaiting IPC handler
// (METADATA_CRAWL_AND_SAVE) never resolves or rejects, so the "메타데이터
// 새로고침" button's mutation just spins indefinitely with no way for the
// user to recover short of restarting the app.
const NETWORK_TIMEOUT_MS = 15_000

function workPageUrl(code: GameCode): string | null {
  if (code.type === 'ST') return null // Steam 작품 - DLsite 크롤링 대상 아님
  const category = code.type === 'VJ' ? 'pro' : 'maniax'
  return `https://www.dlsite.com/${category}/work/=/product_id/${code.value}.html`
}

export async function crawlGameMetadata(code: GameCode): Promise<CrawledGameMetadata | null> {
  const url = workPageUrl(code)
  if (!url) return null

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0' },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return null

  const html = await response.text()
  return parseDlsiteWorkPage(html)
}
