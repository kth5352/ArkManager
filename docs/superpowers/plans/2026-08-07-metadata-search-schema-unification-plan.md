# Metadata Search Schema Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the four near-identical DLsite/Steam/VNDB/getchu metadata-search IPC channels, request schemas, result DTOs, handlers, preload methods, and renderer hooks into one set parameterized by a `source` field, with zero behavior change.

**Architecture:** A single `METADATA_SEARCH` IPC channel replaces the four per-source channels. The request carries a `source: 'dlsite' | 'steam' | 'vndb' | 'getchu'` field; the main-process handler dispatches to the correct existing crawl function via a lookup table. One shared `MetadataSearchResultDto` replaces the four identical DTOs. The renderer's four hooks collapse into one `useSearchMetadata(source)` factory, called once per source at each existing call site — preserving independent per-source pending/error/data state for the "All" tab's parallel search.

**Tech Stack:** TypeScript strict, Zod (schema validation), Electron IPC (`ipcMain.handle`/`ipcRenderer.invoke`), TanStack Query (`useMutation`).

## Global Constraints

- Zero behavior change — this is a pure refactor. No new user-facing functionality, no change to search results, ordering, or error handling.
- No new test files. No existing test covers any of the five touched files' search-specific code, and none should be added (matches this app's existing precedent for these files, per the design spec's Testing section).
- The four crawl functions (`crawlDlsiteSearch`, `crawlSteamSearch`, `searchVndb`, `crawlGetchuSearch`) and their own local result types (`DlsiteSearchResult`, `SteamSearchResult`, `VndbSearchResult`, `GetchuSearchResult`, each `{code: GameCode, title: string, thumbnailUrl: string | null}`, defined in their own modules under `electron/main/metadata/`) are NOT touched — they are structurally compatible with the new shared `MetadataSearchResultDto` and are assigned into the new lookup table as-is.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Collapse the four search channels/schemas/DTOs/handler/preload/hooks into one

**Files:**
- Modify: `shared/types/ipc.ts` (channel constants block ~lines 3-50; schema/DTO block ~lines 234-276)
- Modify: `electron/main/ipc/metadataHandlers.ts` (full file, 122 lines)
- Modify: `electron/preload/index.ts` (import block ~lines 1-29; `metadata` namespace ~lines 120-146)
- Modify: `src/services/metadataService.ts` (full file, 81 lines)
- Modify: `src/pages/GameSearch/GameSearchPage.tsx` (import block, type declarations, hook calls; full file is 410 lines)

**Interfaces:**
- Produces: `MetadataSearchSourceSchema` (Zod enum), `MetadataSearchSource` (`'dlsite' | 'steam' | 'vndb' | 'getchu'`), `MetadataSearchRequestSchema` (Zod object `{source, query}`), `MetadataSearchRequest`, `MetadataSearchResultDto` (`{code: GameCode, title: string, thumbnailUrl: string | null}`) — all exported from `shared/types/ipc.ts`.
- Produces: `IPC_CHANNELS.METADATA_SEARCH` (replaces the four `METADATA_SEARCH_DLSITE`/`_VNDB`/`_STEAM`/`_GETCHU` constants).
- Produces: `window.api.metadata.search(source: MetadataSearchSource, query: string): Promise<MetadataSearchResultDto[]>` (replaces `searchDlsite`/`searchVndb`/`searchSteam`/`searchGetchu`).
- Produces: `useSearchMetadata(source: MetadataSearchSource)` in `src/services/metadataService.ts` (replaces `useSearchDlsite`/`useSearchVndb`/`useSearchSteam`/`useSearchGetchu`).
- This is the only task in this plan — all five files must change together since removing the old names and introducing the new ones is a single atomic change (the app cannot type-check in between).

- [ ] **Step 1: Update `shared/types/ipc.ts` — collapse channel constants**

Find this block (currently lines 32-35):

```ts
  METADATA_SEARCH_DLSITE: 'metadata:search-dlsite',
  METADATA_SEARCH_VNDB: 'metadata:search-vndb',
  METADATA_SEARCH_STEAM: 'metadata:search-steam',
  METADATA_SEARCH_GETCHU: 'metadata:search-getchu',
```

Replace with:

```ts
  METADATA_SEARCH: 'metadata:search',
```

- [ ] **Step 2: Update `shared/types/ipc.ts` — collapse request schemas and result DTOs**

Find this block (currently lines 234-276):

