import { z } from 'zod'
import type { GameCode } from '../../../shared/types/scanner'
import type { CrawledGameMetadata } from './dlsiteParser'
import { MetadataSourceError } from './metadataSourceError'

const NETWORK_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'

const DlsiteProductSchema = z
  .object({
    work_name: z.string().trim().min(1),
    maker_name: z.string().nullable().optional(),
    regist_date: z.string().nullable().optional(),
    genres: z
      .array(z.object({ name: z.string() }).passthrough())
      .nullable()
      .optional(),
    image_main: z.string().nullable().optional(),
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

export function mapDlsiteJsonToMetadata(value: unknown): CrawledGameMetadata | null {
  const parsed = DlsiteProductSchema.safeParse(value)
  if (!parsed.success) return null

  return {
    title: parsed.data.work_name,
    circle: parsed.data.maker_name ?? '',
    releaseDate: parsed.data.regist_date ?? '',
    genres: (parsed.data.genres ?? []).map((genre) => genre.name),
    coverImageUrl: normalizeImageUrl(parsed.data.image_main),
  }
}

export function dlsiteJsonUrls(code: GameCode): string[] {
  const category = code.type === 'VJ' ? 'pro' : 'maniax'
  const baseUrl = `https://www.dlsite.com/${category}`
  return [
    `${baseUrl}/product/info/ajax?product_id=${encodeURIComponent(code.value)}`,
    `${baseUrl}/product.json?workno=${encodeURIComponent(code.value)}`,
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
  fetchImpl: typeof fetch = fetch
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
