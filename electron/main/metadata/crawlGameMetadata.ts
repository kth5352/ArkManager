import { parseDlsiteWorkPage, type CrawledGameMetadata } from './dlsiteParser'
import type { GameCode } from '../../../shared/types/scanner'

export type { CrawledGameMetadata }

function workPageUrl(code: GameCode): string | null {
  if (code.type === 'ST') return null // Steam 작품 - DLsite 크롤링 대상 아님
  const category = code.type === 'VJ' ? 'pro' : 'maniax'
  return `https://www.dlsite.com/${category}/work/=/product_id/${code.value}.html`
}

export async function crawlGameMetadata(code: GameCode): Promise<CrawledGameMetadata | null> {
  const url = workPageUrl(code)
  if (!url) return null

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DLibrary/1.0' },
  })
  if (!response.ok) return null

  const html = await response.text()
  return parseDlsiteWorkPage(html)
}
