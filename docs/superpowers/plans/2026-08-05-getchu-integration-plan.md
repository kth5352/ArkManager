# getchu.com Integration (Crawl-Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `'GC'` as a fifth `GameCodeType`, recognized the same way `'RJ'`/`'VJ'`/`'ST'`/`'VN'` already are, crawled by scraping getchu.com's real work page, and openable via its getchu.com page. No search — crawl-only, matching Steam's original feature level before this session's unified-search work.

**Architecture:** Task 1 widens the shared `GameCode` union, its zod schema, both filename/input regexes, and a known independently-hardcoded type list (`filterEntries.ts`) — this part is fully known and specified with complete literal code, following the exact precedent VN's own equivalent task established. Task 2 extends `buildExternalUrl.ts` with a `GC` branch, also fully known. **Task 3 is categorically different from every task in this plan (and every task in every prior sub-project this session):** getchu.com's real HTML structure was never directly observed during design (the design-phase investigation tool only returns AI-summarized page content, not raw markup), so Task 3 cannot ship with pre-verified parser code. It is written as an investigation-then-implementation task — the implementer captures real markup first (via an actual HTTP fetch, not summarized), then writes a parser against what they actually find, following this codebase's established resilience philosophy for scraped sites (`dlsiteSearchParser.ts`'s own precedent: prefer stable structural anchors over exact class names, degrade to `null`/empty on anything unexpected).

**Tech Stack:** Electron + TypeScript strict, zod (IPC schemas), cheerio (HTML parsing, already a dependency via `dlsiteParser.ts`/`dlsiteSearchParser.ts`), Vitest (fixture-based unit tests, no live network calls in the test suite itself).

## Global Constraints

- `CrawledGameMetadata` (`electron/main/metadata/dlsiteParser.ts:3-9`) is a hard contract: `{title: string, circle: string, releaseDate: string, genres: string[], coverImageUrl: string | null}`. Every field except `coverImageUrl` is a non-optional string/array — default to `''`/`[]` on absence or parse failure, never `undefined`, never `null`.
- A `GC<digits>` code strips its 2-letter prefix the same way every other type does: `code.value.slice(2)` gives the digits.
- `NETWORK_TIMEOUT_MS = 15_000` and `USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'` — same values as every other outbound fetch in this app (`crawlGameMetadata.ts`).
- No test for the actual `fetch()` call in the shipped test suite — matches this app's established no-live-network-test precedent. This does NOT apply to Task 3's own investigation step, which requires a real, one-time fetch performed by the implementer outside the test suite to capture a fixture.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Widen `GameCodeType` to include `'GC'` (type, schema, both regexes, `filterEntries.ts`)

**Files:**
- Modify: `shared/types/scanner.ts:1`
- Modify: `shared/types/ipc.ts:198-201`
- Modify: `electron/main/scanner/codeRecognition.ts`
- Modify: `electron/main/scanner/codeRecognition.test.ts`
- Modify: `src/pages/DlsiteSearch/parseCodeInput.ts`
- Modify: `src/pages/DlsiteSearch/parseCodeInput.test.ts`
- Modify: `src/lib/filterEntries.ts:12`
- Modify: `src/lib/filterEntries.test.ts:7`

**Interfaces:**
- Produces: `GameCodeType = 'RJ' | 'VJ' | 'ST' | 'VN' | 'GC'` (consumed by every later task). `GameCodeSchema` (zod) validates the same five values — every IPC call carrying a `GameCode` runs its payload through this schema.

- [ ] **Step 1: Widen the `GameCodeType` union**

Edit `shared/types/scanner.ts:1`:

```ts
export type GameCodeType = 'RJ' | 'VJ' | 'ST' | 'VN' | 'GC'
```

- [ ] **Step 2: Widen `GameCodeSchema`'s zod enum**

Edit `shared/types/ipc.ts:198-201`:

```ts
export const GameCodeSchema = z.object({
  type: z.enum(['RJ', 'VJ', 'ST', 'VN', 'GC']),
  value: z.string(),
})
```

- [ ] **Step 3: Write the failing test for `extractCode`**

