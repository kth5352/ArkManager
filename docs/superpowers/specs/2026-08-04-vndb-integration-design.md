# VNDB Integration — Design

## Goal

Let this app identify, crawl, and search visual novels via VNDB (vndb.org),
the same way it already does for DLsite (RJ/VJ) and Steam (ST) games —
recognizing a `VN`-prefixed code in a folder/file name, crawling metadata
and a cover image for it, letting the user open its VNDB page, and (new,
beyond what DLsite/Steam currently offer as a pair) searching VNDB by title
from a dedicated page.

## Scope

Seventh sub-project of the v1.0.2 backlog (group "D"). B, F, A, C, and G are
shipped. VNDB only — getchu.com (the other half of the original wishlist
item) is explicitly deferred; the user chose VNDB first because it has a
public JSON API (no HTML scraping, no fragility to a site redesign),
following the exact same "second/third source added to existing GameCode
machinery" pattern Steam already established. Not in scope: backlog item E
(Explorer overhaul), getchu, or a generic "search any source" abstraction
(a real gap this reveals — DLsite's search is DLsite-only-coded, Steam has
no search at all — but unifying that is a bigger refactor than this
sub-project needs).

## 1. Code Recognition & Identity

`GameCode.type` (`shared/types/scanner.ts`) widens from `'RJ' | 'VJ' | 'ST'`
to include `'VN'`, following the exact precedent Steam's `'ST'` already set
as a non-DLsite type sharing the same `GameCode`/`ScannedEntry` machinery —
this is the third type added to that union, not a new concept.

VNDB's own IDs are `v` + digits (e.g. `v17`), not two-letter-prefixed. This
app's existing convention is a two-letter prefix (RJ/VJ/ST) followed by
digits, and the user's own original request specifically said "VN-prefix" —
so a folder/file named e.g. `VN17 - Some Visual Novel` is recognized as
`{type: 'VN', value: 'VN17'}`, matching every other code's shape
(`RJ01234567`, `ST4282500`). The extra letter is a local convention this app
imposes, not something VNDB itself uses — every place that actually talks
to VNDB's API strips it (`VN17` → query for `v17`).

