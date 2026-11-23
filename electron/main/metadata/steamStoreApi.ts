import { z } from 'zod'
import type { CrawledGameMetadata } from './dlsiteParser'
import { MetadataSourceError } from './metadataSourceError'
import { safeFetch } from '../net/safeFetch'

// Why an API instead of the store HTML page (store.steampowered.com/app/<id>):
// confirmed live (2026-11, from a KR connection) that the HTML page cannot be
// read anonymously for two large groups of titles this app cares about:
//  - "Adult Only Sexual Content" titles 302 to /agecheck/app/<id>, which
//    itself redirects to the Steam login page - no cookie skips it.
//  - Titles not sold in the requester's country return a 200 "Site Error"
//    page ("This item is currently unavailable in your region").
// The public store API used by Steam's own clients answers both anonymously
// when asked for a store country explicitly (country_code US), and includes
// the same weighted user tags the HTML page showed as "popular tags".
const GET_ITEMS_URL = 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/'
const GET_TAG_LIST_URL =
  'https://api.steampowered.com/IStoreService/GetTagList/v1/?language=english'
const ASSET_BASE_URL = 'https://shared.akamai.steamstatic.com/store_item_assets/'
const NETWORK_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'
// Same cap as VNDB's tag-derived genres (vndbClient.ts).
const MAX_GENRES = 10
// Steam's EResult: 1 = OK. Unknown/removed app ids come back as e.g. 15
// (AccessDenied) with visible:false and an empty name.
const ERESULT_OK = 1

const StoreItemSchema = z
  .object({
    success: z.number(),
    visible: z.boolean().optional(),
    name: z.string().optional(),
    basic_info: z
      .object({
        developers: z.array(z.object({ name: z.string() }).passthrough()).optional(),
        publishers: z.array(z.object({ name: z.string() }).passthrough()).optional(),
      })
      .passthrough()
      .optional()
      .catch(undefined),
    release: z
      .object({
        steam_release_date: z.number().optional(),
        original_steam_release_date: z.number().optional(),
      })
      .passthrough()
      .optional()
      .catch(undefined),
    assets: z
      .object({
        asset_url_format: z.string().optional(),
        header: z.string().optional(),
        main_capsule: z.string().optional(),
      })
      .passthrough()
      .optional()
      .catch(undefined),
    tags: z
      .array(z.object({ tagid: z.number(), weight: z.number().optional() }).passthrough())
      .optional()
      .catch(undefined),
  })
  .passthrough()

const GetItemsResponseSchema = z.object({
  response: z.object({ store_items: z.array(z.unknown()).optional() }).passthrough(),
})

const TagListResponseSchema = z.object({
  response: z.object({
    tags: z.array(z.object({ tagid: z.number(), name: z.string() }).passthrough()),
  }),
})

type FetchImpl = (url: string) => Promise<Response>

export interface SteamTagNameCache {
  get(fetchImpl: FetchImpl): Promise<Map<number, string>>
}

// The tag list is ~450 entries and practically static, so it is fetched
// once per process and shared by every crawl. A failed fetch is not cached
// (the next crawl retries).
export function createSteamTagNameCache(): SteamTagNameCache {
  let pending: Promise<Map<number, string>> | null = null
  return {
    get(fetchImpl) {
      if (!pending) {
        pending = (async () => {
          const response = await fetchImpl(GET_TAG_LIST_URL)
          if (!response.ok) throw new Error(`GetTagList returned HTTP ${response.status}`)
          const parsed = TagListResponseSchema.parse(await response.json())
          return new Map(parsed.response.tags.map((tag) => [tag.tagid, tag.name]))
        })()
        pending.catch(() => {
          pending = null
        })
      }
      return pending
    },
  }
}

const defaultTagNames = createSteamTagNameCache()

function defaultFetch(url: string): Promise<Response> {
  return safeFetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    timeoutMs: NETWORK_TIMEOUT_MS,
  })
}

function getItemsUrl(appId: string): string {
  const input = {
    ids: [{ appid: Number(appId) }],
    context: { language: 'english', country_code: 'US', steam_realm: 1 },
    data_request: {
      include_basic_info: true,
      include_release: true,
      include_assets: true,
      include_tag_count: 20,
    },
  }
  return `${GET_ITEMS_URL}?input_json=${encodeURIComponent(JSON.stringify(input))}`
}

function toIsoDate(unixSeconds: number | undefined): string {
  if (!unixSeconds) return ''
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

function coverUrl(assets: z.infer<typeof StoreItemSchema>['assets']): string | null {
  const file = assets?.header ?? assets?.main_capsule
  if (!assets?.asset_url_format || !file) return null
  return ASSET_BASE_URL + assets.asset_url_format.replace('${FILENAME}', file)
}

export interface SteamStoreApiOptions {
  fetchImpl?: FetchImpl
  tagNames?: SteamTagNameCache
}

/**
 * Returns null when Steam reports no such (visible) app. Throws
 * MetadataSourceError when the API itself fails, so the caller can fall back.
 */
export async function crawlSteamStoreApi(
  appId: string,
  options: SteamStoreApiOptions = {}
): Promise<CrawledGameMetadata | null> {
  if (!/^\d+$/.test(appId)) return null
  const fetchImpl = options.fetchImpl ?? defaultFetch
  const tagNames = options.tagNames ?? defaultTagNames

  let response: Response
  try {
    response = await fetchImpl(getItemsUrl(appId))
  } catch {
    throw new MetadataSourceError('network', 'Steam store API request failed')
  }
  if (!response.ok) {
    throw new MetadataSourceError('network', `Steam store API returned HTTP ${response.status}`)
  }

  let item: z.infer<typeof StoreItemSchema>
  try {
    const body = GetItemsResponseSchema.parse(await response.json())
    const first = body.response.store_items?.[0]
    if (first === undefined) return null
    item = StoreItemSchema.parse(first)
  } catch {
    throw new MetadataSourceError('parse', 'Steam store API response did not match the schema')
  }

  const title = item.name?.trim() ?? ''
  if (item.success !== ERESULT_OK || item.visible === false || title === '') return null

  const circle =
    item.basic_info?.developers?.[0]?.name ?? item.basic_info?.publishers?.[0]?.name ?? ''

  let genres: string[] = []
  const tags = [...(item.tags ?? [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
  if (tags.length > 0) {
    try {
      const names = await tagNames.get(fetchImpl)
      genres = tags
        .map((tag) => names.get(tag.tagid))
        .filter((name): name is string => Boolean(name))
        .slice(0, MAX_GENRES)
    } catch {
      // Tag names are a nice-to-have - the rest of the record is still valid.
    }
  }

  return {
    title,
    circle,
    releaseDate: toIsoDate(
      item.release?.steam_release_date ?? item.release?.original_steam_release_date
    ),
    genres,
    coverImageUrl: coverUrl(item.assets),
    workType: null,
  }
}
