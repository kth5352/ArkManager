import type { CrawledGameMetadata } from './dlsiteParser'
import type { GameCode } from '../../../shared/types/scanner'

// Without this, an unresponsive api.vndb.org leaves this fetch pending
// forever, matching crawlGameMetadata.ts's own reasoning for the same
// constant on the DLsite/Steam paths.
const NETWORK_TIMEOUT_MS = 15_000

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'

const VNDB_API_URL = 'https://api.vndb.org/kana/vn'

interface VndbApiVn {
  id: string
  title: string
  released: string | null
  image: { url: string } | null
  developers: { name: string }[]
  tags: { name: string; rating: number; spoiler: number }[]
}

interface VndbApiResponse {
  results: VndbApiVn[]
}

// VNDB attaches hundreds of tags with a relevance `rating` per VN -
// DLsite/Steam's own `genres` are a short curated list, so this caps the
// count to keep the display comparable rather than dumping VNDB's full tag
// cloud into a field designed for a handful of short labels.
const MAX_GENRES = 10

// Pure field mapping, exported for the fixture-based unit test above - no
// fetch involved. `developers[0]?.name` / `released` default to '' (never
// undefined/null) to match CrawledGameMetadata's own non-optional-string
// contract (dlsiteParser.ts) exactly, the same "empty string on
// absence/failure" convention the DLsite/Steam parsers already use.
export function mapVnToMetadata(vn: VndbApiVn): CrawledGameMetadata {
  const topTags = (vn.tags ?? [])
    .filter((tag) => tag.spoiler === 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, MAX_GENRES)
  return {
    title: vn.title,
    circle: vn.developers[0]?.name ?? '',
    releaseDate: vn.released ?? '',
    genres: topTags.map((tag) => tag.name),
    coverImageUrl: vn.image?.url ?? null,
  }
}

// code.value is this app's own two-letter-prefixed convention (e.g. "VN17")
// - VNDB's real ID drops the extra letter ("v17").
function toVndbId(code: GameCode): string {
  return `v${code.value.slice(2)}`
}

export async function crawlVndb(code: GameCode): Promise<CrawledGameMetadata | null> {
  const response = await fetch(VNDB_API_URL, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      filters: ['id', '=', toVndbId(code)],
      fields: 'title, released, image.url, developers.name, tags.name, tags.rating, tags.spoiler',
    }),
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return null

  const data = (await response.json()) as VndbApiResponse
  const vn = data.results?.[0]
  return vn ? mapVnToMetadata(vn) : null
}

export interface VndbSearchResult {
  code: GameCode
  title: string
  thumbnailUrl: string | null
}

interface VndbSearchApiVn {
  id: string
  title: string
  image: { url: string } | null
}

interface VndbSearchApiResponse {
  results: VndbSearchApiVn[]
}

// vn.id is VNDB's own "v17" shape - reattach this app's VN-prefix
// convention (the inverse of toVndbId above) so the result's code round-
// trips through parseCodeInput/extractCode/buildExternalUrl identically to
// a code recognized from a filename.
export function mapVnToSearchResult(vn: VndbSearchApiVn): VndbSearchResult {
  return {
    code: { type: 'VN', value: `VN${vn.id.slice(1)}` },
    title: vn.title,
    thumbnailUrl: vn.image?.url ?? null,
  }
}

export async function searchVndb(query: string): Promise<VndbSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed === '') return []

  const response = await fetch(VNDB_API_URL, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      filters: ['search', '=', trimmed],
      fields: 'title, image.url',
      sort: 'searchrank',
      results: 25,
    }),
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return []

  const data = (await response.json()) as VndbSearchApiResponse
  return (data.results ?? []).map(mapVnToSearchResult)
}