Two regexes currently encode the RJ/VJ/ST alternation and both need `VN`
added — `electron/main/scanner/codeRecognition.ts` (filename/foldername
auto-detection during a scan) and `src/pages/DlsiteSearch/parseCodeInput.ts`
(manual code-link input validation in `CodeLinkSection`/`LinkCodeDialog`).
These are already two independently-maintained copies of "the same"
pattern (the existing code's own comment says so) — this sub-project keeps
that as-is rather than unifying them, since deduplicating is unrelated
cleanup outside this feature's goal.

## 2. Crawling

VNDB's Kana API (`api.vndb.org/kana`) is a single `POST /vn` call with a
JSON body — no `cheerio`, no HTML parsing, unlike the DLsite/Steam
precedent. A new `electron/main/metadata/vndbClient.ts` exposes a
`crawlVndb(code: GameCode): Promise<CrawledGameMetadata | null>` matching
the exact contract `dlsiteParser.ts`/`steamParser.ts` already return
(`{title, circle, releaseDate, genres, coverImageUrl}` or `null` for "not
found"), so `crawlGameMetadata.ts`'s existing dispatch
(`code.type === 'ST' ? crawlSteam(code) : crawlDlsite(code)`) just gains a
third branch for `'VN'` the same way `'ST'` was added — no restructuring of
that function's shape.

**Correction after implementation (plan-writing + final review):** the
sub-sections below originally said `circle` defaults to `undefined` when no
developer is listed, and `releaseDate` stores VNDB's `null` as-is. Neither
compiles against `CrawledGameMetadata`'s real contract
(`electron/main/metadata/dlsiteParser.ts`), which requires both fields to be
non-optional strings. Corrected: both default to `''`, matching the
DLsite/Steam parsers' own "empty string on absence/failure" convention.
Also, the final whole-branch review found that VNDB's top-`rating` tags are
frequently plot-spoiling (its own fixture's top tags for a real VN were
literally "Time Travel"/"Memory Alteration"); the user was asked and chose
to exclude any tag whose `spoiler` level is non-zero before ranking, which
the sub-sections below now reflect (originally not considered at all).

Request: `{"filters": ["id", "=", "v17"], "fields": "title, released,
image.url, developers.name, tags.name, tags.rating, tags.spoiler"}`. Field
mapping to `CrawledGameMetadata`:
- `title` → `title` (VNDB's primary display title; not attempting to prefer
  `alttitle`/original-language variants — matches the DLsite/Steam parsers'
  own "one title field, no further nuance" precedent).
- `developers[0]?.name` → `circle` (VNDB models potentially multiple
  developers per VN; taking the first mirrors the existing parsers' own
  bias toward simplicity over modeling every edge case), defaulting to `''`
  when no developer is listed.
- `released` → `releaseDate`, defaulting to `''` for TBA/unreleased (VNDB
  returns `null` there; `''` matches the existing "empty string on
  absence" convention rather than storing `null`).
- `tags`, filtered to `spoiler === 0` (excludes minor/major-spoiler tags —
  a VN library's genre chips shouldn't leak plot details), then sorted by
  `rating` descending, top 10, mapped to their `name` → `genres` (VNDB
  attaches hundreds of tags with a relevance `rating` per VN; DLsite/Steam's
  own `genres` are a short curated list, so capping keeps the display
  comparable rather than dumping VNDB's full tag cloud into a field
  designed for a handful of short labels).
- `image.url` → `coverImageUrl`, downloaded and cached via the existing
  `cacheCoverImage.ts` unchanged (same function every other source already
  uses).

An empty `results` array (VNDB's own "not found" signal, no HTTP error)
maps to `null`, matching the DLsite/Steam parsers' `null`-for-not-found
convention exactly. Same `User-Agent` header and
`AbortSignal.timeout(NETWORK_TIMEOUT_MS)` (the existing 15s constant) as
every other outbound fetch in `crawlGameMetadata.ts`, for consistency and
so this doesn't need its own separate timeout tuning. No API token needed
for anonymous read access at this app's usage volume; the existing
bulk-crawl queue's own pacing (~1 request/second, `bulkCrawlQueue.ts`)
already stays comfortably under VNDB's public rate limit, so no new
throttling mechanism is needed beyond what already exists.

Because the bulk-crawl-missing queue calls this same dispatch per code with
no type-specific wiring, VN-coded entries get auto-crawled for free once
this lands — the same way Steam did when it was added, no separate
integration point.

## 3. Title Search (new scope beyond the DLsite/Steam precedent)

**Correction after plan pre-flight review:** the paragraph below originally
described a second standalone page (`VndbSearchPage.tsx`) plus a second
Sidebar entry, alongside the unchanged `DlsiteSearchPage.tsx`. Before any
implementation task was dispatched, pre-flight review flagged that this
would both duplicate ~150 lines of near-identical page code (a predictable
DRY-review conflict) and clutter the Sidebar with two search entries. The
user chose to merge instead. Corrected below.

`DlsiteSearchPage.tsx` is deleted and replaced by
`src/pages/GameSearch/GameSearchPage.tsx` — the same search-box → result
cards → click-to-crawl-and-save structure, now with a small "DLsite"/"VNDB"
toggle that decides which search endpoint a free-text title query hits. A
pasted code (any type, including `VN17`) still bypasses the toggle entirely
and resolves the same way regardless of which tab is active — the toggle
only governs free-text search. New IPC channel `METADATA_SEARCH_VNDB`,
backed by the same `/vn` endpoint with `{"filters": ["search", "=",
"<query>"], "fields": "title, image.url", "sort": "searchrank", "results":
25}` — `sort: "searchrank"` was added after the final whole-branch review
found the endpoint otherwise defaults to id-order, not relevance, for a
title search. Response shape matches `METADATA_SEARCH_DLSITE`'s own
existing `DlsiteSearchResultDto` shape (`{code, title, thumbnailUrl}`), just
sourced from VNDB instead. Reachable from the Sidebar as a single, renamed
"게임 검색" (Game Search) nav entry, replacing the old "DLsite 검색" entry
rather than adding a second one.

`src/pages/DlsiteSearch/parseCodeInput.ts` (and its test) stay where they
are, unmoved — 4 other files already import it cross-folder from that
location (`CodeLinkSection.tsx`, `LinkCodeDialog.tsx`, `SavesPage.tsx`,
`RecentlyPlayedPage.tsx`), so only the page component itself relocates to
the new `GameSearch` folder. The `DlsiteSearch` folder name is now a slight
misnomer for what's left in it (shared code-parsing logic, not anything
DLsite-specific) — left as-is rather than renaming, since moving it would
ripple into those 4 unrelated files for a purely cosmetic gain.

Manually typing a known code (`VN17`) still works unchanged from the
existing `CodeLinkSection`/`LinkCodeDialog` inputs, exactly like any other
code type today — search is an additional discovery path for finding a VN
whose code you don't already know, not a replacement for direct entry.

## 4. Opening the VNDB Page

`buildExternalUrl.ts` gains a `VN` branch, same shape as the existing `ST`
branch:
```ts
if (code.type === 'VN') {
  const numericId = code.value.slice(2) // "VN17" -> "17"
  return `https://vndb.org/v${numericId}`
}
```
placed alongside the existing `ST` check, before the DLsite-shaped default.

## Testing

- `codeRecognition.ts`/`parseCodeInput.ts`: extend their existing test
  files with `VN`-prefix cases (recognized, correctly separated from
  adjacent digits, case-insensitive input), mirroring the existing
  RJ/VJ/ST test cases exactly.
- `vndbClient.ts`'s field-mapping logic (VNDB JSON response →
  `CrawledGameMetadata`) is pure and gets a real unit test against a
  realistic fixture response object — no live network call — mirroring how
  `dlsiteParser.ts`/`steamParser.ts` are tested against fixture HTML rather
  than a live fetch.
- `buildExternalUrl.ts`: extend its existing test with a `VN`-type case.
- No test for the actual `fetch()` call itself or the new search page/IPC
  handler — matches this app's established precedent (no live-network
  tests, no component test infrastructure); verified live via `npm run dev`
  against the real VNDB API, same as every other UI/network-facing change
  this session.
