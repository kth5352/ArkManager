import { z } from 'zod'
import type { GameCode } from '../../../shared/types/scanner'
import type { CrawledGameMetadata } from './dlsiteParser'
import { MetadataSourceError } from './metadataSourceError'
import { safeFetch } from '../net/safeFetch'

const NETWORK_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'

// Every field but the title is optional and loosely typed: this parses two
// different DLsite endpoints (api/=/product.json, product/info/ajax) whose
// shapes have drifted over time. A field with an unexpected type must only
// drop that field, never the whole record - the live api/=/product.json
// returns image_main as an object, which previously failed the entire parse.
const DlsiteProductSchema = z
  .object({
    work_name: z.string().trim().min(1),
    maker_name: z.string().nullable().optional().catch(null),
    regist_date: z.string().nullable().optional().catch(null),
    work_type: z.string().nullable().optional().catch(null),
    genres: z
      .array(z.object({ name: z.string() }).passthrough())
      .nullable()
      .optional()
      .catch(null),
    custom_genres: z
      .array(
        z
          .object({
            name: z.string().nullable().optional(),
            lang: z.string().nullable().optional(),
            is_active: z.union([z.number(), z.boolean()]).nullable().optional(),
          })
          .passthrough()
      )
      .nullable()
      .optional()
      .catch(null),
    image_main: z
      .union([z.string(), z.object({ url: z.string().nullable().optional() }).passthrough()])
      .nullable()
      .optional()
      .catch(null),
  })
  .passthrough()

function normalizeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.startsWith('//')) return `https:${value}`
  try {
    return new URL(value, 'https://www.dlsite.com').toString()
  } catch {
    return null
  }
}

// regist_date comes back as 'YYYY-MM-DD HH:MM:SS'; the app stores 'YYYY-MM-DD'.
function normalizeDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '')
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

export function mapDlsiteJsonToMetadata(value: unknown): CrawledGameMetadata | null {
  const parsed = DlsiteProductSchema.safeParse(value)
  if (!parsed.success) return null
  const data = parsed.data

  // custom_genres are DLsite's curated "feature" tags (e.g. Vtuber本人出演作品)
  // that the work page lists alongside the normal genres; only the active
  // Japanese entries are what the page actually shows.
  const customGenres = (data.custom_genres ?? [])
    .filter((genre) => genre.lang === 'ja_JP' && Number(genre.is_active) === 1)
    .map((genre) => genre.name?.trim() ?? '')
  const genres = [
    ...new Set([...(data.genres ?? []).map((g) => g.name.trim()), ...customGenres]),
  ].filter((name) => name !== '')

  const image = typeof data.image_main === 'string' ? data.image_main : data.image_main?.url

  return {
    title: data.work_name,
    circle: data.maker_name ?? '',
    releaseDate: normalizeDate(data.regist_date),
    genres,
    coverImageUrl: normalizeImageUrl(image),
    workType: data.work_type ?? null,
  }
}

// api/=/product.json is the full product record (maker, genres, work_type).
// product/info/ajax only carries title/date/work_type (no maker, no genres),
// so it is kept as a last resort - it used to be tried first, which made
// the fallback "succeed" with no genres at all.
export function dlsiteJsonUrls(code: GameCode): string[] {
  const category = code.type === 'VJ' ? 'pro' : 'maniax'
  const baseUrl = `https://www.dlsite.com/${category}`
  return [
    `${baseUrl}/api/=/product.json?workno=${encodeURIComponent(code.value)}`,
    `${baseUrl}/product/info/ajax?product_id=${encodeURIComponent(code.value)}`,
  ]
}

function findProductMetadata(value: unknown): CrawledGameMetadata | null {
  const direct = mapDlsiteJsonToMetadata(value)
  if (direct) return direct
  if (Array.isArray(value)) {
    for (const item of value) {
      const metadata = mapDlsiteJsonToMetadata(item)
      if (metadata) return metadata
    }
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  for (const item of Object.values(value)) {
    const metadata = mapDlsiteJsonToMetadata(item)
    if (metadata) return metadata
  }
  return null
}

export async function crawlDlsiteJsonFallback(
  code: GameCode,
  fetchImpl: typeof fetch = ((input, init) =>
    safeFetch(String(input), {
      headers: init?.headers as Record<string, string> | undefined,
      timeoutMs: NETWORK_TIMEOUT_MS,
    })) as typeof fetch
): Promise<CrawledGameMetadata | null> {
  let lastError: MetadataSourceError | null = null
  for (const url of dlsiteJsonUrls(code)) {
    let response: Response
    try {
      response = await fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
      })
    } catch {
      lastError = new MetadataSourceError('network', `DLsite JSON request failed: ${url}`)
      continue
    }

    if (response.status === 204 || response.status === 404 || response.status === 410) continue
    if (!response.ok) {
      const reason = response.status >= 400 && response.status < 500 ? 'blocked' : 'network'
      lastError = new MetadataSourceError(
        reason,
        `DLsite JSON request returned HTTP ${response.status}: ${url}`
      )
      continue
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      lastError = new MetadataSourceError('parse', `DLsite JSON response was malformed: ${url}`)
      continue
    }
    const metadata = findProductMetadata(payload)
    if (metadata) return metadata
    lastError = new MetadataSourceError(
      'parse',
      `DLsite JSON response did not match the product schema: ${url}`
    )
  }
  if (lastError) throw lastError
  return null
}
