# getchu.com Title Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add getchu.com title search and widen `GameSearchPage.tsx`'s 4-way DLsite/Steam/VNDB/All source picker to 5-way, adding getchu as its own tab and as a fourth participant in "All"'s grouped results.

**Architecture:** Task 1 builds `getchuSearchParser.ts` (pure parse) + `crawlGetchuSearch.ts` (fetch), mirroring the exact `dlsiteSearchParser.ts`/`crawlDlsiteSearch.ts` file split — the closest precedent, since both DLsite and getchu are HTML-scraped sources with search living in its own file separate from the single-work crawl dispatch. Task 2 wires it through IPC/preload/the renderer service layer, mirroring the Steam-search IPC task from the unified-game-search sub-project exactly. Task 3 widens `GameSearchPage.tsx` from 4-way to 5-way, extending the same pattern that sub-project's 4-way version already established for its 3 groups to a 4th.

**Tech Stack:** Electron + TypeScript strict, zod (IPC schemas), cheerio (HTML parsing), Vitest (fixture-based unit tests, no live network calls in the test suite).

## Global Constraints

- `GetchuSearchResult`/`GetchuSearchResultDto` shape: `{code: GameCode, title: string, thumbnailUrl: string | null}` — matches every other search result type in this app exactly.
- Real, confirmed search endpoint: `GET https://www.getchu.com/php/nsearch.phtml?genre=pc_soft&search_keyword=<query>&check_key_dtl=1`. EUC-JP response — same `arrayBuffer()` + `TextDecoder('euc-jp')` decode `crawlGetchu` (`crawlGameMetadata.ts`) already uses, confirmed live during design.
- The age-gate bypass (`?gc=gc`) `crawlGetchu` uses for the single-work crawl is confirmed NOT needed for search — a real, live-verified age-gated title appears in search results normally (with a generic `r18.jpg` placeholder thumbnail instead of real cover art, not a bug). Do not add `?gc=gc` to the search request.
- `NETWORK_TIMEOUT_MS = 15_000` and `USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'` — same values as every other outbound fetch in this app. Declare locally in the new file, matching this codebase's established per-file duplication convention.
- No test for the actual `fetch()` call, the new IPC handler, or the widened page — matches this app's established precedent. The new pure parser gets a real fixture-based unit test.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: `getchuSearchParser.ts` + `crawlGetchuSearch.ts` — getchu title search backend

**Files:**
- Create: `electron/main/metadata/getchuSearchParser.ts`
- Create: `electron/main/metadata/__fixtures__/getchu-search-results.html` (captured by you, Step 1 — see below)
- Create: `electron/main/metadata/getchuSearchParser.test.ts`
- Create: `electron/main/metadata/crawlGetchuSearch.ts`

**Interfaces:**
- Consumes: `GameCode` (`shared/types/scanner.ts`, unchanged).
- Produces: `crawlGetchuSearch(query: string): Promise<GetchuSearchResult[]>`, `parseGetchuSearchResults(html: string): GetchuSearchResult[]`, `GetchuSearchResult` (`{code: GameCode, title: string, thumbnailUrl: string | null}`) — all consumed by Task 2.

- [ ] **Step 1: Capture a real fixture**

