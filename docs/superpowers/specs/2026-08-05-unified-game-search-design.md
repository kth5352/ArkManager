# Unified Game Search (DLsite + Steam + VNDB) — Design

## Goal

The VNDB integration sub-project (shipped, base `a119570`..`bb26baf`) merged
the old DLsite-only search page into `GameSearchPage.tsx` with a two-way
DLsite/VNDB toggle. Live-verifying that page, the user noticed a direct-code
paste (e.g. an `ST` Steam code) already resolves correctly regardless of
which tab is selected — a side effect of `parseCodeInput` recognizing every
code type — and asked why the DLsite-labeled tab implies DLsite-only when
it clearly isn't. This sub-project widens the page to a real 4-way source
picker (통합검색/All, DLsite, Steam, VNDB) and adds the one missing piece
that makes "All" meaningful: Steam title search, which this app has never
had (Steam has always been code-only: paste an `ST` code, no way to find
one by title).

## Scope

An immediate follow-on to the just-shipped VNDB integration, in the same
Ark Manager v1.0.2-era codebase. Not a new backlog item — a direct
extension of `GameSearchPage.tsx`'s already-merged design. Touches: a new
Steam search backend (mirroring the existing DLsite/VNDB search modules
exactly), IPC/preload/service-hook plumbing for it, and `GameSearchPage.tsx`
widened from 2 tabs to 4.

## 1. Steam Search Backend

Steam's storefront exposes a public, unauthenticated, JSON search endpoint
(confirmed live: `GET https://store.steampowered.com/api/storesearch/
?term=<query>&l=english&cc=US` → `{total, items: [{type, name, id,
tiny_image, ...}]}`) — no HTML scraping needed, the same simplification
VNDB's Kana API already gave this app over DLsite's own search (which does
scrape HTML, see `dlsiteSearchParser.ts`).

New `electron/main/metadata/steamSearchClient.ts`, structured like
`vndbClient.ts`'s search half:

```ts
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
  // GET, same NETWORK_TIMEOUT_MS/USER_AGENT convention as every other
  // outbound fetch in this app; empty items array (no HTTP error) -> [].
}
```

`mapItemToSearchResult` is pure and gets a fixture-based unit test, matching
`mapVnToSearchResult`'s own precedent. No test for the `fetch()` call
itself (established no-live-network-test precedent).

## 2. IPC Surface

New channel `METADATA_SEARCH_STEAM`, `SearchSteamRequestSchema` (`{query:
string}`), `SteamSearchResultDto` (`{code, title, thumbnailUrl}`) in
`shared/types/ipc.ts` — a third near-identical copy of the
`SearchDlsiteRequestSchema`/`SearchVndbRequestSchema` and
`DlsiteSearchResultDto`/`VndbSearchResultDto` pairs. The final VNDB-sub-
project review already flagged this duplication as worth collapsing into
one shared type eventually; adding a third copy makes that more true, not
less, but collapsing three already-shipped, working schemas as a side
effect of this feature is a bigger, riskier refactor than this feature
needs — deferred again, tracked as the same known cleanup item.

New handler in `metadataHandlers.ts` (mirrors `METADATA_SEARCH_VNDB`'s
handler exactly), new `searchSteam` preload method, new `useSearchSteam()`
renderer hook in `metadataService.ts` (mirrors `useSearchVndb()` exactly).

## 3. `GameSearchPage.tsx`: 2-way toggle → 4-way source picker

`SearchSource` widens from `'dlsite' | 'vndb'` to `'all' | 'dlsite' |
'steam' | 'vndb'`. Toggle UI gains two more buttons (`Steam`, hardcoded
brand-name text like the existing `DLsite`/`VNDB` buttons — no translation
key, matching precedent) and one new first button, `t('gameSearch.all')`
("통합검색"/"統合検索"/"All") — the only new translation key this task needs
beyond the DTO/schema types.

**Single-source tabs (`dlsite`/`steam`/`vndb`):** unchanged behavior from
today — free-text search hits that one source, results render as today's
flat list.

**`all` tab:** on search, fires all three mutations
(`searchDlsite.mutate`/`searchSteam.mutate`/`searchVndb.mutate`)
simultaneously rather than picking one via the `activeSearch` ternary.
Results render grouped by source — a `DLsite`/`Steam`/`VNDB` header per
group (same hardcoded brand-name labels as the toggle buttons), each
followed by that source's own result rows in its own order; a source with
zero results omits its whole group rather than showing an empty header.
"No results" (`dlsiteSearch.noResults`, reused) only shows once all three
have settled with zero total results across all groups. Per-source
pending/error states render inline within that source's own group (a slow
DLsite scrape doesn't block already-arrived Steam/VNDB results from
showing), rather than one blanket "searching..." indicator gating
everything.

**Unaffected by this change (verify, don't re-implement):** a direct code
paste (`RJ`/`VJ`/`ST`/`VN`, via `parseCodeInput`) already bypasses the
toggle entirely today and keeps doing so regardless of which of the 4 tabs
is active — this is the existing `handleSearch` short-circuit, untouched.
The back-link visibility fix from the prior sub-project (`hasBackTarget`/
`backTargetSource`) generalizes from "the other one of two tabs" to
"whichever of the (up to 4) tabs still has cached results, preferring the
current tab" — same principle, now over more tabs.

## Testing

- `steamSearchClient.ts`'s `mapItemToSearchResult`: fixture-based unit
  test (realistic `storesearch` JSON shape), mirroring `mapVnToSearchResult`.
- No test for the new IPC handler, preload method, or the widened page
  (established precedent, no component test infrastructure).
- Live verification via `npm run dev`: all 4 tabs individually, "All"
  grouping with realistic mixed result counts (including a query that
  returns 0 for one source and >0 for the others, to confirm empty-group
  omission), direct-code bypass still works from every tab, back-link
  behavior across tab switches with partial cached data.
