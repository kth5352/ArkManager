# getchu.com Title Search — Design

## Goal

Add getchu.com title search, completing the getchu crawl-only sub-project's
deferred half. Widen `GameSearchPage.tsx`'s 4-way DLsite/Steam/VNDB/All
source picker to 5-way, adding getchu as its own tab AND as a fourth
participant in "All"'s grouped results.

## Scope

Direct follow-on to the just-shipped getchu crawl-only integration. This
time the search endpoint IS confirmed — unlike the original getchu
brainstorming (which only had access to an AI-summarizing page-fetch tool),
this design phase had real `curl` access and fully verified the search
endpoint, its parameters, and its real result markup against live
getchu.com traffic. No unresolved "investigate during implementation"
uncertainty this time, the way the crawler task needed.

## 1. Search Backend

Real, confirmed endpoint: `GET https://www.getchu.com/php/nsearch.phtml`
with query params `genre=pc_soft` (scope to PC games, matching what this
app's crawler already targets), `search_keyword=<query>`, `check_key_dtl=1`
(present on the site's own real search form, included for fidelity). EUC-JP
response, same `arrayBuffer()` + `TextDecoder('euc-jp')` decode
`crawlGetchu` already established.

Each result renders as two separate `<a href=".../soft.phtml?id=<id>">`
anchors sharing a container — one wrapping a lazy-loaded `<img
data-original="...">` (the real thumbnail URL; `src` is always a
placeholder `space.gif`, resolved client-side by JS this app never runs —
the exact same lazy-load problem this app's own `dlsiteSearchParser.ts`
already solved for DLsite), one wrapping the title text with `class="blueb"`.
New `electron/main/metadata/getchuSearchParser.ts`:

```ts
export interface GetchuSearchResult {
  code: GameCode
  title: string
  thumbnailUrl: string | null
}

export function parseGetchuSearchResults(html: string): GetchuSearchResult[]
```

Scope the cheerio query to the actual results-list container (confirmed via
live testing that a document-wide `soft.phtml?id=` match picks up unrelated
sidebar/ranking widget links even for a query with zero real matches) and
dedupe by id, mirroring `dlsiteSearchParser.ts`'s own established
container-scoping + `seen` Set pattern exactly.

**Age-gate confirmed NOT needed for search** — verified live: a known
real, age-gated title (used during the crawler's own age-gate-bypass
investigation) appears in search results without any `?gc=gc` parameter,
same as an ungated title. The only visible difference: a gated title's
`data-original` thumbnail is a generic `r18.jpg` placeholder image instead
of real cover art (getchu's own real behavior, not a bug to filter around —
passed through as-is, same as any other thumbnail URL). The age-gate bypass
`crawlGetchu` already uses stays scoped to fetching an individual work page
after a result is selected — unchanged, not touched by this task.

No-results: an empty (or garbage-free-of-genuine-matches, after container
scoping) result list — matches `crawlDlsiteSearch`'s/`searchVndb`'s/
`crawlSteamSearch`'s shared "empty array, not an error" convention.

## 2. IPC Surface

New channel `METADATA_SEARCH_GETCHU`, `SearchGetchuRequestSchema`,
`GetchuSearchResultDto` — a fourth near-identical copy of the existing
DLsite/VNDB/Steam search request/response schema triplet (already an
acknowledged, deliberately-deferred duplication from the unified-search
sub-project). New handler, new preload method, new `useSearchGetchu()`
renderer hook — all mirroring their VNDB/Steam siblings exactly.

## 3. `GameSearchPage.tsx`: 4-way → 5-way

`SearchSource` widens to `'all' | 'dlsite' | 'steam' | 'vndb' | 'getchu'`.
New toggle button (`getchu`, hardcoded brand-name text like the other three
brand buttons). "All" mode fires all FOUR searches simultaneously and
renders a fourth grouped section (`getchu` header, same empty-group-omission
and per-group pending/error handling the existing three groups already
have). Single-source `getchu` tab behaves like the other three single-source
tabs. Direct code paste (now including `GC<digits>`) continues to bypass
the toggle entirely, unaffected — already true today via the existing
`parseCodeInput` widening from the crawl-only sub-project.

## Testing

- `getchuSearchParser.ts`'s `parseGetchuSearchResults`: fixture-based test
  using a REAL captured search-results page (captured during
  implementation, same convention as the crawler's own fixture), covering
  a normal result, a gated result (verify the r18.jpg placeholder thumbnail
  passes through as-is, title still extracts correctly), and container
  scoping (confirm a document-wide false-positive link outside the results
  container is correctly excluded).
- No test for the actual `fetch()` call or the new IPC handler/page,
  matching this app's established precedent.
