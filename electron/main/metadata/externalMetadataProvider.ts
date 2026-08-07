import { z } from 'zod'
import type { GameCode } from '../../../shared/types/scanner'
import type { CrawledGameMetadata } from './dlsiteParser'

const NETWORK_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'

const ExternalMetadataSchema = z.object({
  title: z.string().trim().min(1),
  circle: z.string().optional().default(''),
  releaseDate: z.string().optional().default(''),
  genres: z.array(z.string()).optional().default([]),
  coverImageUrl: z.string().url().nullable().optional().default(null),
})

export interface ExternalMetadataProviderConfig {
  enabled: boolean
  endpointUrl: string
  apiKey?: string
}

export function mapExternalMetadataToMetadata(value: unknown): CrawledGameMetadata | null {
  const parsed = ExternalMetadataSchema.safeParse(value)
  if (!parsed.success) return null
  return parsed.data
}

export async function crawlExternalMetadataProvider(
  code: GameCode,
  config: ExternalMetadataProviderConfig,
  fetchImpl: typeof fetch = fetch
): Promise<CrawledGameMetadata | null> {
  if (code.type !== 'RJ' && code.type !== 'VJ') return null
  if (!config.enabled || config.endpointUrl.trim() === '') return null

  let endpoint: URL
  try {
    endpoint = new URL(config.endpointUrl)
  } catch {
    return null
  }
  if (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') return null
  endpoint.searchParams.set('code', code.value)

  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  }
  const apiKey = config.apiKey?.trim()
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const response = await fetchImpl(endpoint, {
    headers,
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return null
  return mapExternalMetadataToMetadata(await response.json())
}
