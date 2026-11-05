import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Every outbound request the main process makes goes through here. The URLs
// come from third-party web pages / APIs (cover image URLs in crawled HTML or
// in a user-configured metadata API) and must be treated as untrusted:
//   - https only (http only for an explicit loopback dev provider)
//   - never to loopback / private / link-local / metadata-service addresses
//     (SSRF into the user's LAN, router admin pages, cloud metadata, ...)
//   - redirects are followed manually and re-validated on every hop
//   - response bodies are size-capped so a hostile server can't exhaust memory

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

export class ResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Response exceeded ${maxBytes} bytes`)
    this.name = 'ResponseTooLargeError'
  }
}

export const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024
export const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_REDIRECTS = 3

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    value = value * 256 + n
  }
  return value
}

function inV4Range(value: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base)
  if (baseInt === null) return false
  const size = 2 ** (32 - bits)
  return value >= baseInt && value < baseInt + size
}

const PRIVATE_V4_RANGES: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
]

/** True for any address that must never be reachable from a metadata/cover fetch. */
export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '').split('%')[0]
  const family = isIP(bare)
  if (family === 4) {
    const value = ipv4ToInt(bare)
    if (value === null) return true
    return PRIVATE_V4_RANGES.some(([base, bits]) => inV4Range(value, base, bits))
  }
  if (family === 6) {
    const lower = bare.toLowerCase()
    if (lower === '::' || lower === '::1') return true
    // IPv4-mapped / compatible (::ffff:a.b.c.d or ::ffff:aabb:ccdd)
    const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
    if (mapped) return isPrivateAddress(mapped[1])
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower)
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16)
      const lo = parseInt(mappedHex[2], 16)
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    const firstHextet = parseInt(lower.split(':')[0] || '0', 16)
    if ((firstHextet & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
    if ((firstHextet & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
    if ((firstHextet & 0xff00) === 0xff00) return true // ff00::/8 multicast
    return false
  }
  return true // not an IP at all: refuse rather than guess
}

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_NAMES.has(hostname.toLowerCase())
}

function isInternalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (isIP(h.replace(/^\[|\]$/g, '')) !== 0) return false // handled by isPrivateAddress
  if (!h.includes('.')) return true // intranet single-label names
  return /\.(local|localhost|internal|intranet|lan|home|corp|localdomain)$/.test(h)
}

export interface SafeFetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  /** Only for the user-configured metadata provider: allow http://localhost for local development. */
  allowLoopbackHttp?: boolean
  /**
   * Skip the private-address checks. Only for the provider URL the user typed in Settings
   * (e.g. a self-hosted API on their NAS); https and redirect re-validation still apply.
   */
  allowPrivateNetwork?: boolean
  /** Replace global fetch / dns lookup (tests). */
  fetchImpl?: typeof fetch
  lookupImpl?: (hostname: string) => Promise<{ address: string }[]>
}

async function defaultLookup(hostname: string): Promise<{ address: string }[]> {
  return lookup(hostname, { all: true, verbatim: true })
}

/** Throws UnsafeUrlError unless the URL is safe to request. Returns the parsed URL. */
export async function assertSafeUrl(
  rawUrl: string | URL,
  options: Pick<SafeFetchOptions, 'allowLoopbackHttp' | 'allowPrivateNetwork' | 'lookupImpl'> = {}
): Promise<URL> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UnsafeUrlError('Invalid URL')
  }
  if (url.username || url.password) throw new UnsafeUrlError('Credentials in URL are not allowed')

  const loopback = isLoopbackHostname(url.hostname)
  if (url.protocol === 'http:' && options.allowLoopbackHttp && loopback) return url
  if (url.protocol !== 'https:') throw new UnsafeUrlError('Only https URLs are allowed')
  if (url.port && url.port !== '443') throw new UnsafeUrlError('Non-standard ports are not allowed')

  if (loopback) {
    if (options.allowLoopbackHttp || options.allowPrivateNetwork) return url
    throw new UnsafeUrlError('Loopback addresses are not allowed')
  }

  if (options.allowPrivateNetwork) return url

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isInternalHostname(host)) throw new UnsafeUrlError('Internal host names are not allowed')
  if (isIP(host) !== 0) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError('Private addresses are not allowed')
    return url
  }

  let addresses: { address: string }[]
  try {
    addresses = await (options.lookupImpl ?? defaultLookup)(host)
  } catch {
    throw new UnsafeUrlError('Host could not be resolved')
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeUrlError('Host resolves to a private address')
  }
  return url
}

function limitBody(response: Response, maxBytes: number): Response {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    void response.body?.cancel().catch(() => {})
    throw new ResponseTooLargeError(maxBytes)
  }
  if (!response.body) return response

  let seen = 0
  const limiter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength
      if (seen > maxBytes) {
        controller.error(new ResponseTooLargeError(maxBytes))
        return
      }
      controller.enqueue(chunk)
    },
  })
  return new Response(response.body.pipeThrough(limiter), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

export async function safeFetch(rawUrl: string | URL, options: SafeFetchOptions = {}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES
  const deadline = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  let current = await assertSafeUrl(rawUrl, options)
  for (let hop = 0; ; hop += 1) {
    const response = await fetchImpl(current, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      redirect: 'manual',
      signal: deadline,
    })

    const isRedirect = response.status >= 300 && response.status < 400
    const location = response.headers.get('location')
    if (!isRedirect || !location) return limitBody(response, maxBytes)

    void response.body?.cancel().catch(() => {})
    if (hop >= maxRedirects) throw new UnsafeUrlError('Too many redirects')
    let next: URL
    try {
      next = new URL(location, current)
    } catch {
      throw new UnsafeUrlError('Invalid redirect target')
    }
    // A redirect to a different origin must not carry credentials along.
    if (next.origin !== current.origin && options.headers) {
      options = { ...options, headers: stripSensitiveHeaders(options.headers) }
    }
    current = await assertSafeUrl(next, options)
  }
}

function stripSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    if (lower === 'authorization' || lower === 'cookie' || lower === 'proxy-authorization') continue
    result[key] = value
  }
  return result
}
