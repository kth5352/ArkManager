# Unified Game Search (DLsite + Steam + VNDB) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Steam title search (this app has never had it — Steam has always been code-only) via Steam's public storesearch JSON endpoint, and widen `GameSearchPage.tsx`'s DLsite/VNDB toggle to a 4-way source picker (통합검색/All, DLsite, Steam, VNDB), where "All" fires all three searches and renders results grouped by source.

**Architecture:** Task 1 builds the Steam search backend (`steamSearchClient.ts`), structurally mirroring `vndbClient.ts`'s search half exactly, but GET-with-query-params instead of POST-with-JSON-body (Steam's endpoint shape, confirmed live). Task 2 wires it through IPC/preload/the renderer service layer, mirroring the VNDB search sub-project's own IPC task exactly. Task 3 rewrites `GameSearchPage.tsx`'s 2-way toggle into a 4-way one, extracting two small pure render-helper functions (a single result row, a per-source result group) to avoid tripling near-identical JSX across the "All" tab's three groups plus the single-source list.

**Tech Stack:** Electron + TypeScript strict, zod (IPC schemas), Vitest (fixture-based unit tests, no live network calls), React 19 + TanStack Query (renderer).

## Global Constraints

- Steam's search endpoint: `GET https://store.steampowered.com/api/storesearch/?term=<query>&l=english&cc=US` — confirmed live to return `{total: number, items: [{type, name, id, tiny_image, ...}]}`. Public, unauthenticated, no HTML parsing needed.
- `NETWORK_TIMEOUT_MS = 15_000` and `USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'` — same values as every other outbound fetch in this app. Declare locally in the new file, matching this codebase's established precedent of duplicating these constants per-file rather than importing them from a sibling module.
- A Steam code is `{type: 'ST', value: 'ST<digits>'}` — `ST` + the numeric Steam app id, matching this app's existing convention (`buildExternalUrl.ts`'s `ST` branch, `crawlGameMetadata.ts`'s `crawlSteam`).
- No test for the actual `fetch()` call, the new IPC handler, or the widened page — matches this app's established no-live-network-test, no-component-test-infrastructure precedent. The new pure mapping function gets a real fixture-based unit test.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: `steamSearchClient.ts` — Steam title search backend

**Files:**
- Create: `electron/main/metadata/steamSearchClient.ts`
- Create: `electron/main/metadata/__fixtures__/steam-storesearch-item.json`
- Create: `electron/main/metadata/steamSearchClient.test.ts`

**Interfaces:**
- Consumes: `GameCode` (`shared/types/scanner.ts`, unchanged).
- Produces: `crawlSteamSearch(query: string): Promise<SteamSearchResult[]>`, `mapItemToSearchResult(item): SteamSearchResult`, `SteamSearchResult` (`{code: GameCode, title: string, thumbnailUrl: string | null}`) — all consumed by Task 2.

- [ ] **Step 1: Create the fixture**

Create `electron/main/metadata/__fixtures__/steam-storesearch-item.json` — one realistic item from Steam's own `storesearch` response `items` array (confirmed live shape):

```json
{
  "type": "app",
  "name": "Stardew Valley",
  "id": 413150,
  "tiny_image": "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/413150/capsule_231x87.jpg?t=1754692865"
}
```

- [ ] **Step 2: Write the failing tests**

Create `electron/main/metadata/steamSearchClient.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mapItemToSearchResult } from './steamSearchClient'

async function loadFixture(name: string): Promise<unknown> {
  const raw = await readFile(join(__dirname, '__fixtures__', name), 'utf-8')
  return JSON.parse(raw)
}

describe('mapItemToSearchResult', () => {
  it('maps a realistic Steam storesearch item to a SteamSearchResult', async () => {
    const item = await loadFixture('steam-storesearch-item.json')
    expect(mapItemToSearchResult(item as Parameters<typeof mapItemToSearchResult>[0])).toEqual({
      code: { type: 'ST', value: 'ST413150' },
      title: 'Stardew Valley',
      thumbnailUrl:
        'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/413150/capsule_231x87.jpg?t=1754692865',
    })
  })

  it('defaults thumbnailUrl to null when tiny_image is absent', () => {
    expect(mapItemToSearchResult({ id: 12345, name: 'Untitled' })).toEqual({
      code: { type: 'ST', value: 'ST12345' },
      title: 'Untitled',
      thumbnailUrl: null,
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run electron/main/metadata/steamSearchClient.test.ts`
Expected: FAIL — `./steamSearchClient` does not exist yet.

