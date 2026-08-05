# VNDB Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `'VN'` as a fourth `GameCodeType`, recognized the same way `'RJ'`/`'VJ'`/`'ST'` already are, crawled via VNDB's public Kana JSON API (no HTML scraping), openable via its VNDB page, and discoverable through a title-search page with a DLsite/VNDB source toggle, replacing the existing DLsite-only search page rather than adding a second sidebar entry alongside it.

**Architecture:** Widen the shared `GameCode` union and its zod schema first (Task 1), since every later task depends on `'VN'` being a valid `GameCodeType`. Then extend the three per-source-type surfaces that already have an `'ST'` (Steam) branch to follow as the precedent for a `'VN'` branch: `buildExternalUrl.ts` (Task 2), `crawlGameMetadata.ts`'s dispatch (Task 3, via a new `vndbClient.ts`). Task 4 adds the new title-search IPC channel (also backed by `vndbClient.ts`). Task 5 merges the existing `DlsiteSearchPage.tsx` and the new VNDB search capability into one renamed `GameSearchPage.tsx` with a source toggle — decided after pre-flight review surfaced that a second near-duplicate page would both clutter the Sidebar and fail a DRY-quality gate; the user chose the merge over keeping two separate pages.

**Tech Stack:** Electron + TypeScript strict, zod (IPC schemas), Vitest (fixture-based unit tests, no live network calls), React 19 + TanStack Router/Query (renderer), no `cheerio` needed for this feature (VNDB is JSON, not HTML).

## Global Constraints

