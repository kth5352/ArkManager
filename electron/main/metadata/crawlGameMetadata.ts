import { parseDlsiteWorkPage, type CrawledGameMetadata } from './dlsiteParser'
import { parseSteamStorePage } from './steamParser'
import { crawlVndb } from './vndbClient'
import { parseGetchuWorkPage } from './getchuParser'
import { crawlDlsiteJsonFallback } from './dlsiteJsonFallback'
import {
  crawlExternalMetadataProvider,
  type ExternalMetadataProviderConfig,
} from './externalMetadataProvider'
import type { GameCode } from '../../../shared/types/scanner'
import type { MetadataFailureReason } from '../database/metadataFailuresRepository'
import {
  metadataFailureReasonFromError,
  type MetadataSourceFailureReason,
} from './metadataSourceError'

export type { CrawledGameMetadata }

// Without this, an unresponsive DLsite/Steam (or a captive portal / dead
// network) leaves this fetch pending forever - the awaiting IPC handler
// (METADATA_CRAWL_AND_SAVE) never resolves or rejects, so the "메타데이터
// 새로고침" button's mutation just spins indefinitely with no way for the
// user to recover short of restarting the app.
const NETWORK_TIMEOUT_MS = 15_000

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'

function dlsiteWorkPageUrl(code: GameCode): string {
  const category = code.type === 'VJ' ? 'pro' : 'maniax'
  return `https://www.dlsite.com/${category}/work/=/product_id/${code.value}.html`
}

// Steam replaces a mature/violent-content app's real store page with an age
// interstitial (no #appHubAppName, see steamParser.ts) unless the request
// already looks like it came from someone past that check - these are the
// same birthtime/lastagecheckage/wants_mature_content cookies the site's own
// age-gate form sets on submission, just supplied upfront so this never
// actually has to see the interstitial for the common "mature content"
// tier. A stricter "adult only sexual content" tier some titles carry
// requires an actual logged-in, age-verified Steam account and can't be
// bypassed this way - those will still come back null here.
const STEAM_AGE_CHECK_COOKIE =
  'birthtime=283996801; lastagecheckage=1-0-1979; wants_mature_content=1'