- [ ] **Step 4: Create `steamSearchClient.ts`**

Create `electron/main/metadata/steamSearchClient.ts`:

```ts
import type { GameCode } from '../../../shared/types/scanner'

// Without this, an unresponsive store.steampowered.com leaves this fetch
// pending forever, matching vndbClient.ts's/crawlGameMetadata.ts's own
// reasoning for the same constant on every other outbound fetch.
const NETWORK_TIMEOUT_MS = 15_000

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0'

interface SteamStoreSearchItem {
  id: number
  name: string
  tiny_image?: string
}

interface SteamStoreSearchResponse {
  items: SteamStoreSearchItem[]
}

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
  const trimmed = query.trim()
  if (trimmed === '') return []

  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(trimmed)}&l=english&cc=US`
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  })
  if (!response.ok) return []

  const data = (await response.json()) as SteamStoreSearchResponse
  return (data.items ?? []).map(mapItemToSearchResult)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run electron/main/metadata/steamSearchClient.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add electron/main/metadata/steamSearchClient.ts electron/main/metadata/steamSearchClient.test.ts electron/main/metadata/__fixtures__/steam-storesearch-item.json
git commit -m "$(cat <<'EOF'
feat: add Steam title search via the public storesearch endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Steam search — IPC channel, handler, preload method, renderer hook

**Files:**
- Modify: `shared/types/ipc.ts`
- Modify: `electron/main/ipc/metadataHandlers.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/services/metadataService.ts`

**Interfaces:**
- Consumes: `crawlSteamSearch` (Task 1), `IPC_CHANNELS`, `GameCodeSchema` (existing, unchanged).
- Produces: `IPC_CHANNELS.METADATA_SEARCH_STEAM`, `SearchSteamRequestSchema`, `SteamSearchResultDto` (all in `shared/types/ipc.ts`), `window.api.metadata.searchSteam(query: string): Promise<SteamSearchResultDto[]>` (preload), `useSearchSteam()` (renderer hook) — all consumed by Task 3.

- [ ] **Step 1: Add `IPC_CHANNELS.METADATA_SEARCH_STEAM`**

Edit `shared/types/ipc.ts` — insert immediately after the existing `METADATA_SEARCH_VNDB: 'metadata:search-vndb',` line:

```ts
  METADATA_SEARCH_STEAM: 'metadata:search-steam',
```

- [ ] **Step 2: Add `SearchSteamRequestSchema` and `SteamSearchResultDto`**

Edit `shared/types/ipc.ts` — insert immediately after the existing `VndbSearchResultDto` interface (after its closing `}`, before `CrawlMissingMetadataRequestSchema`):

```ts
export const SearchSteamRequestSchema = z.object({
  query: z.string(),
})
export type SearchSteamRequest = z.infer<typeof SearchSteamRequestSchema>

export interface SteamSearchResultDto {
  code: z.infer<typeof GameCodeSchema>
  title: string
  thumbnailUrl: string | null
}
```

- [ ] **Step 3: Add the IPC handler**

Edit `electron/main/ipc/metadataHandlers.ts` — add `SearchSteamRequestSchema` to the existing import from `'../../../shared/types/ipc'`, and add a new import line for `crawlSteamSearch`:

```ts
import {
  CrawlAndSaveMetadataRequestSchema,
  GetMetadataRequestSchema,
  GetManyMetadataRequestSchema,
  GetCoverImageRequestSchema,
  SearchDlsiteRequestSchema,
  SearchVndbRequestSchema,
  SearchSteamRequestSchema,
  CrawlMissingMetadataRequestSchema,
  IPC_CHANNELS,
  type GameMetadataDto,
} from '../../../shared/types/ipc'
import { crawlGameMetadata } from '../metadata/crawlGameMetadata'
import { crawlDlsiteSearch } from '../metadata/crawlDlsiteSearch'
import { searchVndb } from '../metadata/vndbClient'
import { crawlSteamSearch } from '../metadata/steamSearchClient'
```

Then add the handler immediately after the existing `METADATA_SEARCH_VNDB` handler, before `METADATA_CRAWL_MISSING`:

```ts
  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH_STEAM, async (_event, payload: unknown) => {
    const { query } = SearchSteamRequestSchema.parse(payload)
    return crawlSteamSearch(query)
  })
```

- [ ] **Step 4: Add the preload method**

