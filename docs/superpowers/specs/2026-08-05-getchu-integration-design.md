# getchu.com Integration (Crawl-Only) — Design

## Goal

Let this app identify and crawl a getchu.com-linked entry the same way it already does for DLsite (RJ/VJ), Steam (ST), and VNDB (VN) — recognizing a `GC`-prefixed code in a folder/file name, crawling metadata and a cover image for it, and letting the user open its getchu.com page. This completes the original wishlist item split during the VNDB sub-project's brainstorming ("getchu(GC-접두사)와 vndb(VN-접두사), 둘 다 구현할지 하나만 할지 모르겠음") — VNDB shipped first because it had a public API; getchu is the harder, scraping-based half, deferred until now.

## Scope

Eighth sub-project of the v1.0.2 backlog. Crawl-only: a folder/file already carrying (or manually linked to) a `GC<digits>` code gets its metadata crawled and its getchu.com page can be opened externally — the same feature level Steam had before this session's unified-search work added title search on top of it. **Explicitly not in scope:** getchu title search, any change to `GameSearchPage.tsx` (no fifth tab), backlog item E (Explorer overhaul), or either of the two still-unslotted small bugs (rename dialog reopening; launch config dialog toast/auto-launch).

Search was considered and deferred, not rejected outright: getchu.com's individual work-page URL (`getchu.com/soft.phtml?id=<digits>`, confirmed live and redirects internally to `/item/<digits>/`) is confirmed and stable enough to build a crawler against. Its search endpoint's exact request shape was NOT confirmed during design-time investigation (multiple guessed URLs 404'd; the tool used for investigation summarizes pages via markdown conversion rather than exposing raw HTML/form markup, so the real `<form>` action and parameter name for a keyword search couldn't be pinned down). Building search against an unconfirmed endpoint risks a plan full of guessed code — crawl-only avoids that risk entirely and ships the more valuable, better-understood half first.

## 1. Code Recognition & Identity

`GameCode.type` (`shared/types/scanner.ts`) widens from `'RJ' | 'VJ' | 'ST' | 'VN'` to include `'GC'` — the fifth type added to this union, following the exact precedent each prior addition (Steam, then VNDB) already set. A folder/file named `GC1370494 - 何らかの作品` is recognized as `{type: 'GC', value: 'GC1370494'}`.

Both regexes that separately encode the type alternation need `GC` added: `electron/main/scanner/codeRecognition.ts` (filename/foldername auto-detection) and `src/pages/DlsiteSearch/parseCodeInput.ts` (manual code-link input validation) — same two files VN touched, same reasoning (these are deliberately two independent implementations of "the same" pattern, not unified here either).

**Known secondary spot, confirmed to need the same fix again:** `src/lib/filterEntries.ts`'s `FilterableEntry.code.type` is its own independently-hardcoded literal union (not importing `GameCodeType`), discovered and fixed when VN was added — its test file (`filterEntries.test.ts`) has a matching local copy. Both need `'GC'` added. `electron/main/metadata/dlsiteSearchParser.ts`'s `VALID_CODE_TYPES` array stays untouched — it only validates codes scraped from DLsite's own search-result HTML, and getchu, like VNDB, never surfaces there.

`GameCodeSchema` (`shared/types/ipc.ts`, the zod IPC validator) also widens — this is not optional, since any GC-coded IPC call would otherwise throw a `ZodError` at runtime even with the TypeScript type alone widened (the same gap independently caught during VNDB's own planning).

## 2. Crawling

New `electron/main/metadata/getchuParser.ts`, structured like `dlsiteParser.ts`/`steamParser.ts`: a pure `parseGetchuWorkPage(html: string): CrawledGameMetadata | null` function, tested against a real fixture HTML file — same `{title, circle, releaseDate, genres, coverImageUrl}` contract, same non-optional-string-defaults-to-`''` rules confirmed during VNDB's planning. `crawlGameMetadata.ts`'s dispatch gains a fourth branch (`code.type === 'GC' ? crawlGetchu(code) : ...`), fetching `https://www.getchu.com/soft.phtml?id=<digits>` with the same `NETWORK_TIMEOUT_MS`/`User-Agent` convention every other outbound fetch in this app already uses.

**This task cannot ship with fully pre-written parsing code the way VNDB's/Steam's did.** Live investigation during design confirmed the page's real content (a genuine getchu PC-game product page returns title, brand/developer, release date, a single genre/tag line, and a cover image with no age-gate blocking access) but could not extract exact CSS class names or DOM structure — the tool available during design summarizes pages into markdown rather than exposing raw HTML. The implementation plan's crawling task must therefore start with the implementer fetching a real page directly (via `curl`/`fetch` in its own execution environment, which — unlike this design phase — has that capability) and inspecting the actual markup before writing `cheerio` selectors, following this codebase's own established resilience philosophy for scraped sites (`dlsiteSearchParser.ts`'s own comment: prefer stable structural anchors like a product-ID URL pattern over exact class names that are more likely to drift, degrade to `null`/empty on anything unexpected rather than throwing or returning garbage).

**Suspected but unconfirmed: response encoding.** Getchu.com's pages showed signs of possible Shift-JIS encoding during design-time investigation (garbled navigation text in the summarized output) rather than UTF-8, which every other source this app scrapes (DLsite) uses natively. This must be confirmed for real during implementation — inspect the actual response's `Content-Type` header and/or `<meta charset>` tag from a raw fetch, not inferred from a summarized preview. If confirmed Shift-JIS, decode the response body explicitly (Node's built-in `TextDecoder('shift_jis')` should work without a new dependency, since Node ships full ICU by default) before parsing with cheerio, rather than calling `response.text()` and assuming UTF-8.

An empty/not-found response (getchu's own signal for a delisted or nonexistent work — exact shape to be confirmed against a real fixture, likely an error page rather than an empty array like VNDB's JSON API) maps to `null`, matching the DLsite/Steam/VNDB parsers' shared convention.

Because the bulk-crawl-missing queue and `METADATA_CRAWL_AND_SAVE`'s IPC handler both already dispatch generically through `crawlGameMetadata`, GC-coded entries get crawl+save, cover-image caching, and bulk-crawl-missing for free once this dispatch branch exists — zero handler-level changes, the same "add a branch, nothing else moves" pattern ST/VN already established.

## 3. Opening the getchu.com Page

`buildExternalUrl.ts` gains a `GC` branch, same shape as the existing `ST`/`VN` branches:

```ts
if (code.type === 'GC') {
  const numericId = code.value.slice(2) // "GC1370494" -> "1370494"
  return `https://www.getchu.com/soft.phtml?id=${numericId}`
}
```

placed alongside the existing `ST`/`VN` checks, before the DLsite-shaped default.

## Testing

- `codeRecognition.ts`/`parseCodeInput.ts`: extend existing test files with `GC`-prefix cases, mirroring the existing RJ/VJ/ST/VN cases exactly.
- `filterEntries.ts`/`filterEntries.test.ts`: widen the local type, matching the exact fix VN's own final review already established as the correct pattern.
- `getchuParser.ts`'s `parseGetchuWorkPage`: real fixture-based unit test (a saved real HTML response, not a hand-written approximation), mirroring `dlsiteParser.test.ts`/`steamParser.test.ts`'s pattern — the fixture itself must be captured from a real fetch during implementation, not authored from this design's summarized-only investigation.
- `buildExternalUrl.ts`: extend its existing test with a `GC`-type case.
- No test for the actual `fetch()` call, matching this app's established no-live-network-test precedent.