```ts
export const SearchDlsiteRequestSchema = z.object({
  query: z.string(),
})
export type SearchDlsiteRequest = z.infer<typeof SearchDlsiteRequestSchema>

export interface DlsiteSearchResultDto {
  code: z.infer<typeof GameCodeSchema>
  title: string
  thumbnailUrl: string | null
}

export const SearchVndbRequestSchema = z.object({
  query: z.string(),
})
export type SearchVndbRequest = z.infer<typeof SearchVndbRequestSchema>

export interface VndbSearchResultDto {
  code: z.infer<typeof GameCodeSchema>
  title: string
  thumbnailUrl: string | null
}

export const SearchSteamRequestSchema = z.object({
  query: z.string(),
})
export type SearchSteamRequest = z.infer<typeof SearchSteamRequestSchema>

export interface SteamSearchResultDto {
  code: z.infer<typeof GameCodeSchema>
  title: string
  thumbnailUrl: string | null
}

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

Replace with:

```ts
export const MetadataSearchSourceSchema = z.enum(['dlsite', 'steam', 'vndb', 'getchu'])
export type MetadataSearchSource = z.infer<typeof MetadataSearchSourceSchema>

export const MetadataSearchRequestSchema = z.object({
  source: MetadataSearchSourceSchema,
  query: z.string(),
})
export type MetadataSearchRequest = z.infer<typeof MetadataSearchRequestSchema>

export interface MetadataSearchResultDto {
  code: z.infer<typeof GameCodeSchema>
  title: string
  thumbnailUrl: string | null
}
```

- [ ] **Step 3: Update `electron/main/ipc/metadataHandlers.ts` — imports and search-function lookup table**

Find the import block (currently lines 3-15):

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
```

Replace with:

```ts
import {
  CrawlAndSaveMetadataRequestSchema,
  GetMetadataRequestSchema,
  GetManyMetadataRequestSchema,
  GetCoverImageRequestSchema,
  MetadataSearchRequestSchema,
  CrawlMissingMetadataRequestSchema,
  IPC_CHANNELS,
  type GameMetadataDto,
  type MetadataSearchSource,
  type MetadataSearchResultDto,
} from '../../../shared/types/ipc'
```

Then, immediately after the imports (currently line 30, before the `toDto` function at line 32), add:

```ts

const metadataSearchFns: Record<
  MetadataSearchSource,
  (query: string) => Promise<MetadataSearchResultDto[]>
> = {
  dlsite: crawlDlsiteSearch,
  steam: crawlSteamSearch,
  vndb: searchVndb,
  getchu: crawlGetchuSearch,
}
```

`crawlDlsiteSearch`, `crawlSteamSearch`, `searchVndb`, and `crawlGetchuSearch` are already imported at the top of this file (lines 17-20) and are unchanged — do not modify those import lines. Their return types (`DlsiteSearchResult[]`, `SteamSearchResult[]`, `VndbSearchResult[]`, `GetchuSearchResult[]`, each defined locally in their own module as `{code: GameCode, title: string, thumbnailUrl: string | null}`) are structurally identical to `MetadataSearchResultDto[]`, so this table assignment type-checks without any changes to those four crawl-function modules.

- [ ] **Step 4: Update `electron/main/ipc/metadataHandlers.ts` — collapse the four handler registrations**

Find this block (currently lines 95-113):

```ts
  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH_DLSITE, async (_event, payload: unknown) => {
    const { query } = SearchDlsiteRequestSchema.parse(payload)
    return crawlDlsiteSearch(query)
  })

  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH_VNDB, async (_event, payload: unknown) => {
    const { query } = SearchVndbRequestSchema.parse(payload)
    return searchVndb(query)
  })

  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH_STEAM, async (_event, payload: unknown) => {
    const { query } = SearchSteamRequestSchema.parse(payload)
    return crawlSteamSearch(query)
  })

  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH_GETCHU, async (_event, payload: unknown) => {
    const { query } = SearchGetchuRequestSchema.parse(payload)
    return crawlGetchuSearch(query)
  })
```

Replace with:

```ts
  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH, async (_event, payload: unknown) => {
    const { source, query } = MetadataSearchRequestSchema.parse(payload)
    return metadataSearchFns[source](query)
  })
```

- [ ] **Step 5: Update `electron/preload/index.ts` — imports**

Find the type-only import block (currently lines 2-29):

```ts
import {
  IPC_CHANNELS,
  type BulkCrawlProgressDto,
  type DeleteResultDto,
  type DlsiteSearchResultDto,
  type ExcludedEntryDto,
  type GameMetadataDto,
  type GameUserDataDto,
  type GameWithSavePathDto,
  type GetchuSearchResultDto,
  type LaunchConfigDto,
  type Library,
  type LibraryWithStatus,
  type Locale,
  type MediaSyncState,
  type MoveResultDto,
  type PersistedExplorerTab,
  type RenameResultDto,
  type SaveDiffEntryDto,
  type SaveSnapshotDto,
  type SortPage,
  type SortPreference,
  type SteamSearchResultDto,
  type Theme,
  type UpdateStatus,
  type VersionMismatchDto,
  type VndbSearchResultDto,
} from '../../shared/types/ipc'
```