Edit `electron/preload/index.ts` — add `SteamSearchResultDto` to the existing type-only import from `'../../shared/types/ipc'`, inserted alphabetically between `SortPreference` and `Theme`:

```ts
  type SortPage,
  type SortPreference,
  type SteamSearchResultDto,
  type Theme,
```

Then add the method inside the existing `metadata: { ... }` block, immediately after `searchVndb`:

```ts
    searchVndb: (query: string): Promise<VndbSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH_VNDB, { query }),
    searchSteam: (query: string): Promise<SteamSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH_STEAM, { query }),
```

- [ ] **Step 5: Add the renderer hook**

Edit `src/services/metadataService.ts` — add `SteamSearchResultDto` to the existing type-only import from `'../../shared/types/ipc'`:

```ts
import type {
  DlsiteSearchResultDto,
  GameMetadataDto,
  SteamSearchResultDto,
  VndbSearchResultDto,
} from '../../shared/types/ipc'
```

Add the hook immediately after the existing `useSearchVndb`:

```ts
export function useSearchSteam() {
  return useMutation({
    mutationFn: (query: string): Promise<SteamSearchResultDto[]> =>
      window.api.metadata.searchSteam(query),
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
feat: wire Steam title search through IPC to the renderer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `GameSearchPage.tsx` — widen to a 4-way DLsite/Steam/VNDB/All source picker

**Files:**
- Modify: `src/pages/GameSearch/GameSearchPage.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `useSearchSteam` (Task 2), `useSearchDlsite`/`useSearchVndb`/`useCrawlGameMetadata`/`useGameMetadata`/`useGameCoverImage`/`parseCodeInput` (existing, unchanged).
- Produces: nothing consumed by later tasks — this is the plan's final task.

- [ ] **Step 1: Add the one new translation key (ko/ja/en)**

Edit `src/i18n/translations.ts`. Insert immediately before the existing `'gameSearch.placeholder'` line in each locale block:

**`ko`** (before line 246):
```ts
  'gameSearch.all': '통합검색',
```

**`ja`** (before line 539):
```ts
  'gameSearch.all': '統合検索',
```

**`en`** (before line 833):
```ts
  'gameSearch.all': 'All',
```

- [ ] **Step 2: Replace `GameSearchPage.tsx` in full**

The current file (2-way toggle) is being replaced with a 4-way one. Replace the entire contents of `src/pages/GameSearch/GameSearchPage.tsx` with:

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
  useSearchSteam,
  useSearchVndb,
} from '../../services/metadataService'
import { IndeterminateProgressBar } from '../../components/ui/progress-bar'
import { parseCodeInput } from '../DlsiteSearch/parseCodeInput'
import { useTranslation } from '../../i18n/useTranslation'
import type { GameCode } from '../../../shared/types/scanner'
import type {
  DlsiteSearchResultDto,
  SteamSearchResultDto,
  VndbSearchResultDto,
} from '../../../shared/types/ipc'