Add to `electron/main/scanner/codeRecognition.test.ts` (inside the existing `describe('extractCode', ...)` block, after the existing `'recognizes a VN (VNDB) code'` test):

```ts
  it('recognizes a GC (getchu) code', () => {
    expect(extractCode('GC1370494 - 何らかの作品')).toEqual({ type: 'GC', value: 'GC1370494' })
  })
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run electron/main/scanner/codeRecognition.test.ts`
Expected: FAIL — `extractCode('GC1370494 - 何らかの作品')` returns `null` (current regex only matches `RJ|VJ|ST|VN`).

- [ ] **Step 5: Widen `CODE_PATTERN` in `codeRecognition.ts`**

Edit `electron/main/scanner/codeRecognition.ts:12`:

```ts
const CODE_PATTERN = /(?<![A-Za-z0-9])(RJ|VJ|ST|VN|GC)(\d+)(?![0-9])/i
```

Only the alternation inside the first capture group changes; `extractCode`'s body is untouched.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run electron/main/scanner/codeRecognition.test.ts`
Expected: PASS (13 tests, including the new one).

- [ ] **Step 7: Write the failing test for `parseCodeInput`**

Add to `src/pages/DlsiteSearch/parseCodeInput.test.ts` (inside the existing `describe('parseCodeInput', ...)` block, after the existing `'recognizes an ST (Steam) code typed directly'` test):

```ts
  it('recognizes a GC (getchu) code typed directly', () => {
    expect(parseCodeInput('GC1370494')).toEqual({ type: 'GC', value: 'GC1370494' })
  })
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npx vitest run src/pages/DlsiteSearch/parseCodeInput.test.ts`
Expected: FAIL — `parseCodeInput('GC1370494')` returns `null`.

- [ ] **Step 9: Widen `CODE_PATTERN` and the doc comment in `parseCodeInput.ts`**

Edit `src/pages/DlsiteSearch/parseCodeInput.ts`:

```ts
import type { GameCode, GameCodeType } from '../../../shared/types/scanner'

const CODE_PATTERN = /^(RJ|VJ|ST|VN|GC)(\d+)$/i

// 입력이 RJ/VJ/ST/VN/GC 코드 형식이면 GameCode로, 아니면 null(자유 텍스트 제목
// 검색으로 취급)을 반환한다. electron/main/scanner/codeRecognition.ts의
// extractCode와 의도는 같지만 그쪽은 파일명 "안에서" 코드를 찾고 이쪽은
// 입력 "전체가" 코드인지 판별하므로 앵커(^...$)가 다르다 - 별도 구현.
export function parseCodeInput(input: string): GameCode | null {
  const trimmed = input.trim()
  const match = CODE_PATTERN.exec(trimmed)
  if (!match) return null
  const type = match[1].toUpperCase() as GameCodeType
  return { type, value: `${type}${match[2]}` }
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run src/pages/DlsiteSearch/parseCodeInput.test.ts`
Expected: PASS (6 tests, including the new one).

- [ ] **Step 11: Write the failing test for `filterEntries.ts`'s independently-hardcoded type**

`src/lib/filterEntries.ts`'s `FilterableEntry.code.type` is its own local literal union, not importing `GameCodeType` — this was found and fixed the same way when `'VN'` was added; it needs the same fix again. There's no behavior to unit-test here (it's a type-only change — a `'GC'`-coded entry that previously wouldn't even type-check as a valid `FilterableEntry` now does), so this step widens the type directly rather than following red-green TDD; verify via typecheck instead (Step 13).

Edit `src/lib/filterEntries.ts:12`:

```ts
export interface FilterableEntry {
  name: string
  kind: 'folder' | 'file'
  code: { type: 'RJ' | 'VJ' | 'ST' | 'VN' | 'GC'; value: string } | null
}
```

- [ ] **Step 12: Widen the matching local type in `filterEntries.test.ts`**

Edit `src/lib/filterEntries.test.ts:7`:

```ts
interface TestEntry {
  name: string
  kind: 'folder' | 'file'
  code: { type: 'RJ' | 'VJ' | 'ST' | 'VN' | 'GC'; value: string } | null
}
```