Run this exact command (confirmed working during this plan's design):

```bash
curl -s -G -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0" "https://www.getchu.com/php/nsearch.phtml" --data-urlencode "genre=pc_soft" --data-urlencode "search_keyword=sprite" --data-urlencode "check_key_dtl=1" -o /tmp/getchu-search-raw.html -w "status:%{http_code}\n"
```

Expected: `status:200`. This is EUC-JP-encoded (same as `getchu-work-page.html`'s own fixture) — decode it to UTF-8 with a one-off Node script, matching the exact convention `getchuParser.test.ts`'s own fixtures already document:

```js
// decode-temp.mjs (delete after use, not part of the deliverable)
import { readFileSync, writeFileSync } from 'fs'
const raw = readFileSync('/tmp/getchu-search-raw.html')
const html = new TextDecoder('euc-jp').decode(raw)
writeFileSync('electron/main/metadata/__fixtures__/getchu-search-results.html', html)
```

Run with `node decode-temp.mjs`, then delete `decode-temp.mjs` and `/tmp/getchu-search-raw.html`.

**Verify your fixture matches what this plan expects** before continuing: it should contain the literal id `1366941` linked from an anchor with `class="blueb"` and title text `小金井荘と金色の揚羽蝶 初回限定特装版` (confirmed live during design — search `id=1366941` in your saved fixture). If your fresh capture's content for this specific id has changed or the id is no longer present, getchu's catalog or markup has changed since this plan was written — stop and report BLOCKED with what you actually found, rather than adjusting the test to fit a different real result (the parser logic below was verified against real markup and should still be structurally correct even if specific listed titles differ, but a structural mismatch is worth surfacing, not silently patching around).

- [ ] **Step 2: Write the failing test**

Create `electron/main/metadata/getchuSearchParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseGetchuSearchResults } from './getchuSearchParser'

async function loadFixture(name: string): Promise<string> {
  return readFile(join(__dirname, '__fixtures__', name), 'utf-8')
}

describe('parseGetchuSearchResults', () => {
  it('extracts id, title, and thumbnail for a real search result', async () => {
    const html = await loadFixture('getchu-search-results.html')
    const results = parseGetchuSearchResults(html)
    const target = results.find((r) => r.code.value === 'GC1366941')
    expect(target).toEqual({
      code: { type: 'GC', value: 'GC1366941' },
      title: '小金井荘と金色の揚羽蝶 初回限定特装版',
      thumbnailUrl: 'https://www.getchu.com/brandnew/1366941/c1366941package_ss.jpg',
    })
  })

  it('does not return duplicate results for the same id', async () => {
    const html = await loadFixture('getchu-search-results.html')
    const results = parseGetchuSearchResults(html)
    const ids = results.map((r) => r.code.value)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns every result with a non-empty title', async () => {
    const html = await loadFixture('getchu-search-results.html')
    const results = parseGetchuSearchResults(html)
    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      expect(result.title.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run electron/main/metadata/getchuSearchParser.test.ts`
Expected: FAIL — `./getchuSearchParser` does not exist yet.

- [ ] **Step 4: Create `getchuSearchParser.ts`**

Real markup confirmed during design (verify your own fixture matches this shape — a result is a `<li>` containing a `.package` div with the thumbnail anchor+lazy-loaded `<img data-original="...">`, and a `#detail_block` div with a table whose first row holds `<a class="blueb" href="../soft.phtml?id=<id>">TITLE</a>`):

```html
<li>
  <div class="content_block">
    <div id="package_block">
      <div class="package">
        <A HREF="../soft.phtml?id=1366941"><IMG class="lazy" src="/common/images/space.gif" data-original="https://www.getchu.com/brandnew/1366941/c1366941package_ss.jpg" width="120" height="86" border=0></A>
      </div>
    </div>
    <div id="cart_block">...</div>
    <div id="detail_block">
      <div class="content_block">
        <TABLE>
          <TR><TD><A HREF="../soft.phtml?id=1366941" class="blueb">小金井荘と金色の揚羽蝶 初回限定特装版 </A>...</TD></TR>
        </TABLE>
      </div>
    </div>
  </div>
</li>
```

`data-original` holds the real thumbnail URL — `src` is always a `space.gif` placeholder, resolved client-side by JS this app never runs (the exact same lazy-load problem `dlsiteSearchParser.ts` already solved for DLsite, just via a real, targetable attribute here instead of DLsite's Vue-binding-text-scan). A gated title's `data-original` is a generic `../common/images/r18.jpg` placeholder (confirmed live) — pass it through unfiltered, same as any other thumbnail URL, absolutized the same way.

Create `electron/main/metadata/getchuSearchParser.ts`:

```ts
import * as cheerio from 'cheerio'
import type { GameCode } from '../../../shared/types/scanner'

export interface GetchuSearchResult {
  code: GameCode
  title: string
  thumbnailUrl: string | null
}

// Same relative-path problem confirmed for the single-work crawl
// (getchuParser.ts) - getchu serves images as relative paths, and this
// value ends up passed to cacheCoverImage.ts's main-process fetch() (via
// this app's normal crawl-and-save flow once a search result is selected),
// which can't resolve a relative path with no <base> context.
function toAbsoluteImageUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url
  return `https://www.getchu.com${url.startsWith('/') ? '' : '/'}${url}`
}

const RESULT_ID_PATTERN = /soft\.phtml\?id=(\d+)/

// getchu 자유 텍스트 검색 결과 페이지를 파싱한다. 결과 항목은 <li> 하나에
// 썸네일 앵커(.package 안, data-original에 실제 이미지)와 제목 앵커
// (class="blueb")가 따로 들어있는 구조 - DLsite의 "두 개의 별도 앵커가 하나의
// 컨테이너를 공유" 패턴과 같은 종류의 문제다. class="blueb"는 실제 검색
// 결과의 제목 링크에만 쓰이는 것으로 확인되어, DLsite처럼 문서 전체를
// href 패턴으로 훑을 필요 없이 이 선택자 하나로 결과를 특정할 수 있다.
// 마크업이 예상과 다르면(사이트 개편 등) 빈 배열을 반환한다 - "검색 결과
// 없음"과 구분되지 않지만, 잘못된 데이터를 보여주는 것보다 안전하다.
export function parseGetchuSearchResults(html: string): GetchuSearchResult[] {
  const $ = cheerio.load(html)
  const results: GetchuSearchResult[] = []
  const seen = new Set<string>()

  $('a.blueb[href*="soft.phtml?id="]').each((_i, el) => {
    const anchor = $(el)
    const href = anchor.attr('href') ?? ''
    const match = RESULT_ID_PATTERN.exec(href)
    if (!match) return

    const id = match[1]
    if (seen.has(id)) return

    const title = anchor.text().trim()
    if (!title) return

    seen.add(id)

    const container = anchor.closest('li')
    const scope = container.length > 0 ? container : anchor.closest('div, td')
    const thumbnailAttr =
      scope.find('.package img[data-original]').first().attr('data-original') ??
      scope.find('img[data-original]').first().attr('data-original')
    const thumbnailUrl = thumbnailAttr ? toAbsoluteImageUrl(thumbnailAttr) : null

    results.push({ code: { type: 'GC', value: `GC${id}` }, title, thumbnailUrl })
  })

  return results
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run electron/main/metadata/getchuSearchParser.test.ts`
Expected: PASS (3 tests). If the first test fails because your captured fixture's real content for id 1366941 differs from what's asserted (title changed, thumbnail path changed), update the assertion to match your fixture's actual real content — do NOT change the parser logic to force a match; re-verify by hand that your fixture's raw HTML genuinely contains what you're asserting.

- [ ] **Step 6: Create `crawlGetchuSearch.ts`**

Create `electron/main/metadata/crawlGetchuSearch.ts`, mirroring `crawlDlsiteSearch.ts`'s exact shape (fetch, `!response.ok` guard, delegate to the pure parser) and `getchuParser.ts`'s established EUC-JP decode:

```ts
import { parseGetchuSearchResults, type GetchuSearchResult } from './getchuSearchParser'

export type { GetchuSearchResult }

const NETWORK_TIMEOUT_MS = 15_000

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'

function searchUrl(query: string): string {
  return `https://www.getchu.com/php/nsearch.phtml?genre=pc_soft&search_keyword=${encodeURIComponent(query)}&check_key_dtl=1`
}

// Search does NOT need the ?gc=gc age-gate bypass crawlGetchu
// (crawlGameMetadata.ts) uses for the single-work page - confirmed live
// during design that a real, age-gated title still appears in search
// results without it (just with a generic r18.jpg placeholder thumbnail
// instead of real cover art, not a bug).
export async function crawlGetchuSearch(query: string): Promise<GetchuSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed === '') return []

  const response = await fetch(searchUrl(trimmed), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return []

  const buffer = await response.arrayBuffer()
  const html = new TextDecoder('euc-jp').decode(buffer)
  return parseGetchuSearchResults(html)
}
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add electron/main/metadata/getchuSearchParser.ts electron/main/metadata/getchuSearchParser.test.ts electron/main/metadata/__fixtures__/getchu-search-results.html electron/main/metadata/crawlGetchuSearch.ts
git commit -m "$(cat <<'EOF'
feat: add getchu.com title search

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: getchu search — IPC channel, handler, preload method, renderer hook

**Files:**
- Modify: `shared/types/ipc.ts`
- Modify: `electron/main/ipc/metadataHandlers.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/services/metadataService.ts`

**Interfaces:**
- Consumes: `crawlGetchuSearch` (Task 1), `IPC_CHANNELS`, `GameCodeSchema` (existing, unchanged).
- Produces: `IPC_CHANNELS.METADATA_SEARCH_GETCHU`, `SearchGetchuRequestSchema`, `GetchuSearchResultDto` (all in `shared/types/ipc.ts`), `window.api.metadata.searchGetchu(query: string): Promise<GetchuSearchResultDto[]>` (preload), `useSearchGetchu()` (renderer hook) — all consumed by Task 3.

- [ ] **Step 1: Add `IPC_CHANNELS.METADATA_SEARCH_GETCHU`**

Edit `shared/types/ipc.ts` — insert immediately after the existing `METADATA_SEARCH_STEAM: 'metadata:search-steam',` line:

```ts
  METADATA_SEARCH_GETCHU: 'metadata:search-getchu',
```

- [ ] **Step 2: Add `SearchGetchuRequestSchema` and `GetchuSearchResultDto`**

Edit `shared/types/ipc.ts` — insert immediately after the existing `SteamSearchResultDto` interface (after its closing `}`, before `CrawlMissingMetadataRequestSchema`):

```ts
export const SearchGetchuRequestSchema = z.object({
  query: z.string(),
})
export type SearchGetchuRequest = z.infer<typeof SearchGetchuRequestSchema>

export interface GetchuSearchResultDto {
  code: z.infer<typeof GameCodeSchema>
  title: string
  thumbnailUrl: string | null
}
```

- [ ] **Step 3: Add the IPC handler**

Edit `electron/main/ipc/metadataHandlers.ts` — add `SearchGetchuRequestSchema` to the existing import from `'../../../shared/types/ipc'`, and add a new import line for `crawlGetchuSearch`:

```ts
import {
  CrawlAndSaveMetadataRequestSchema,
  GetMetadataRequestSchema,
  GetManyMetadataRequestSchema,
  GetCoverImageRequestSchema,
  SearchDlsiteRequestSchema,
  SearchVndbRequestSchema,
  SearchSteamRequestSchema,
  SearchGetchuRequestSchema,
  CrawlMissingMetadataRequestSchema,
  IPC_CHANNELS,
  type GameMetadataDto,
} from '../../../shared/types/ipc'
import { crawlGameMetadata } from '../metadata/crawlGameMetadata'
import { crawlDlsiteSearch } from '../metadata/crawlDlsiteSearch'
import { searchVndb } from '../metadata/vndbClient'
import { crawlSteamSearch } from '../metadata/steamSearchClient'
import { crawlGetchuSearch } from '../metadata/crawlGetchuSearch'
```

Then add the handler immediately after the existing `METADATA_SEARCH_STEAM` handler, before `METADATA_CRAWL_MISSING`:

```ts
  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH_GETCHU, async (_event, payload: unknown) => {
    const { query } = SearchGetchuRequestSchema.parse(payload)
    return crawlGetchuSearch(query)
  })
```

- [ ] **Step 4: Add the preload method**

Edit `electron/preload/index.ts` — add `GetchuSearchResultDto` to the existing type-only import from `'../../shared/types/ipc'`, inserted alphabetically between `GameWithSavePathDto` and `LaunchConfigDto`:

```ts
  type GameWithSavePathDto,
  type GetchuSearchResultDto,
  type LaunchConfigDto,
```

Then add the method inside the existing `metadata: { ... }` block, immediately after `searchSteam`:

```ts
    searchSteam: (query: string): Promise<SteamSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH_STEAM, { query }),
    searchGetchu: (query: string): Promise<GetchuSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH_GETCHU, { query }),
```

- [ ] **Step 5: Add the renderer hook**

Edit `src/services/metadataService.ts` — add `GetchuSearchResultDto` to the existing type-only import from `'../../shared/types/ipc'`, inserted alphabetically between `GameMetadataDto` and `SteamSearchResultDto`:

```ts
import type {
  DlsiteSearchResultDto,
  GameMetadataDto,
  GetchuSearchResultDto,
  SteamSearchResultDto,
  VndbSearchResultDto,
} from '../../shared/types/ipc'
```

Add the hook immediately after the existing `useSearchSteam`:

```ts
export function useSearchGetchu() {
  return useMutation({
    mutationFn: (query: string): Promise<GetchuSearchResultDto[]> =>
      window.api.metadata.searchGetchu(query),
  })
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions (this task adds no new tests of its own — pure wiring, matching the established no-test-for-IPC-handlers precedent).

- [ ] **Step 8: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/metadataHandlers.ts electron/preload/index.ts src/services/metadataService.ts
git commit -m "$(cat <<'EOF'
feat: wire getchu title search through IPC to the renderer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `GameSearchPage.tsx` — widen to a 5-way DLsite/Steam/VNDB/getchu/All source picker

**Files:**
- Modify: `src/pages/GameSearch/GameSearchPage.tsx`

**Interfaces:**
- Consumes: `useSearchGetchu` (Task 2), `useSearchDlsite`/`useSearchSteam`/`useSearchVndb`/`useCrawlGameMetadata`/`useGameMetadata`/`useGameCoverImage`/`parseCodeInput` (existing, unchanged).
- Produces: nothing consumed by later tasks — this is the plan's final task.

No new translation key is needed — like DLsite/Steam/VNDB, the new toggle button is a hardcoded brand-name string (`getchu`), matching the established pattern for all 3 existing brand buttons.

- [ ] **Step 1: Replace `GameSearchPage.tsx` in full**

The current file (4-way toggle) is being replaced with a 5-way one. Replace the entire contents of `src/pages/GameSearch/GameSearchPage.tsx` with:

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
  useSearchGetchu,
  useSearchSteam,
  useSearchVndb,
} from '../../services/metadataService'
import { IndeterminateProgressBar } from '../../components/ui/progress-bar'
import { parseCodeInput } from '../DlsiteSearch/parseCodeInput'
import { useTranslation } from '../../i18n/useTranslation'
import type { GameCode } from '../../../shared/types/scanner'
import type {
  DlsiteSearchResultDto,
  GetchuSearchResultDto,
  SteamSearchResultDto,
  VndbSearchResultDto,
} from '../../../shared/types/ipc'

type SearchSource = 'all' | 'dlsite' | 'steam' | 'vndb' | 'getchu'
type SearchResult =
  | DlsiteSearchResultDto
  | SteamSearchResultDto
  | VndbSearchResultDto
  | GetchuSearchResultDto
interface SourceSearchState {
  data: SearchResult[] | undefined
  isPending: boolean
  isError: boolean
}

function renderResultCard(result: SearchResult, onSelect: (result: SearchResult) => void) {
  return (
    <button
      key={result.code.value}
      onClick={() => onSelect(result)}
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
  )
}

// Renders one source's group within the "All" tab: a label header plus
// that source's own pending/error/results state - independent of the other
// sources, so a slow DLsite scrape doesn't block already-arrived
// Steam/VNDB/getchu results from showing. Returns null (renders nothing,
// group omitted entirely) once settled with zero results, rather than
// showing an empty header.
function renderSourceGroup(
  label: string,
  search: SourceSearchState,
  onSelect: (result: SearchResult) => void,
  searchingText: string,
  errorText: string
) {
  if (search.isPending) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <div className="flex max-w-xs flex-col gap-1">
          <IndeterminateProgressBar />
          <p className="text-xs text-muted-foreground">{searchingText}</p>
        </div>
      </div>
    )
  }
  if (search.isError) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{errorText}</p>
      </div>
    )
  }
  if (search.data === undefined || search.data.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-1">
        {search.data.map((result) => renderResultCard(result, onSelect))}
      </div>
    </div>
  )
}

export function GameSearchPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [source, setSource] = useState<SearchSource>('all')
  const [activeCode, setActiveCode] = useState<GameCode | null>(null)
  const [lastQuery, setLastQuery] = useState('')

  const { data: metadata, isLoading } = useGameMetadata(activeCode)
  const crawlAndSave = useCrawlGameMetadata()
  const searchDlsite = useSearchDlsite()
  const searchSteam = useSearchSteam()
  const searchVndb = useSearchVndb()
  const searchGetchu = useSearchGetchu()
  const { data: coverImage } = useGameCoverImage(metadata?.coverImagePath ? activeCode : null)

  // Only meaningful for the 4 single-source tabs - 'all' fires and renders
  // all four at once instead (see the grouped rendering below).
  const activeSearch =
    source === 'dlsite'
      ? searchDlsite
      : source === 'steam'
        ? searchSteam
        : source === 'vndb'
          ? searchVndb
          : searchGetchu

  const selectResult = (result: SearchResult): void => {
    setActiveCode(result.code)
    crawlAndSave.mutate(result.code)
  }

  const handleSearch = (): void => {
    const trimmed = input.trim()
    if (trimmed === '') return

    // A direct code (RJ/VJ/ST/VN/GC) resolves the same way regardless of
    // which tab is selected - the toggle only decides which API(s) a
    // free-text title search hits.
    const code = parseCodeInput(trimmed)
    if (code) {
      searchDlsite.reset()
      searchSteam.reset()
      searchVndb.reset()
      searchGetchu.reset()
      setActiveCode(code)
      crawlAndSave.mutate(code)
      return
    }

    setActiveCode(null)
    // A new query TEXT (regardless of which tab submits it) invalidates
    // every source's previously cached results - otherwise switching tabs
    // and searching something different leaves other sources showing stale
    // results for the OLD query, composited into the "All" tab's grouped
    // view as if they were current. Re-submitting the exact same text from
    // a different tab deliberately does NOT reset - that's the existing
    // cross-tab cache behavior, preserved here.
    if (trimmed !== lastQuery) {
      searchDlsite.reset()
      searchSteam.reset()
      searchVndb.reset()
      searchGetchu.reset()
    }
    setLastQuery(trimmed)
    if (source === 'all') {
      searchDlsite.mutate(trimmed)
      searchSteam.mutate(trimmed)
      searchVndb.mutate(trimmed)
      searchGetchu.mutate(trimmed)
    } else if (source === 'dlsite') {
      searchDlsite.mutate(trimmed)
    } else if (source === 'steam') {
      searchSteam.mutate(trimmed)
    } else if (source === 'vndb') {
      searchVndb.mutate(trimmed)
    } else {
      searchGetchu.mutate(trimmed)
    }
  }

  const dlsiteHasData = searchDlsite.data !== undefined
  const steamHasData = searchSteam.data !== undefined
  const vndbHasData = searchVndb.data !== undefined
  const getchuHasData = searchGetchu.data !== undefined

  // Prefer staying on the current tab if it (or, for 'all', any of its 4
  // sources) has results; otherwise fall back to whichever single source
  // does, in a fixed order. null means nothing to go back to anywhere, so
  // the link itself should not render.
  const currentTabHasData =
    source === 'all'
      ? dlsiteHasData || steamHasData || vndbHasData || getchuHasData
      : source === 'dlsite'
        ? dlsiteHasData
        : source === 'steam'
          ? steamHasData
          : source === 'vndb'
            ? vndbHasData
            : getchuHasData
  const backTargetSource: SearchSource | null = currentTabHasData
    ? source
    : dlsiteHasData
      ? 'dlsite'
      : steamHasData
        ? 'steam'
        : vndbHasData
          ? 'vndb'
          : getchuHasData
            ? 'getchu'
            : null
  const hasBackTarget = backTargetSource !== null

  const showingResultsList = activeCode === null && activeSearch.data !== undefined

  const allNoResults =
    source === 'all' &&
    activeCode === null &&
    !searchDlsite.isPending &&
    !searchSteam.isPending &&
    !searchVndb.isPending &&
    !searchGetchu.isPending &&
    !searchDlsite.isError &&
    !searchSteam.isError &&
    !searchVndb.isError &&
    !searchGetchu.isError &&
    dlsiteHasData &&
    steamHasData &&
    vndbHasData &&
    getchuHasData &&
    searchDlsite.data!.length === 0 &&
    searchSteam.data!.length === 0 &&
    searchVndb.data!.length === 0 &&
    searchGetchu.data!.length === 0

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex w-fit gap-1 rounded-md bg-muted p-1">
        <Button
          type="button"
          variant={source === 'all' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={source === 'all'}
          onClick={() => setSource('all')}
        >
          {t('gameSearch.all')}
        </Button>
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
          variant={source === 'steam' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={source === 'steam'}
          onClick={() => setSource('steam')}
        >
          Steam
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
        <Button
          type="button"
          variant={source === 'getchu' ? 'default' : 'ghost'}
          size="sm"
          aria-pressed={source === 'getchu'}
          onClick={() => setSource('getchu')}
        >
          getchu
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

      {activeCode && hasBackTarget && (
        <button
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => {
            if (backTargetSource !== null) setSource(backTargetSource)
            setActiveCode(null)
          }}
        >
          <ArrowLeft className="h-3 w-3" />
          {t('gameSearch.backToResults')}
        </button>
      )}

      {source === 'all' ? (
        activeCode === null && (
          <div className="flex flex-col gap-3 overflow-auto">
            {allNoResults && (
              <p className="text-sm text-muted-foreground">{t('dlsiteSearch.noResults')}</p>
            )}
            {renderSourceGroup(
              'DLsite',
              searchDlsite,
              selectResult,
              t('gameSearch.searching'),
              t('dlsiteSearch.searchError')
            )}
            {renderSourceGroup(
              'Steam',
              searchSteam,
              selectResult,
              t('gameSearch.searching'),
              t('dlsiteSearch.searchError')
            )}
            {renderSourceGroup(
              'VNDB',
              searchVndb,
              selectResult,
              t('gameSearch.searching'),
              t('dlsiteSearch.searchError')
            )}
            {renderSourceGroup(
              'getchu',
              searchGetchu,
              selectResult,
              t('gameSearch.searching'),
              t('dlsiteSearch.searchError')
            )}
          </div>
        )
      ) : (
        <>
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
              {activeSearch.data!.map((result) => renderResultCard(result, selectResult))}
            </div>
          )}
        </>
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

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors. This step specifically verifies `renderSourceGroup`'s `search: SourceSearchState` parameter correctly accepts `searchGetchu` (a 4th, differently-typed mutation result) via the same array-covariance mechanism already proven for the other 3 sources.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions. This task adds no new automated tests (per Global Constraints — no component test infrastructure for pages).

- [ ] **Step 4: Live-verify the widened page**

Run: `npm run dev`, navigate to the "게임 검색" / "Game Search" page, and confirm:
- Five tabs render: 통합검색(default)/DLsite/Steam/VNDB/getchu, each with correct pressed/unpressed styling.
- On the "getchu" tab, searching a title (e.g. "sprite") shows getchu result cards; clicking one crawls and shows the detail view.
- On "통합검색", the same search fires all four sources and shows up to 4 grouped sections — a query that returns 0 for one source but results for others should show only the non-empty groups.
- A query with genuinely zero results across all four sources on the "All" tab shows the "no results" message once.
- Searching a term known to include a real, age-gated getchu title (e.g. a term matching `GC650045`'s real title, confirmed during this feature's design as age-gated) shows it in the getchu results with a generic placeholder thumbnail rather than being silently excluded, and selecting it still crawls its real metadata correctly (via the existing, unchanged `crawlGetchu`'s `?gc=gc` bypass).
- Pasting a direct code (any of `RJ`/`VJ`/`ST`/`VN`/`GC`) still bypasses the toggle entirely, regardless of which of the 5 tabs is currently selected.
- No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/GameSearch/GameSearchPage.tsx
git commit -m "$(cat <<'EOF'
feat: widen game search to a 5-way DLsite/Steam/VNDB/getchu/All source picker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