type SearchSource = 'all' | 'dlsite' | 'steam' | 'vndb'
type SearchResult = DlsiteSearchResultDto | SteamSearchResultDto | VndbSearchResultDto
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
// two sources, so a slow DLsite scrape doesn't block already-arrived
// Steam/VNDB results from showing. Returns null (renders nothing, group
// omitted entirely) once settled with zero results, rather than showing an
// empty header.
function renderSourceGroup(
  label: string,
  search: SourceSearchState,
  onSelect: (result: SearchResult) => void,
  searchingText: string,
  errorText: string
) {
  if (search.isPending) {
    return (
      <div key={label} className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <IndeterminateProgressBar />
        <p className="text-xs text-muted-foreground">{searchingText}</p>
      </div>
    )
  }
  if (search.isError) {
    return (
      <div key={label} className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{errorText}</p>
      </div>
    )
  }
  if (search.data === undefined || search.data.length === 0) return null
  return (
    <div key={label} className="flex flex-col gap-1">
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

  const { data: metadata, isLoading } = useGameMetadata(activeCode)
  const crawlAndSave = useCrawlGameMetadata()
  const searchDlsite = useSearchDlsite()
  const searchSteam = useSearchSteam()
  const searchVndb = useSearchVndb()
  const { data: coverImage } = useGameCoverImage(metadata?.coverImagePath ? activeCode : null)

  // Only meaningful for the 3 single-source tabs - 'all' fires and renders
  // all three at once instead (see the grouped rendering below).
  const activeSearch =
    source === 'dlsite' ? searchDlsite : source === 'steam' ? searchSteam : searchVndb

  const selectResult = (result: SearchResult): void => {
    setActiveCode(result.code)
    crawlAndSave.mutate(result.code)
  }

  const handleSearch = (): void => {
    const trimmed = input.trim()
    if (trimmed === '') return

    // A direct code (RJ/VJ/ST/VN) resolves the same way regardless of which
    // tab is selected - the toggle only decides which API(s) a free-text
    // title search hits.
    const code = parseCodeInput(trimmed)
    if (code) {
      searchDlsite.reset()
      searchSteam.reset()
      searchVndb.reset()
      setActiveCode(code)
      crawlAndSave.mutate(code)
      return
    }

    setActiveCode(null)
    if (source === 'all') {
      searchDlsite.mutate(trimmed)
      searchSteam.mutate(trimmed)
      searchVndb.mutate(trimmed)
    } else if (source === 'dlsite') {
      searchDlsite.mutate(trimmed)
    } else if (source === 'steam') {
      searchSteam.mutate(trimmed)
    } else {
      searchVndb.mutate(trimmed)
    }
  }

  const dlsiteHasData = searchDlsite.data !== undefined
  const steamHasData = searchSteam.data !== undefined
  const vndbHasData = searchVndb.data !== undefined

  // Prefer staying on the current tab if it (or, for 'all', any of its 3
  // sources) has results; otherwise fall back to whichever single source
  // does, in a fixed order. null means nothing to go back to anywhere, so
  // the link itself should not render.
  const currentTabHasData =
    source === 'all'
      ? dlsiteHasData || steamHasData || vndbHasData
      : source === 'dlsite'
        ? dlsiteHasData
        : source === 'steam'
          ? steamHasData
          : vndbHasData
  const backTargetSource: SearchSource | null = currentTabHasData
    ? source
    : dlsiteHasData
      ? 'dlsite'
      : steamHasData
        ? 'steam'
        : vndbHasData
          ? 'vndb'
          : null
  const hasBackTarget = backTargetSource !== null

  const showingResultsList = activeCode === null && activeSearch.data !== undefined

  const allNoResults =
    source === 'all' &&
    activeCode === null &&
    !searchDlsite.isPending &&
    !searchSteam.isPending &&
    !searchVndb.isPending &&
    !searchDlsite.isError &&
    !searchSteam.isError &&
    !searchVndb.isError &&
    dlsiteHasData &&
    steamHasData &&
    vndbHasData &&
    searchDlsite.data!.length === 0 &&
    searchSteam.data!.length === 0 &&
    searchVndb.data!.length === 0

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

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors. This step specifically verifies: (a) `renderSourceGroup`'s `search: SourceSearchState` parameter correctly accepts `searchDlsite`/`searchSteam`/`searchVndb` despite their differing per-source `data` element types (array covariance against the `SearchResult` union — the same mechanism `activeSearch.data!.map(...)` already relied on before this task), (b) the missing `en` translation key would be a compile error via `Record<keyof typeof ko, string>`, catching any locale left out of Step 1.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions. This task adds no new automated tests (per Global Constraints — no component test infrastructure for pages).

- [ ] **Step 5: Live-verify the widened page**

Run: `npm run dev`, navigate to the "게임 검색" / "Game Search" page, and confirm:
- Four tabs render: 통합검색(default)/DLsite/Steam/VNDB, each with correct pressed/unpressed styling.
- On the "Steam" tab, searching a title (e.g. "Stardew Valley") shows Steam result cards; clicking one crawls and shows the detail view.
- On "통합검색", the same search fires all three sources and shows up to 3 grouped sections (DLsite/Steam/VNDB headers), each independently — a query that returns 0 for one source but results for the others should show only the non-empty groups.
- A query with genuinely zero results across all three sources on the "All" tab shows the "no results" message once (not once per empty group).
- Pasting a direct code (any of `RJ`/`VJ`/`ST`/`VN`) still bypasses the toggle entirely, regardless of which of the 4 tabs is currently selected.
- Opening a Steam search result's detail, then toggling to a tab with no cached data, then clicking "back to results" lands on a tab that actually shows something (not a blank area) — per the `backTargetSource` fallback logic.
- No console errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/GameSearch/GameSearchPage.tsx src/i18n/translations.ts
git commit -m "$(cat <<'EOF'
feat: widen game search to a 4-way DLsite/Steam/VNDB/All source picker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