Replace with (removing the four per-source DTO types, adding `MetadataSearchResultDto` and `MetadataSearchSource` in alphabetical position):

```ts
import {
  IPC_CHANNELS,
  type BulkCrawlProgressDto,
  type DeleteResultDto,
  type ExcludedEntryDto,
  type GameMetadataDto,
  type GameUserDataDto,
  type GameWithSavePathDto,
  type LaunchConfigDto,
  type Library,
  type LibraryWithStatus,
  type Locale,
  type MediaSyncState,
  type MetadataSearchResultDto,
  type MetadataSearchSource,
  type MoveResultDto,
  type PersistedExplorerTab,
  type RenameResultDto,
  type SaveDiffEntryDto,
  type SaveSnapshotDto,
  type SortPage,
  type SortPreference,
  type Theme,
  type UpdateStatus,
  type VersionMismatchDto,
} from '../../shared/types/ipc'
```

- [ ] **Step 6: Update `electron/preload/index.ts` — collapse the four search methods**

Find this block inside the `metadata` object (currently lines 129-136):

```ts
    searchDlsite: (query: string): Promise<DlsiteSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH_DLSITE, { query }),
    searchVndb: (query: string): Promise<VndbSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH_VNDB, { query }),
    searchSteam: (query: string): Promise<SteamSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH_STEAM, { query }),
    searchGetchu: (query: string): Promise<GetchuSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH_GETCHU, { query }),
```

Replace with:

```ts
    search: (source: MetadataSearchSource, query: string): Promise<MetadataSearchResultDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH, { source, query }),
```

- [ ] **Step 7: Update `src/services/metadataService.ts` — imports**

Find this block (currently lines 3-9):

```ts
import type {
  DlsiteSearchResultDto,
  GameMetadataDto,
  GetchuSearchResultDto,
  SteamSearchResultDto,
  VndbSearchResultDto,
} from '../../shared/types/ipc'
```

Replace with:

```ts
import type { GameMetadataDto, MetadataSearchResultDto, MetadataSearchSource } from '../../shared/types/ipc'
```

- [ ] **Step 8: Update `src/services/metadataService.ts` — collapse the four search hooks**

Find this block (currently lines 39-65):

```ts
export function useSearchDlsite() {
  return useMutation({
    mutationFn: (query: string): Promise<DlsiteSearchResultDto[]> =>
      window.api.metadata.searchDlsite(query),
  })
}

export function useSearchVndb() {
  return useMutation({
    mutationFn: (query: string): Promise<VndbSearchResultDto[]> =>
      window.api.metadata.searchVndb(query),
  })
}

export function useSearchSteam() {
  return useMutation({
    mutationFn: (query: string): Promise<SteamSearchResultDto[]> =>
      window.api.metadata.searchSteam(query),
  })
}

export function useSearchGetchu() {
  return useMutation({
    mutationFn: (query: string): Promise<GetchuSearchResultDto[]> =>
      window.api.metadata.searchGetchu(query),
  })
}
```

Replace with:

```ts
export function useSearchMetadata(source: MetadataSearchSource) {
  return useMutation({
    mutationFn: (query: string): Promise<MetadataSearchResultDto[]> =>
      window.api.metadata.search(source, query),
  })
}
```

- [ ] **Step 9: Update `src/pages/GameSearch/GameSearchPage.tsx` — imports**

Find this block (currently lines 5-23):

```ts
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
```

Replace with:

```ts
import {
  useCrawlGameMetadata,
  useGameCoverImage,
  useGameMetadata,
  useSearchMetadata,
} from '../../services/metadataService'
import { IndeterminateProgressBar } from '../../components/ui/progress-bar'
import { parseCodeInput } from '../DlsiteSearch/parseCodeInput'
import { useTranslation } from '../../i18n/useTranslation'
import type { GameCode } from '../../../shared/types/scanner'
import type { MetadataSearchResultDto } from '../../../shared/types/ipc'
```

- [ ] **Step 10: Update `src/pages/GameSearch/GameSearchPage.tsx` — drop the `SearchResult` union, use `MetadataSearchResultDto` directly**

Find this block (currently lines 25-35):

```ts
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
```

Replace with:

```ts
type SearchSource = 'all' | 'dlsite' | 'steam' | 'vndb' | 'getchu'
interface SourceSearchState {
  data: MetadataSearchResultDto[] | undefined
  isPending: boolean
  isError: boolean
}
```