- [ ] **Step 13: Typecheck**

Run: `npm run typecheck`
Expected: no new errors. This step deliberately touches `GameCodeType`/`GameCodeSchema`, the two most widely-consumed types in the codebase — confirms nothing downstream (e.g. a `switch` on `GameCodeType` with no `default`) breaks, and confirms Steps 11-12's type-only changes are both necessary and sufficient (no other file fails to typecheck).

- [ ] **Step 14: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 15: Commit**

```bash
git add shared/types/scanner.ts shared/types/ipc.ts electron/main/scanner/codeRecognition.ts electron/main/scanner/codeRecognition.test.ts src/pages/DlsiteSearch/parseCodeInput.ts src/pages/DlsiteSearch/parseCodeInput.test.ts src/lib/filterEntries.ts src/lib/filterEntries.test.ts
git commit -m "$(cat <<'EOF'
feat: recognize GC (getchu) codes alongside RJ/VJ/ST/VN

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `buildExternalUrl.ts` — open a GC entry's getchu.com page

**Files:**
- Modify: `electron/main/shell/buildExternalUrl.ts`
- Modify: `electron/main/shell/buildExternalUrl.test.ts`

**Interfaces:**
- Consumes: `GameCode` (Task 1's widened `GameCodeType`).
- Produces: nothing consumed by later tasks — this is a leaf.

**Current file content:**

```ts
import type { GameCode } from '../../../shared/types/scanner'

