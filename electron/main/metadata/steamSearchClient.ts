import type { GameCode } from '../../../shared/types/scanner'

// Without this, an unresponsive store.steampowered.com leaves this fetch
// pending forever, matching vndbClient.ts's/crawlGameMetadata.ts's own
// reasoning for the same constant on every other outbound fetch.
const NETWORK_TIMEOUT_MS = 15_000

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'

interface SteamStoreSearchItem {
  id: number
  name: string
  tiny_image?: string
}

interface SteamStoreSearchResponse {
  items: SteamStoreSearchItem[]
}

export interface SteamSearchResult {
  code: GameCode
  title: string
  thumbnailUrl: string | null
}

export function mapItemToSearchResult(item: SteamStoreSearchItem): SteamSearchResult {
  return {
    code: { type: 'ST', value: `ST${item.id}` },
    title: item.name,
    thumbnailUrl: item.tiny_image ?? null,
  }
}

export async function crawlSteamSearch(query: string): Promise<SteamSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed === '') return []

  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(trimmed)}&l=english&cc=US`
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return []

  const data = (await response.json()) as SteamStoreSearchResponse
  return (data.items ?? []).map(mapItemToSearchResult)
}
