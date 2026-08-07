import { z } from 'zod'
import type { GameCode } from '../../../shared/types/scanner'
import type { CrawledGameMetadata } from './dlsiteParser'
import { MetadataSourceError } from './metadataSourceError'

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

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
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
    throw new MetadataSourceError('provider_error', 'External metadata provider URL is invalid')
  }
  const secureEndpoint = endpoint.protocol === 'https:'
  const localDevelopmentEndpoint =
    endpoint.protocol === 'http:' && isLoopbackHostname(endpoint.hostname)
  if (!secureEndpoint && !localDevelopmentEndpoint) {
    throw new MetadataSourceError(
      'provider_error',
      'External metadata provider must use HTTPS unless it is a loopback endpoint'
    )
  }
  endpoint.searchParams.set('code', code.value)

  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  }
  const apiKey = config.apiKey?.trim()
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  let response: Response
  try {
    response = await fetchImpl(endpoint, {
      headers,
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    })
  } catch {
    throw new MetadataSourceError('provider_error', 'External metadata provider request failed')
  }
  if (response.status === 204 || response.status === 404 || response.status === 410) return null
  if (!response.ok) {
    throw new MetadataSourceError(
      'provider_error',
      `External metadata provider returned HTTP ${response.status}`
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new MetadataSourceError(
      'provider_error',
      'External metadata provider returned malformed JSON'
    )
  }
  const metadata = mapExternalMetadataToMetadata(payload)
  if (!metadata) {
    throw new MetadataSourceError(
      'provider_error',
      'External metadata provider response did not match the expected schema'
    )
  }
  return metadata
}