// RJ and VJ are different DLsite work categories with different URL path
// segments (maniax vs pro) - confirmed against a real VJ listing.
export function buildExternalUrl(code: GameCode): string {
  if (code.type === 'ST') {
    const numericId = code.value.slice(2)
    return `https://store.steampowered.com/app/${numericId}`
  }
  if (code.type === 'VN') {
    const numericId = code.value.slice(2)
    return `https://vndb.org/v${numericId}`
  }
  const category = code.type === 'VJ' ? 'pro' : 'maniax'
  return `https://www.dlsite.com/${category}/work/=/product_id/${code.value}.html`
}
```

- [ ] **Step 1: Write the failing test**

Add to `electron/main/shell/buildExternalUrl.test.ts` (after the existing VN test):

```ts
  it('builds a getchu.com URL for a GC code, stripping the GC prefix', () => {
    expect(buildExternalUrl({ type: 'GC', value: 'GC1370494' })).toBe(
      'https://www.getchu.com/soft.phtml?id=1370494'
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/main/shell/buildExternalUrl.test.ts`
Expected: FAIL — a `'GC'`-typed code currently falls through to the DLsite branch, producing `https://www.dlsite.com/maniax/work/=/product_id/GC1370494.html`.

- [ ] **Step 3: Add the GC branch**

Edit `electron/main/shell/buildExternalUrl.ts`:

```ts
import type { GameCode } from '../../../shared/types/scanner'

// RJ and VJ are different DLsite work categories with different URL path
// segments (maniax vs pro) - confirmed against a real VJ listing.
export function buildExternalUrl(code: GameCode): string {
  if (code.type === 'ST') {
    const numericId = code.value.slice(2)
    return `https://store.steampowered.com/app/${numericId}`
  }
  if (code.type === 'VN') {
    const numericId = code.value.slice(2)
    return `https://vndb.org/v${numericId}`
  }
  if (code.type === 'GC') {
    const numericId = code.value.slice(2)
    return `https://www.getchu.com/soft.phtml?id=${numericId}`
  }
  const category = code.type === 'VJ' ? 'pro' : 'maniax'
  return `https://www.dlsite.com/${category}/work/=/product_id/${code.value}.html`
}
```

`soft.phtml?id=<digits>` is the real, confirmed URL shape getchu.com's own category/ranking pages link to for an individual product (it 301-redirects to a canonical `/item/<digits>/` internally, which is fine for an externally-opened link — browsers follow redirects transparently).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/main/shell/buildExternalUrl.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/main/shell/buildExternalUrl.ts electron/main/shell/buildExternalUrl.test.ts
git commit -m "$(cat <<'EOF'
feat: open a GC-coded entry's getchu.com page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `getchuParser.ts` — crawl a GC code's metadata by scraping the real page

**This task is different in kind from every other task in this plan.** Tasks 1-2 and every task in every prior sub-project this session shipped with pre-verified, literal code because the target (this app's own codebase, or a JSON API with a confirmed response shape) was fully knowable in advance. getchu.com's real HTML markup was never directly observed during this plan's design — the tool available then only returns AI-summarized page content. **You must capture real markup yourself, from a real HTTP request, before writing any selector.** Do not guess at CSS class names or invent plausible-looking markup — if you find yourself doing that, stop and use the investigation steps below instead.

**Files:**
- Create: `electron/main/metadata/getchuParser.ts`
- Create: `electron/main/metadata/__fixtures__/getchu-work-page.html` (captured by you, Step 1)
- Create: `electron/main/metadata/getchuParser.test.ts`
- Modify: `electron/main/metadata/crawlGameMetadata.ts`

**Interfaces:**
- Consumes: `GameCode` (Task 1). `CrawledGameMetadata` (imported from `dlsiteParser.ts`, unchanged — this task does not modify that file).
- Produces: `crawlGetchu(code: GameCode): Promise<CrawledGameMetadata | null>` (consumed by `crawlGameMetadata.ts`'s dispatch, this task's own Step 5). `parseGetchuWorkPage(html: string): CrawledGameMetadata | null` exported for this task's own fixture-based test.

- [ ] **Step 1: Investigate the real page — capture a fixture, determine the real encoding**

Fetch this real, confirmed-working PC-game product page (found during design; a genuine visual novel, developer "sprite", not a placeholder):

```bash
curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0" -L -D headers.txt "https://www.getchu.com/soft.phtml?id=1366941" -o electron/main/metadata/__fixtures__/getchu-work-page.html
```

(`-L` follows the redirect to `/item/1366941/`; `-D headers.txt` saves response headers separately so you can inspect `Content-Type` without it polluting the HTML fixture. If `curl` isn't available in your environment, write and run a small one-off Node script using `fetch()` instead — save the response headers and body the same way, then delete the script once you're done; it's not part of the deliverable.)

Inspect `headers.txt`'s `Content-Type` header AND the fixture HTML's own `<meta charset=...>` tag (search the file directly, e.g. `grep -i charset electron/main/metadata/__fixtures__/getchu-work-page.html`). Determine whether the real encoding is UTF-8 or something else (Shift_JIS/EUC-JP were suspected but NOT confirmed during design — this step is what actually confirms or rules it out).

- **If UTF-8:** no special handling needed: `await response.text()` is correct, matching the DLsite/Steam parsers exactly.
- **If NOT UTF-8** (e.g. `Shift_JIS`): the fetch must decode raw bytes explicitly rather than call `response.text()` (which assumes UTF-8 and would corrupt non-UTF-8 bytes into garbled text). Use:
  ```ts
  const buffer = await response.arrayBuffer()
  const html = new TextDecoder('shift_jis').decode(buffer) // or the real charset you found
  ```
  Node ships full ICU by default (since Node 13), so `TextDecoder` should support common Japanese encodings without adding a new dependency. If `TextDecoder` throws a `RangeError: Invalid encoding` for the exact charset label you found, try the encoding's other common aliases (e.g. `shift_jis`, `shift-jis`, `sjis`, `windows-31j` are all names for essentially the same encoding) before concluding a new dependency is genuinely needed — if it is, stop and report BLOCKED/NEEDS_CONTEXT rather than silently adding one, since every other parser in this app has zero encoding-related dependencies.

Record which case applied in your final report — later steps below assume you'll write the actual fetch code to match what you found here, not before.

- [ ] **Step 2: Investigate getchu's "not found" signal**

Fetch a numeric id essentially guaranteed not to correspond to any real product (e.g. `id=1` or `id=999999999`):

```bash
curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0" -L -o /dev/null -w "%{http_code}\n" "https://www.getchu.com/soft.phtml?id=1"
```

- **If this returns a non-2xx status** (e.g. 404): the existing `if (!response.ok) return null` pattern (identical in `crawlDlsite`/`crawlSteam` today) already covers this case at the fetch layer — no separate "not-found HTML shape" needs modeling in the parser itself. Note this in your report and skip capturing a second fixture.
- **If this returns 200 with some kind of "not found"/error page body:** capture that response too (same `curl` pattern as Step 1) as `electron/main/metadata/__fixtures__/getchu-not-found-page.html`, and inspect it to find a reliable signal your parser can use to return `null` for it (mirroring `dlsiteParser.ts`'s own approach: `#work_name`'s absence signals DLsite's own delisted-work error page — find getchu's real equivalent, whatever it turns out to be, don't assume it matches DLsite's).

- [ ] **Step 3: Inspect the real fixture, identify where each field lives**

Open `electron/main/metadata/__fixtures__/getchu-work-page.html` directly and search it for:
- The work's title (real value, for id 1366941: title contains "蒼の彼方のフォーリズム" per design-time investigation — confirm this survived your fetch/decode correctly, especially if Step 1 required Shift-JIS decoding, since a decoding bug would show up here as garbled Japanese text in the fixture itself).
- The developer/brand name (design-time investigation found "sprite" — confirm).
- The release date's exact real text/format as it appears on the page (do NOT assume it matches DLsite's `X年Y月Z日` format — Steam's own date format is completely different from DLsite's despite both being real sites this app already scrapes, so there's no reason to assume getchu matches either).
- Genre/tag text (design-time investigation found a single tag "ミニ漫画" on an unrelated non-game item, and "ロードムービーシミュレーション" on the real PC-game page id 1366941 — confirm what you actually see, and whether it's one tag or several, comma/slash/other-separated).
- Whether a `<meta property="og:image">` tag exists (both DLsite's and Steam's parsers already use this as their cover-image source, since Open Graph tags are a common convention many sites include regardless of otherwise-different markup) — if present with a real image URL, prefer it; if absent, find the real `<img>` element or attribute holding the cover image (design-time investigation found paths like `/brandnew/1366941/rc1366941package.jpg` referenced on the page, though not confirmed as the exact attribute to select).

Identify real, stable anchors for each (an `id` attribute, a distinctive label string like DLsite's `販売日`/`ジャンル` row labels that `parseDlsiteWorkPage` matches on, or — if nothing else is stable — a resilient regex over a scoped region of the raw HTML, matching `dlsiteSearchParser.ts`'s own precedent of preferring pattern-matching over brittle exact selectors when the underlying site's markup can't be trusted to stay put).

- [ ] **Step 4: Write the failing tests, then implement `parseGetchuWorkPage`**

Write `electron/main/metadata/getchuParser.test.ts` first, asserting `parseGetchuWorkPage` against your real fixture returns the REAL values you found in Step 3 (not placeholder/guessed values) — follow `dlsiteParser.test.ts`'s exact shape:

```ts
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseGetchuWorkPage } from './getchuParser'

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, '__fixtures__', name), 'utf-8')
}

describe('parseGetchuWorkPage', () => {
  it('extracts title, circle, release date, genres, and cover image from a real work page', async () => {
    const html = await loadFixture('getchu-work-page.html')
    expect(parseGetchuWorkPage(html)).toEqual({
      title: /* the REAL title text you confirmed in Step 3 */,
      circle: /* the REAL developer/brand you confirmed */,
      releaseDate: /* 'YYYY-MM-DD', parsed from whatever real format you found */,
      genres: [/* the REAL genre/tag(s) you confirmed */],
      coverImageUrl: /* the REAL cover image URL you confirmed, or null if none exists */,
    })
  })
})
```

If Step 2 captured a second "not found" fixture, add a second test mirroring `dlsiteParser.test.ts`'s own not-found case:

```ts
  it('returns null for a delisted/nonexistent-work page', async () => {
    const html = await loadFixture('getchu-not-found-page.html')
    expect(parseGetchuWorkPage(html)).toBeNull()
  })
```

Run: `npx vitest run electron/main/metadata/getchuParser.test.ts`
Expected: FAIL — `./getchuParser` does not exist yet.

Implement `electron/main/metadata/getchuParser.ts` using `cheerio`, matching `CrawledGameMetadata`'s contract exactly (every field but `coverImageUrl` non-optional, defaulting to `''`/`[]`, never `undefined`) and the real selectors/anchors you identified in Step 3. The exact selector code cannot be specified here since it depends on what Step 3 actually found — write it now, following `dlsiteParser.ts`'s and `dlsiteSearchParser.ts`'s established shape (a single exported `parseGetchuWorkPage(html: string): CrawledGameMetadata | null` function, `cheerio.load(html)`, null-return on the not-found signal from Step 2, non-optional-field defaults).

Run: `npx vitest run electron/main/metadata/getchuParser.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `crawlGetchu` into `crawlGameMetadata.ts`'s dispatch**

Edit `electron/main/metadata/crawlGameMetadata.ts` — add the import, add a new `crawlGetchu` function, and extend the dispatch. Every existing line in this file (constants, `crawlDlsite`, `crawlSteam`, the age-check cookie, the `VN` branch) is unchanged except where shown:

```ts
import { parseDlsiteWorkPage, type CrawledGameMetadata } from './dlsiteParser'
import { parseSteamStorePage } from './steamParser'
import { crawlVndb } from './vndbClient'
import { parseGetchuWorkPage } from './getchuParser'
import type { GameCode } from '../../../shared/types/scanner'
```

Add `crawlGetchu`, matching `crawlDlsite`'s shape (fetch, check `response.ok`, decode per what Task 3 Step 1 found, parse, return) — this literal code assumes UTF-8 (`response.text()`); if Step 1 found a different real encoding, use the `arrayBuffer()` + `TextDecoder` pattern from Step 1 instead, adjusted for the real charset:

```ts
async function crawlGetchu(code: GameCode): Promise<CrawledGameMetadata | null> {
  const numericId = code.value.slice(2)
  const response = await fetch(`https://www.getchu.com/soft.phtml?id=${numericId}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return null
  return parseGetchuWorkPage(await response.text())
}
```

Extend the dispatch:

```ts
export async function crawlGameMetadata(code: GameCode): Promise<CrawledGameMetadata | null> {
  if (code.type === 'ST') return crawlSteam(code)
  if (code.type === 'VN') return crawlVndb(code)
  if (code.type === 'GC') return crawlGetchu(code)
  return crawlDlsite(code)
}
```

- [ ] **Step 6: Run the full metadata test suite**

Run: `npx vitest run electron/main/metadata`
Expected: PASS — all existing DLsite/Steam/VNDB/bulk-crawl-queue tests plus the new `getchuParser` test(s), no regressions.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 9: Commit**

```bash
git add electron/main/metadata/getchuParser.ts electron/main/metadata/getchuParser.test.ts electron/main/metadata/__fixtures__/getchu-work-page.html electron/main/metadata/crawlGameMetadata.ts
git commit -m "$(cat <<'EOF'
feat: crawl GC-coded entries' metadata from getchu.com

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

If Step 2 captured a not-found fixture, also stage it:

```bash
git add electron/main/metadata/__fixtures__/getchu-not-found-page.html
```

**Note (no action needed):** `METADATA_CRAWL_AND_SAVE`'s IPC handler and the bulk-crawl-missing queue both already dispatch generically through `crawlGameMetadata`, so this task alone makes crawl+save, cover-image caching, and bulk-crawl-missing all work for GC-coded entries automatically, mirroring exactly how VN's own addition worked — zero handler-level changes needed.

## Live Verification (after all tasks)

Search-page changes are explicitly out of scope for this plan, so there's no new UI surface to click through. Verify via the existing manual-link flow: in `npm run dev`, use the existing "코드 연동" (code link) dialog on any entry to manually link a `GC1366941` code, confirm metadata crawls successfully (title/developer/release date/genre/cover all populate, matching the real fixture captured in Task 3), and confirm "브라우저에서 열기"/open-externally opens `https://www.getchu.com/soft.phtml?id=1366941` correctly. Also verify a folder/file literally named with a `GC`-prefixed code auto-recognizes it during a scan.