Find this line (currently line 37):

```ts
function renderResultCard(result: SearchResult, onSelect: (result: SearchResult) => void) {
```

Replace with:

```ts
function renderResultCard(result: MetadataSearchResultDto, onSelect: (result: MetadataSearchResultDto) => void) {
```

Find this block (currently lines 68-74):

```ts
function renderSourceGroup(
  label: string,
  search: SourceSearchState,
  onSelect: (result: SearchResult) => void,
  searchingText: string,
  errorText: string
) {
```

Replace with:

```ts
function renderSourceGroup(
  label: string,
  search: SourceSearchState,
  onSelect: (result: MetadataSearchResultDto) => void,
  searchingText: string,
  errorText: string
) {
```

Find this line (currently line 131):

```ts
  const selectResult = (result: SearchResult): void => {
```

Replace with:

```ts
  const selectResult = (result: MetadataSearchResultDto): void => {
```

- [ ] **Step 11: Update `src/pages/GameSearch/GameSearchPage.tsx` — switch the four hook call sites**

Find this block (currently lines 114-117):

```ts
  const searchDlsite = useSearchDlsite()
  const searchSteam = useSearchSteam()
  const searchVndb = useSearchVndb()
  const searchGetchu = useSearchGetchu()
```

Replace with:

```ts
  const searchDlsite = useSearchMetadata('dlsite')
  const searchSteam = useSearchMetadata('steam')
  const searchVndb = useSearchMetadata('vndb')
  const searchGetchu = useSearchMetadata('getchu')
```

No other line in this file references `SearchResult`, `useSearchDlsite`, `useSearchVndb`, `useSearchSteam`, `useSearchGetchu`, or any of the four removed DTO type names — `renderResultCard`, `renderSourceGroup`, `handleSearch`, `selectResult`'s body, and every `.data`/`.isPending`/`.isError` read on `searchDlsite`/`searchSteam`/`searchVndb`/`searchGetchu`/`activeSearch` continue to work unchanged since they were already only using the shared shape structurally.

- [ ] **Step 12: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors. If any error remains referencing one of the removed names (`SearchDlsiteRequestSchema`, `DlsiteSearchResultDto`, `searchDlsite` on the preload API, etc.), it means a reference outside the five files above was missed — search for it with a project-wide text search and update it; the design spec's earlier grep confirmed no such references existed outside these five files at design time, but confirm again since other work may have landed since.

- [ ] **Step 13: Lint**

Run: `npm run lint`
Expected: no new errors or warnings compared to the pre-task baseline (run `npm run lint` once before Step 1 if you want a baseline to diff against; this repo's baseline going into this task is 2 pre-existing problems, both unrelated to metadata search — 1 `react-hooks/refs` error in `AppLayout.tsx`, 1 `react-refresh` warning in `button.tsx`).

- [ ] **Step 14: Manual verification via `npm run dev`**

Run: `npm run dev`

In the running app, navigate to the Game Search page and verify, with the devtools console open (no new console errors should appear during any of this):

1. Search a title on each of the four single-source tabs (DLsite, Steam, VNDB, getchu) individually — each returns results (or "no results" / error text) exactly as before.
2. Switch to the "All" tab and search a title — all four sources' groups render independently (a slow one doesn't block the others), matching prior behavior.
3. Click a result card (from any tab) — the crawl-and-save flow runs and displays metadata + cover image, same as before.
4. Enter a direct code (e.g. an RJ code) in the search box from any tab — it resolves the same way regardless of which tab is active, same as before.

- [ ] **Step 15: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/metadataHandlers.ts electron/preload/index.ts src/services/metadataService.ts src/pages/GameSearch/GameSearchPage.tsx
git commit -m "$(cat <<'EOF'
refactor: unify DLsite/Steam/VNDB/getchu metadata search into one channel

Collapses four byte-identical search request schemas, result DTOs, IPC
channels, handlers, preload methods, and renderer hooks into one set
parameterized by a source field. No behavior change - this was a
deferred cleanup item flagged three times across prior sub-projects.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** All five files and every code block from the design spec are covered by Steps 1-11. Testing section covered by Steps 12-14 (typecheck/lint/manual — no new test files, matching the spec's explicit instruction). Out-of-scope items (sidebar, redo bug, crawl-function internals) are not touched by any step.
- **Placeholder scan:** No TBD/TODO; every step contains complete, literal code.
- **Type consistency:** `MetadataSearchSource`, `MetadataSearchRequestSchema`, `MetadataSearchResultDto`, and `useSearchMetadata` are named identically everywhere they're produced (Steps 1-2) and consumed (Steps 3-11).