export async function crawlDlsiteHtml(code: GameCode): Promise<CrawledGameMetadata | null> {
  const response = await fetch(dlsiteWorkPageUrl(code), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return null
  return parseDlsiteWorkPage(await response.text())
}

async function crawlSteam(code: GameCode): Promise<CrawledGameMetadata | null> {
  const numericId = code.value.slice(2)
  const response = await fetch(`https://store.steampowered.com/app/${numericId}`, {
    headers: { 'User-Agent': USER_AGENT, Cookie: STEAM_AGE_CHECK_COOKIE },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return null
  return parseSteamStorePage(await response.text())
}

// Getchu serves its pages as EUC-JP (confirmed via both the response's own
// Content-Type header and its <meta charset> tag against a real fetch,
// neither Shift_JIS nor UTF-8 as design-time investigation had suspected but
// not confirmed) - response.text() would assume UTF-8 and mangle every
// Japanese character, so the raw bytes are decoded explicitly instead.
//
// Fetches /item/<id>/?gc=gc directly rather than soft.phtml?id=<id> (which
// 301-redirects to /item/<id>/ with no query string). A real, live product
// can be age-gated - getchu redirects an ungated request to
// /php/attestation.html instead of the actual page, with no #soft-title,
// which this app's own "not found" null-guard was originally (wrongly)
// documented as covering. The gated attestation page itself links to
// exactly this ?gc=gc-suffixed item URL as its own "confirm and continue"
// path - confirmed live against multiple real gated AND ungated titles that
// it returns the real page in both cases, and that a genuinely nonexistent
// id (no such product at all) still 404s normally. So this isn't a scrape
// of an internal confirmation flow - it's the same URL getchu's own page
// already links to for a human to click through, just supplied upfront.
async function crawlGetchu(code: GameCode): Promise<CrawledGameMetadata | null> {
  const numericId = code.value.slice(2)
  const response = await fetch(`https://www.getchu.com/item/${numericId}/?gc=gc`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return null
  const buffer = await response.arrayBuffer()
  const html = new TextDecoder('euc-jp').decode(buffer)
  return parseGetchuWorkPage(html)
}

export interface CrawlGameMetadataDeps {
  crawlDlsiteHtml: (code: GameCode) => Promise<CrawledGameMetadata | null>
  crawlDlsiteJson: (code: GameCode) => Promise<CrawledGameMetadata | null>
  crawlExternal: (code: GameCode) => Promise<CrawledGameMetadata | null>
  shouldCrawlExternal?: () => boolean
}

export interface CrawlTraceResult {
  metadata: CrawledGameMetadata | null
  attemptedSources: string[]
  reason: MetadataFailureReason | null
}

const DISABLED_EXTERNAL_PROVIDER: ExternalMetadataProviderConfig = {
  enabled: false,
  endpointUrl: '',
}

export function createCrawlGameMetadataDeps(
  externalConfig: ExternalMetadataProviderConfig = DISABLED_EXTERNAL_PROVIDER
): CrawlGameMetadataDeps {
  return {
    crawlDlsiteHtml,
    crawlDlsiteJson: crawlDlsiteJsonFallback,
    crawlExternal: (code) => crawlExternalMetadataProvider(code, externalConfig),
    shouldCrawlExternal: () => externalConfig.enabled && externalConfig.endpointUrl.trim() !== '',
  }
}

const defaultDeps = createCrawlGameMetadataDeps()

async function crawlSingleSource(
  source: string,
  crawl: () => Promise<CrawledGameMetadata | null>
): Promise<CrawlTraceResult> {
  try {
    const metadata = await crawl()
    return {
      metadata,
      attemptedSources: [source],
      reason: metadata ? null : 'not_found',
    }
  } catch (error) {
    return {
      metadata: null,
      attemptedSources: [source],
      reason: metadataFailureReasonFromError(error, 'network'),
    }
  }
}

export async function crawlGameMetadataWithTrace(
  code: GameCode,
  deps: CrawlGameMetadataDeps = defaultDeps
): Promise<CrawlTraceResult> {
  if (code.type === 'ST') return crawlSingleSource('steam', () => crawlSteam(code))
  if (code.type === 'VN' || code.type === 'VR') {
    return crawlSingleSource('vndb', () => crawlVndb(code))
  }
  if (code.type === 'GC') return crawlSingleSource('getchu', () => crawlGetchu(code))

  const attemptedSources: string[] = []
  let reason: MetadataFailureReason = 'blocked'
  const sources: {
    name: string
    crawl: (code: GameCode) => Promise<CrawledGameMetadata | null>
    failureReason: MetadataSourceFailureReason
  }[] = [
    { name: 'dlsite-html', crawl: deps.crawlDlsiteHtml, failureReason: 'network' },
    { name: 'dlsite-json', crawl: deps.crawlDlsiteJson, failureReason: 'network' },
  ]
  if (deps.shouldCrawlExternal?.() ?? true) {
    sources.push({
      name: 'external',
      crawl: deps.crawlExternal,
      failureReason: 'provider_error',
    })
  }

  for (const source of sources) {
    attemptedSources.push(source.name)
    try {
      const metadata = await source.crawl(code)
      if (metadata) return { metadata, attemptedSources, reason: null }
    } catch (error) {
      reason = metadataFailureReasonFromError(error, source.failureReason)
    }
  }

  return { metadata: null, attemptedSources, reason }
}

export async function crawlGameMetadata(
  code: GameCode,
  deps: CrawlGameMetadataDeps = defaultDeps
): Promise<CrawledGameMetadata | null> {
  return (await crawlGameMetadataWithTrace(code, deps)).metadata
}