- VNDB only. getchu.com is explicitly out of scope (no public API; deferred).
- `CrawledGameMetadata` (`electron/main/metadata/dlsiteParser.ts:1-8`) is a hard contract: `{title: string, circle: string, releaseDate: string, genres: string[], coverImageUrl: string | null}`. Every field except `coverImageUrl` is a **non-optional string/array** — default to `''`/`[]`, never `undefined` and never `null` (this corrects the committed spec's draft wording, which said `circle` was `undefined` when absent and `releaseDate` could be `null` — neither compiles against the real interface).
- `NETWORK_TIMEOUT_MS = 15_000` and `USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'` — same values as every other outbound fetch in this app (`crawlGameMetadata.ts`, `crawlDlsiteSearch.ts`). Declare them locally in the new file rather than importing from a sibling module — matches this codebase's existing precedent of `crawlDlsiteSearch.ts` duplicating its own `NETWORK_TIMEOUT_MS` rather than importing `crawlGameMetadata.ts`'s.
- A folder/file named `VN17 - Some Visual Novel` is recognized as `{type: 'VN', value: 'VN17'}` — the two-letter prefix is this app's own convention, not VNDB's. Every place that talks to VNDB's real API strips it: `code.value.slice(2)` gives the digits, prefixed with `v` gives VNDB's own ID (`v17`).
- No test for the actual `fetch()` call, the new search IPC handler, or the new search page — matches this app's established no-live-network-test, no-component-test-infrastructure precedent. Pure mapping/parsing logic gets a real fixture-based unit test; live verification happens via `npm run dev`.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Widen `GameCodeType` to include `'VN'` (type, schema, both regexes)

**Files:**
- Modify: `shared/types/scanner.ts:1`
- Modify: `shared/types/ipc.ts:196-199`
- Modify: `electron/main/scanner/codeRecognition.ts`
- Modify: `electron/main/scanner/codeRecognition.test.ts`
- Modify: `src/pages/DlsiteSearch/parseCodeInput.ts`
- Modify: `src/pages/DlsiteSearch/parseCodeInput.test.ts`

**Interfaces:**
- Produces: `GameCodeType = 'RJ' | 'VJ' | 'ST' | 'VN'` (consumed by every later task). `GameCodeSchema` (zod, `shared/types/ipc.ts`) validates the same four values — every IPC call carrying a `GameCode` (`crawlAndSave`, `get`, `openExternal`, etc.) runs its payload through this schema, so a VN-coded IPC call would throw a `ZodError` at runtime if this schema isn't updated too. This is not mentioned in the committed spec (which only discusses the two filename/input regexes) — found by reading `shared/types/ipc.ts` directly during planning; it is just as required as the two regexes.

- [ ] **Step 1: Widen the `GameCodeType` union**

Edit `shared/types/scanner.ts:1`:

```ts
export type GameCodeType = 'RJ' | 'VJ' | 'ST' | 'VN'
```

- [ ] **Step 2: Widen `GameCodeSchema`'s zod enum**

Edit `shared/types/ipc.ts:196-199`:

```ts
export const GameCodeSchema = z.object({
  type: z.enum(['RJ', 'VJ', 'ST', 'VN']),
  value: z.string(),
})
```

- [ ] **Step 3: Write the failing tests for `extractCode`**

Add to `electron/main/scanner/codeRecognition.test.ts` (inside the existing `describe('extractCode', ...)` block, after the existing `'recognizes an ST (Steam) code'` test):

```ts
  it('recognizes a VN (VNDB) code', () => {
    expect(extractCode('VN17 - Steins;Gate')).toEqual({ type: 'VN', value: 'VN17' })
  })
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run electron/main/scanner/codeRecognition.test.ts`
Expected: FAIL — `extractCode('VN17 - Steins;Gate')` returns `null` (current regex only matches `RJ|VJ|ST`).

- [ ] **Step 5: Widen `CODE_PATTERN` in `codeRecognition.ts`**

Edit `electron/main/scanner/codeRecognition.ts`:

```ts
const CODE_PATTERN = /(?<![A-Za-z0-9])(RJ|VJ|ST|VN)(\d+)(?![0-9])/i
```

(Only the alternation inside the first capture group changes; `extractCode`'s body is untouched — it already does `match[1].toUpperCase() as GameCodeType`, which now accepts `'VN'` because of Task 1 Step 1.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run electron/main/scanner/codeRecognition.test.ts`
Expected: PASS (12 tests, including the new one).

- [ ] **Step 7: Write the failing test for `parseCodeInput`**

Add to `src/pages/DlsiteSearch/parseCodeInput.test.ts` (inside the existing `describe('parseCodeInput', ...)` block, after the existing case-insensitive RJ test):

```ts
  it('recognizes a VN code typed directly', () => {
    expect(parseCodeInput('VN17')).toEqual({ type: 'VN', value: 'VN17' })
  })
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npx vitest run src/pages/DlsiteSearch/parseCodeInput.test.ts`
Expected: FAIL — `parseCodeInput('VN17')` returns `null`.

- [ ] **Step 9: Widen `CODE_PATTERN` in `parseCodeInput.ts`**

Edit `src/pages/DlsiteSearch/parseCodeInput.ts`:

```ts
const CODE_PATTERN = /^(RJ|VJ|ST|VN)(\d+)$/i
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run src/pages/DlsiteSearch/parseCodeInput.test.ts`
Expected: PASS (3 tests, including the new one).

- [ ] **Step 11: Typecheck**

Run: `npm run typecheck` (or the project's equivalent — confirm via `package.json` if the exact script name differs)
Expected: no new errors. This step deliberately touches `GameCodeType`/`GameCodeSchema`, the two most widely-consumed types in the codebase — a typecheck pass here is the cheapest way to confirm nothing downstream (e.g. a `switch` on `GameCodeType` with no `default`) breaks before later tasks build on top.

- [ ] **Step 12: Commit**

```bash
git add shared/types/scanner.ts shared/types/ipc.ts electron/main/scanner/codeRecognition.ts electron/main/scanner/codeRecognition.test.ts src/pages/DlsiteSearch/parseCodeInput.ts src/pages/DlsiteSearch/parseCodeInput.test.ts
git commit -m "$(cat <<'EOF'
feat: recognize VN (VNDB) codes alongside RJ/VJ/ST

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `buildExternalUrl.ts` — open a VN entry's VNDB page

**Files:**
- Modify: `electron/main/shell/buildExternalUrl.ts`
- Modify: `electron/main/shell/buildExternalUrl.test.ts`

**Interfaces:**
- Consumes: `GameCode` (Task 1's widened `GameCodeType`).
- Produces: nothing new consumed by later tasks — this is a leaf.

**Current file content** (`electron/main/shell/buildExternalUrl.ts`):

```ts
import type { GameCode } from '../../../shared/types/scanner'

export function buildExternalUrl(code: GameCode): string {
  if (code.type === 'ST') {
    const numericId = code.value.slice(2)
    return `https://store.steampowered.com/app/${numericId}`
  }
  const category = code.type === 'VJ' ? 'pro' : 'maniax'
  return `https://www.dlsite.com/${category}/work/=/product_id/${code.value}.html`
}
```

- [ ] **Step 1: Write the failing test**

Add to `electron/main/shell/buildExternalUrl.test.ts` (after the existing ST test):

```ts
  it('builds a VNDB URL for a VN code, stripping the VN prefix', () => {
    expect(buildExternalUrl({ type: 'VN', value: 'VN17' })).toBe('https://vndb.org/v17')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/main/shell/buildExternalUrl.test.ts`
Expected: FAIL — a `'VN'`-typed code currently falls through to the DLsite branch, producing `https://www.dlsite.com/maniax/work/=/product_id/VN17.html`.

- [ ] **Step 3: Add the VN branch**

Edit `electron/main/shell/buildExternalUrl.ts`:

```ts
import type { GameCode } from '../../../shared/types/scanner'

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/main/shell/buildExternalUrl.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/main/shell/buildExternalUrl.ts electron/main/shell/buildExternalUrl.test.ts
git commit -m "$(cat <<'EOF'
feat: open a VN-coded entry's VNDB page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `vndbClient.ts` — crawl a VN code's metadata via VNDB's Kana API

**Files:**
- Create: `electron/main/metadata/vndbClient.ts`
- Create: `electron/main/metadata/__fixtures__/vndb-vn-response.json`
- Create: `electron/main/metadata/vndbClient.test.ts`
- Modify: `electron/main/metadata/crawlGameMetadata.ts`

**Interfaces:**
- Consumes: `GameCode` (Task 1). `CrawledGameMetadata` (imported from `dlsiteParser.ts`, unchanged — this task does not modify that file).
- Produces: `crawlVndb(code: GameCode): Promise<CrawledGameMetadata | null>` (consumed by `crawlGameMetadata.ts`'s dispatch, this task's own Step 6). `mapVnToMetadata` is exported for Task 3's own unit test only — not consumed by later tasks. Task 4 adds a *second* export, `searchVndb`, to this same file — Task 4 must not remove or rename anything this task creates.

- [ ] **Step 1: Create the fixture**

Create `electron/main/metadata/__fixtures__/vndb-vn-response.json` — a realistic single VNDB `/vn` record (the shape of one element of the API's `results` array, requested with `fields: "title, released, image.url, developers.name, tags.name, tags.rating"`):

```json
{
  "id": "v17",
  "title": "Steins;Gate",
  "released": "2009-10-15",
  "image": { "url": "https://t.vndb.org/cv/38/86738.jpg" },
  "developers": [{ "name": "Nitroplus" }],
  "tags": [
    { "name": "Time Travel", "rating": 3.0 },
    { "name": "Mad Scientist", "rating": 2.9 },
    { "name": "Protagonist", "rating": 2.8 },
    { "name": "Alternate History", "rating": 2.5 },
    { "name": "Tsundere", "rating": 2.0 },
    { "name": "Foreshadowing", "rating": 1.8 },
    { "name": "Memory Alteration", "rating": 1.5 },
    { "name": "Amnesia", "rating": 1.2 },
    { "name": "Female Antagonist", "rating": 1.0 },
    { "name": "Twins", "rating": 0.9 },
    { "name": "Nosebleed", "rating": 0.7 },
    { "name": "Loli", "rating": 0.5 }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

Create `electron/main/metadata/vndbClient.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mapVnToMetadata } from './vndbClient'

async function loadFixture(name: string): Promise<unknown> {
  const raw = await readFile(join(__dirname, '__fixtures__', name), 'utf-8')
  return JSON.parse(raw)
}

describe('mapVnToMetadata', () => {
  it('maps a realistic VNDB /vn response record to CrawledGameMetadata, capping genres at the top 10 tags by rating', async () => {
    const vn = await loadFixture('vndb-vn-response.json')
    expect(mapVnToMetadata(vn as Parameters<typeof mapVnToMetadata>[0])).toEqual({
      title: 'Steins;Gate',
      circle: 'Nitroplus',
      releaseDate: '2009-10-15',
      genres: [
        'Time Travel',
        'Mad Scientist',
        'Protagonist',
        'Alternate History',
        'Tsundere',
        'Foreshadowing',
        'Memory Alteration',
        'Amnesia',
        'Female Antagonist',
        'Twins',
      ],
      coverImageUrl: 'https://t.vndb.org/cv/38/86738.jpg',
    })
  })

  it('defaults circle to empty string when no developer is listed', () => {
    expect(
      mapVnToMetadata({ id: 'v1', title: 'Untitled', released: null, image: null, developers: [], tags: [] })
    ).toEqual({
      title: 'Untitled',
      circle: '',
      releaseDate: '',
      genres: [],
      coverImageUrl: null,
    })
  })

  it('defaults releaseDate to empty string for a TBA/unreleased title (VNDB returns null)', () => {
    const result = mapVnToMetadata({
      id: 'v2',
      title: 'Unreleased VN',
      released: null,
      image: null,
      developers: [{ name: 'Some Circle' }],
      tags: [],
    })
    expect(result.releaseDate).toBe('')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run electron/main/metadata/vndbClient.test.ts`
Expected: FAIL — `./vndbClient` does not exist yet.

- [ ] **Step 4: Create `vndbClient.ts` with `mapVnToMetadata` and `crawlVndb`**

Create `electron/main/metadata/vndbClient.ts`:

```ts
import type { CrawledGameMetadata } from './dlsiteParser'
import type { GameCode } from '../../../shared/types/scanner'

// Without this, an unresponsive api.vndb.org leaves this fetch pending
// forever, matching crawlGameMetadata.ts's own reasoning for the same
// constant on the DLsite/Steam paths.
const NETWORK_TIMEOUT_MS = 15_000

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'

const VNDB_API_URL = 'https://api.vndb.org/kana/vn'

interface VndbApiVn {
  id: string
  title: string
  released: string | null
  image: { url: string } | null
  developers: { name: string }[]
  tags: { name: string; rating: number }[]
}

interface VndbApiResponse {
  results: VndbApiVn[]
}

// VNDB attaches hundreds of tags with a relevance `rating` per VN -
// DLsite/Steam's own `genres` are a short curated list, so this caps the
// count to keep the display comparable rather than dumping VNDB's full tag
// cloud into a field designed for a handful of short labels.
const MAX_GENRES = 10

// Pure field mapping, exported for the fixture-based unit test above - no
// fetch involved. `developers[0]?.name` / `released` default to '' (never
// undefined/null) to match CrawledGameMetadata's own non-optional-string
// contract (dlsiteParser.ts) exactly, the same "empty string on
// absence/failure" convention the DLsite/Steam parsers already use.
export function mapVnToMetadata(vn: VndbApiVn): CrawledGameMetadata {
  const topTags = [...vn.tags].sort((a, b) => b.rating - a.rating).slice(0, MAX_GENRES)
  return {
    title: vn.title,
    circle: vn.developers[0]?.name ?? '',
    releaseDate: vn.released ?? '',
    genres: topTags.map((tag) => tag.name),
    coverImageUrl: vn.image?.url ?? null,
  }
}

// code.value is this app's own two-letter-prefixed convention (e.g. "VN17")
// - VNDB's real ID drops the extra letter ("v17").
function toVndbId(code: GameCode): string {
  return `v${code.value.slice(2)}`
}

export async function crawlVndb(code: GameCode): Promise<CrawledGameMetadata | null> {
  const response = await fetch(VNDB_API_URL, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      filters: ['id', '=', toVndbId(code)],
      fields: 'title, released, image.url, developers.name, tags.name, tags.rating',
    }),
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return null

  const data = (await response.json()) as VndbApiResponse
  const vn = data.results[0]
  return vn ? mapVnToMetadata(vn) : null
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run electron/main/metadata/vndbClient.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Wire `crawlVndb` into `crawlGameMetadata.ts`'s dispatch**

Edit `electron/main/metadata/crawlGameMetadata.ts` — add the import and extend the final dispatch line only; every other line in this file (constants, `crawlDlsite`, `crawlSteam`, the age-check cookie) is unchanged:

```ts
import { parseDlsiteWorkPage, type CrawledGameMetadata } from './dlsiteParser'
import { parseSteamStorePage } from './steamParser'
import { crawlVndb } from './vndbClient'
import type { GameCode } from '../../../shared/types/scanner'
```

And change:

```ts
export async function crawlGameMetadata(code: GameCode): Promise<CrawledGameMetadata | null> {
  return code.type === 'ST' ? crawlSteam(code) : crawlDlsite(code)
}
```

to:

```ts
export async function crawlGameMetadata(code: GameCode): Promise<CrawledGameMetadata | null> {
  if (code.type === 'ST') return crawlSteam(code)
  if (code.type === 'VN') return crawlVndb(code)
  return crawlDlsite(code)
}
```

- [ ] **Step 7: Run the full metadata test suite**

Run: `npx vitest run electron/main/metadata`
Expected: PASS — all existing DLsite/Steam/bulk-crawl-queue tests plus the 3 new `vndbClient` tests, no regressions.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add electron/main/metadata/vndbClient.ts electron/main/metadata/vndbClient.test.ts electron/main/metadata/__fixtures__/vndb-vn-response.json electron/main/metadata/crawlGameMetadata.ts
git commit -m "$(cat <<'EOF'
feat: crawl VN-coded entries' metadata from VNDB's Kana API

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

**Note (no action needed):** `METADATA_CRAWL_AND_SAVE`'s IPC handler (`electron/main/ipc/metadataHandlers.ts:63-78`) already calls `crawlGameMetadata(code)` generically with no per-type branching, and the bulk-crawl-missing queue (`bulkCrawlQueue.ts`) calls the same dispatch per code with no type-specific wiring either. This task alone makes crawl+save, cover-image caching (`cacheCoverImage.ts`, called by the handler, unchanged), and bulk-crawl-missing all work for `VN`-coded entries — mirroring exactly how Steam's addition worked, with zero handler-level changes.

---

### Task 4: VNDB title search — IPC channel, handler, preload method

**Files:**
- Modify: `electron/main/metadata/vndbClient.ts` (adds `searchVndb`, `VndbSearchResult`, alongside Task 3's `crawlVndb`/`mapVnToMetadata` — does not remove anything)
- Modify: `shared/types/ipc.ts`
- Modify: `electron/main/ipc/metadataHandlers.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Consumes: `IPC_CHANNELS`, `GameCodeSchema` (Task 1's widened version).
- Produces: `IPC_CHANNELS.METADATA_SEARCH_VNDB`, `SearchVndbRequestSchema`, `VndbSearchResultDto` (all in `shared/types/ipc.ts`), `window.api.metadata.searchVndb(query: string): Promise<VndbSearchResultDto[]>` (preload) — all consumed by Task 5's renderer hook.

- [ ] **Step 1: Add `IPC_CHANNELS.METADATA_SEARCH_VNDB`**

Edit `shared/types/ipc.ts` — insert immediately after the existing `METADATA_SEARCH_DLSITE: 'metadata:search-dlsite',` line:

```ts
  METADATA_SEARCH_VNDB: 'metadata:search-vndb',
```

- [ ] **Step 2: Add `SearchVndbRequestSchema` and `VndbSearchResultDto`**

Edit `shared/types/ipc.ts` — insert immediately after the existing `DlsiteSearchResultDto` interface (after line 239, before `CrawlMissingMetadataRequestSchema`):

```ts
export const SearchVndbRequestSchema = z.object({
  query: z.string(),
})
export type SearchVndbRequest = z.infer<typeof SearchVndbRequestSchema>

export interface VndbSearchResultDto {
  code: z.infer<typeof GameCodeSchema>
  title: string
  thumbnailUrl: string | null
}
```

- [ ] **Step 3: Add `searchVndb` to `vndbClient.ts`**

Edit `electron/main/metadata/vndbClient.ts` — add these exports (the file already has `NETWORK_TIMEOUT_MS`, `USER_AGENT`, `VNDB_API_URL`, and the `GameCode` import from Task 3; reuse them, do not redeclare):

```ts
export interface VndbSearchResult {
  code: GameCode
  title: string
  thumbnailUrl: string | null
}

interface VndbSearchApiVn {
  id: string
  title: string
  image: { url: string } | null
}

interface VndbSearchApiResponse {
  results: VndbSearchApiVn[]
}

// vn.id is VNDB's own "v17" shape - reattach this app's VN-prefix
// convention (the inverse of toVndbId above) so the result's code round-
// trips through parseCodeInput/extractCode/buildExternalUrl identically to
// a code recognized from a filename.
export function mapVnToSearchResult(vn: VndbSearchApiVn): VndbSearchResult {
  return {
    code: { type: 'VN', value: `VN${vn.id.slice(1)}` },
    title: vn.title,
    thumbnailUrl: vn.image?.url ?? null,
  }
}

export async function searchVndb(query: string): Promise<VndbSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed === '') return []

  const response = await fetch(VNDB_API_URL, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      filters: ['search', '=', trimmed],
      fields: 'title, image.url',
    }),
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return []

  const data = (await response.json()) as VndbSearchApiResponse
  return data.results.map(mapVnToSearchResult)
}
```

- [ ] **Step 4: Add the IPC handler**

Edit `electron/main/ipc/metadataHandlers.ts` — add `SearchVndbRequestSchema` to the existing import from `'../../../shared/types/ipc'`, add `searchVndb` to the existing import from `'../metadata/vndbClient'` (new import line, since Task 3 never imported from `vndbClient.ts` in this file):

```ts
import {
  CrawlAndSaveMetadataRequestSchema,
  GetMetadataRequestSchema,
  GetManyMetadataRequestSchema,
  GetCoverImageRequestSchema,
  SearchDlsiteRequestSchema,
  SearchVndbRequestSchema,
  CrawlMissingMetadataRequestSchema,
  IPC_CHANNELS,
  type GameMetadataDto,
} from '../../../shared/types/ipc'
import { crawlGameMetadata } from '../metadata/crawlGameMetadata'
import { crawlDlsiteSearch } from '../metadata/crawlDlsiteSearch'
import { searchVndb } from '../metadata/vndbClient'
```

Then add the handler immediately after the existing `METADATA_SEARCH_DLSITE` handler (after line 92, before `METADATA_CRAWL_MISSING`):

```ts
  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH_VNDB, async (_event, payload: unknown) => {
    const { query } = SearchVndbRequestSchema.parse(payload)
    return searchVndb(query)
  })
```

- [ ] **Step 5: Add the preload method**

Edit `electron/preload/index.ts` — add `VndbSearchResultDto` to the existing type-only import from `'../../shared/types/ipc'`. `VersionMismatchDto` currently sits last in that block; insert `VndbSearchResultDto` immediately after it:

```ts
  type UpdateStatus,
  type VersionMismatchDto,
  type VndbSearchResultDto,
} from '../../shared/types/ipc'
```

Then add the method inside the existing `metadata: { ... }` block, immediately after `searchDlsite`:

```ts
    searchDlsite: (query: string): Promise<DlsiteSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH_DLSITE, { query }),
    searchVndb: (query: string): Promise<VndbSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH_VNDB, { query }),
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions (this task adds no new automated tests of its own — the pure logic it introduces, `mapVnToSearchResult`, is exercised indirectly by `searchVndb`'s existing sibling `mapVnToMetadata` tests' coverage of the same file; per Global Constraints, the IPC handler/preload wiring itself is untested, matching this app's established precedent for handler-level code).

- [ ] **Step 8: Commit**

```bash
git add electron/main/metadata/vndbClient.ts shared/types/ipc.ts electron/main/ipc/metadataHandlers.ts electron/preload/index.ts
git commit -m "$(cat <<'EOF'
feat: add VNDB title search IPC channel and preload method

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `GameSearchPage.tsx` — merge DLsite+VNDB search into one page with a source toggle

**Design correction (pre-flight):** the original draft of this task created a second, near-verbatim-duplicate page (`VndbSearchPage.tsx`, ~150 lines mirroring `DlsiteSearchPage.tsx`) with its own Sidebar entry. Presented to the user as a pre-flight conflict — a task reviewer would very likely flag the duplication, and a second sidebar entry was also unwanted UI clutter. The user chose to merge instead: one page, one Sidebar entry, a small DLsite/VNDB toggle inside the page that decides which API a free-text title search hits. `parseCodeInput.ts`/`parseCodeInput.test.ts` stay in `src/pages/DlsiteSearch/` unmoved — 4 other files already import it cross-folder from there (`CodeLinkSection.tsx`, `LinkCodeDialog.tsx`, `SavesPage.tsx`, `RecentlyPlayedPage.tsx`), so relocating it would ripple into files this feature has no reason to touch. Only the page component itself moves out, to a new `GameSearchPage.tsx` under a new `src/pages/GameSearch/` folder — a neutral name, since the page is no longer DLsite-only.

**Files:**
- Modify: `src/services/metadataService.ts`
- Delete: `src/pages/DlsiteSearch/DlsiteSearchPage.tsx`
- Create: `src/pages/GameSearch/GameSearchPage.tsx`
- Modify: `src/router.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `window.api.metadata.searchVndb` (Task 4), `useCrawlGameMetadata`/`useGameMetadata`/`useGameCoverImage`/`useSearchDlsite` (existing, unchanged), `parseCodeInput` (Task 1's widened version, imported as `'../DlsiteSearch/parseCodeInput'` — a pasted code of any type, including `VN17`, resolves the same way regardless of which source tab is selected; the toggle only decides which API a free-text title search hits).
- Produces: nothing consumed by later tasks — this is the plan's final task.

- [ ] **Step 1: Add `useSearchVndb` to the renderer metadata service**

Edit `src/services/metadataService.ts` — add `VndbSearchResultDto` to the existing type-only import from `'../../shared/types/ipc'`:

```ts
import type { DlsiteSearchResultDto, GameMetadataDto, VndbSearchResultDto } from '../../shared/types/ipc'
```

Add the hook immediately after the existing `useSearchDlsite`:

```ts
export function useSearchVndb() {
  return useMutation({
    mutationFn: (query: string): Promise<VndbSearchResultDto[]> =>
      window.api.metadata.searchVndb(query),
  })
}
```

- [ ] **Step 2: Update translation keys (ko/ja/en)**

Edit `src/i18n/translations.ts`. Three changes per locale block: (a) rename the nav key (only `Sidebar.tsx` consumes it, confirmed by search — safe to rename outright, not add-alongside), (b) replace the 6 page-specific `dlsiteSearch.*` keys that only `DlsiteSearchPage.tsx` consumed (now deleted) with `gameSearch.*` equivalents, reworded to be source-neutral since one page now serves both, (c) leave `dlsiteSearch.searchError` and `dlsiteSearch.noResults` completely untouched — `src/pages/Explorer/FolderView.tsx` also reads these two specific keys for its own unrelated search flow, and their displayed text is already source-neutral wording (no "DLsite" appears in the strings themselves, only in the key name), so `GameSearchPage.tsx` reuses them as-is rather than duplicating equivalent text under a new name.

**`ko` block:** replace the existing `'nav.dlsiteSearch': 'DLsite 검색',` (line 14) with:

```ts
  'nav.gameSearch': '게임 검색',
```

Replace the existing 8-line block at lines 246-253 (`'dlsiteSearch.placeholder'` through `'dlsiteSearch.notFound'`) with:

```ts
  'gameSearch.placeholder': '식별코드 또는 작품 제목',
  'gameSearch.search': '검색',
  'gameSearch.backToResults': '검색 결과로 돌아가기',
  'gameSearch.searching': '검색하는 중...',
  'dlsiteSearch.searchError': '검색 중 오류가 발생했습니다.',
  'dlsiteSearch.noResults': '검색 결과가 없습니다.',
  'gameSearch.fetchingInfo': '정보를 가져오는 중...',
  'gameSearch.notFound': '작품을 찾을 수 없습니다.',
```

**`ja` block:** replace the existing `'nav.dlsiteSearch': 'DLsite検索',` (line 309) with:

```ts
  'nav.gameSearch': 'ゲーム検索',
```

Replace the existing 8-line block at lines 539-546 with:

```ts
  'gameSearch.placeholder': '識別コードまたは作品タイトル',
  'gameSearch.search': '検索',
  'gameSearch.backToResults': '検索結果に戻る',
  'gameSearch.searching': '検索中...',
  'dlsiteSearch.searchError': '検索中にエラーが発生しました。',
  'dlsiteSearch.noResults': '検索結果がありません。',
  'gameSearch.fetchingInfo': '情報を取得中...',
  'gameSearch.notFound': '作品が見つかりません。',
```

**`en` block** (`const en: Record<keyof typeof ko, string> = { ... }` — every key present in `ko` MUST also be present here, or the `Record<keyof typeof ko, string>` type annotation fails to compile): replace the existing `'nav.dlsiteSearch': 'DLsite Search',` (line 602) with:

```ts
  'nav.gameSearch': 'Game Search',
```

Replace the existing 8-line block at lines 833-840 with:

```ts
  'gameSearch.placeholder': 'Identifier code or title',
  'gameSearch.search': 'Search',
  'gameSearch.backToResults': 'Back to results',
  'gameSearch.searching': 'Searching...',
  'dlsiteSearch.searchError': 'An error occurred while searching.',
  'dlsiteSearch.noResults': 'No results found.',
  'gameSearch.fetchingInfo': 'Fetching info...',
  'gameSearch.notFound': 'Title not found.',
```

- [ ] **Step 3: Delete the old page, create the merged `GameSearchPage.tsx`**

Delete `src/pages/DlsiteSearch/DlsiteSearchPage.tsx` (its only other reference is the `router.tsx` import removed in Step 4 below).

Create `src/pages/GameSearch/GameSearchPage.tsx`:

```tsx
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import {
  useCrawlGameMetadata,
  useGameCoverImage,
  useGameMetadata,
  useSearchDlsite,
  useSearchVndb,
} from '../../services/metadataService'
import { IndeterminateProgressBar } from '../../components/ui/progress-bar'
import { parseCodeInput } from '../DlsiteSearch/parseCodeInput'
import { useTranslation } from '../../i18n/useTranslation'
import type { GameCode } from '../../../shared/types/scanner'
import type { DlsiteSearchResultDto, VndbSearchResultDto } from '../../../shared/types/ipc'

type SearchSource = 'dlsite' | 'vndb'
type SearchResult = DlsiteSearchResultDto | VndbSearchResultDto

export function GameSearchPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [source, setSource] = useState<SearchSource>('dlsite')
  const [activeCode, setActiveCode] = useState<GameCode | null>(null)

  const { data: metadata, isLoading } = useGameMetadata(activeCode)
  const crawlAndSave = useCrawlGameMetadata()
  const searchDlsite = useSearchDlsite()
  const searchVndb = useSearchVndb()
  const { data: coverImage } = useGameCoverImage(metadata?.coverImagePath ? activeCode : null)

  // Both mutations stay mounted (hooks can't be conditional) - only the one
  // matching the current toggle drives the UI below. Switching tabs
  // deliberately does not clear the other's data: returning to a
  // previously-searched tab shows its own last results again, like a cache,
  // instead of forcing a re-search.
  const activeSearch = source === 'dlsite' ? searchDlsite : searchVndb

  const selectResult = (result: SearchResult): void => {
    setActiveCode(result.code)
    crawlAndSave.mutate(result.code)
  }

  const handleSearch = (): void => {
    const trimmed = input.trim()
    if (trimmed === '') return

    // A direct code (RJ/VJ/ST/VN) resolves the same way regardless of which
    // tab is selected - the toggle only decides which API a free-text title
    // search hits.
    const code = parseCodeInput(trimmed)
    if (code) {
      searchDlsite.reset()
      searchVndb.reset()
      setActiveCode(code)
      crawlAndSave.mutate(code)
      return
    }

    setActiveCode(null)
    if (source === 'dlsite') {
      searchDlsite.mutate(trimmed)
    } else {
      searchVndb.mutate(trimmed)
    }
  }

  const showingResultsList = activeCode === null && activeSearch.data !== undefined

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex w-fit gap-1 rounded-md bg-muted p-1">
        <Button
          type="button"
          variant={source === 'dlsite' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={source === 'dlsite'}
          onClick={() => setSource('dlsite')}
        >
          DLsite
        </Button>
        <Button
          type="button"
          variant={source === 'vndb' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={source === 'vndb'}
          onClick={() => setSource('vndb')}
        >
          VNDB
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('gameSearch.placeholder')}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button onClick={handleSearch}>{t('gameSearch.search')}</Button>
      </div>

      {activeCode && activeSearch.data !== undefined && (
        <button
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => setActiveCode(null)}
        >
          <ArrowLeft className="h-3 w-3" />
          {t('gameSearch.backToResults')}
        </button>
      )}

      {activeSearch.isPending && (
        <div className="flex max-w-xs flex-col gap-1">
          <IndeterminateProgressBar />
          <p className="text-xs text-muted-foreground">{t('gameSearch.searching')}</p>
        </div>
      )}

      {activeSearch.isError && (
        <p className="text-sm text-muted-foreground">{t('dlsiteSearch.searchError')}</p>
      )}

      {showingResultsList && activeSearch.data!.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('dlsiteSearch.noResults')}</p>
      )}

      {showingResultsList && activeSearch.data!.length > 0 && (
        <div className="flex flex-col gap-1 overflow-auto">
          {activeSearch.data!.map((result) => (
            <button
              key={result.code.value}
              onClick={() => selectResult(result)}
              className="flex items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent"
            >
              <div className="h-16 w-12 shrink-0 overflow-hidden rounded bg-muted">
                {result.thumbnailUrl && (
                  <img
                    src={result.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                )}
              </div>
              <div className="flex flex-col gap-0.5 text-sm">
                <p className="font-medium">{result.title}</p>
                <p className="text-xs text-muted-foreground">{result.code.value}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {crawlAndSave.isPending && (
        <div className="flex max-w-xs flex-col gap-1">
          <IndeterminateProgressBar />
          <p className="text-xs text-muted-foreground">{t('gameSearch.fetchingInfo')}</p>
        </div>
      )}

      {activeCode && isLoading && (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      )}

      {activeCode && !isLoading && !metadata && (
        <p className="text-sm text-muted-foreground">{t('gameSearch.notFound')}</p>
      )}

      {metadata && (
        <div className="flex gap-4">
          <div className="h-56 w-40 shrink-0 overflow-hidden rounded bg-muted">
            {coverImage && (
              <img
                src={coverImage}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            )}
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <p className="text-base font-medium">{metadata.title}</p>
            <p className="text-muted-foreground">{metadata.circle}</p>
            <p className="text-muted-foreground">{metadata.releaseDate}</p>
            <p className="text-muted-foreground">{metadata.genres.join(', ')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire the route**

Edit `src/router.tsx` — replace the existing `DlsiteSearchPage` import with:

```ts
import { GameSearchPage } from './pages/GameSearch/GameSearchPage'
```

Replace the existing `dlsiteSearchRoute` definition with:

```ts
const gameSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/game-search',
  component: GameSearchPage,
})
```

Replace `dlsiteSearchRoute` with `gameSearchRoute` in `routeTree`'s children (same position):

```ts
const routeTree = rootRoute.addChildren([
  galleryRoute,
  listRoute,
  detailListRoute,
  explorerRoute,
  detailRoute,
  gameSearchRoute,
  favoritesRoute,
  recentlyPlayedRoute,
  mediaRoute,
  savesRoute,
  settingsRoute,
])
```

- [ ] **Step 5: Update the Sidebar nav item**

Edit `src/components/layout/Sidebar.tsx` — no import changes needed (`Search` is already imported and stays the icon for this entry). Replace the existing DLsite search entry in `navItems` (same position) with:

```ts
  { to: '/game-search', labelKey: 'nav.gameSearch', icon: Search },
```

So the full array reads:

```ts
const navItems = [
  { to: '/', labelKey: 'nav.gallery', icon: LayoutGrid },
  { to: '/list', labelKey: 'nav.list', icon: List },
  { to: '/detail-list', labelKey: 'nav.detailList', icon: Rows3 },
  { to: '/explorer', labelKey: 'nav.explorer', icon: FolderTree },
  { to: '/game-search', labelKey: 'nav.gameSearch', icon: Search },
  { to: '/favorites', labelKey: 'nav.favorites', icon: Heart },
  { to: '/recently-played', labelKey: 'nav.recentlyPlayed', icon: History },
  { to: '/media', labelKey: 'nav.media', icon: Music },
  { to: '/saves', labelKey: 'nav.saves', icon: Save },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
] as const satisfies { to: string; labelKey: TranslationKey; icon: unknown }[]
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no new errors. This step catches a missing `en` translation key (the `Record<keyof typeof ko, string>` annotation makes a missing key a compile error), any leftover reference to the deleted `DlsiteSearchPage`/`dlsiteSearchRoute`/`nav.dlsiteSearch`, and the `activeSearch` union type across `searchDlsite`/`searchVndb`.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions. This task adds no new automated tests (per Global Constraints — no component test infrastructure exists for pages).

- [ ] **Step 8: Live-verify the merged page**

Run: `npm run dev`, navigate to the single "게임 검색" sidebar entry (replacing the old "DLsite 검색" entry — confirm there is exactly one search-related nav item, not two), and confirm:
- The DLsite/VNDB toggle switches the active tab's visual state (`variant="default"` vs `"ghost"`).
- With "DLsite" selected, searching a title behaves exactly as the old DLsite search page did.
- With "VNDB" selected, searching a title (e.g. "Steins;Gate") shows VNDB result cards (thumbnail + title + code) and clicking one crawls and shows the detail view (cover, title, developer, release date, genres).
- Typing a direct code (e.g. `VN17` or an existing `RJ...` code) skips straight to the detail view regardless of which tab is selected.
- `src/pages/Explorer/FolderView.tsx`'s own unrelated search-error/no-results flow (if reachable in this build) still displays correctly — confirms the reused `dlsiteSearch.searchError`/`dlsiteSearch.noResults` keys were not broken by this task's translation edits.
- No console errors.

- [ ] **Step 9: Commit**

```bash
git add src/services/metadataService.ts src/pages/DlsiteSearch/DlsiteSearchPage.tsx src/pages/GameSearch/GameSearchPage.tsx src/router.tsx src/components/layout/Sidebar.tsx src/i18n/translations.ts
git commit -m "$(cat <<'EOF'
feat: merge DLsite and VNDB search into one page with a source toggle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
