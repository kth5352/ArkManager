# Metadata Search Schema Unification — Design

## Background

DLsite, Steam, VNDB, and getchu title search each got their own IPC channel,
request schema, result DTO, main-process handler, preload method, and
renderer hook, added incrementally across three separate sub-projects (VNDB
integration, unified game search adding Steam, getchu search). At every
layer the four are byte-identical except for which crawl function the
handler calls:

- Request schemas: all `{ query: z.string() }`
- Result DTOs: all `{ code: GameCode, title: string, thumbnailUrl: string | null }`
- Handlers: all `const { query } = SearchXRequestSchema.parse(payload); return crawlXSearch(query)`
- Preload methods: all `(query) => ipcRenderer.invoke(CHANNEL_X, { query })`
- Renderer hooks: all `useMutation({ mutationFn: (query) => window.api.metadata.searchX(query) })`

This duplication was flagged as worth collapsing by the VNDB sub-project's
own final review, and explicitly deferred two more times (Steam addition,
getchu addition) as out of scope for the feature that was shipping at the
time. This sub-project is that deferred cleanup, picked up as part of a
session-wide audit of postponed items. It is a pure refactor: no behavior
change, no new user-facing functionality.

`src/pages/GameSearch/GameSearchPage.tsx` already partially unifies
consumption of the four results via a `SearchResult` union type and shared
`renderResultCard`/`renderSourceGroup` helpers — that pattern exists
precisely because the four DTOs are structurally identical. This cleanup
addresses the duplication one layer down, in the channel/schema/handler/hook
definitions themselves.

## Scope

Full collapse to a single channel, per the user's explicit choice among
three presented options (types-only, types+factories, full channel
collapse).

## Design

**`shared/types/ipc.ts`**
- Replace `METADATA_SEARCH_DLSITE` / `_VNDB` / `_STEAM` / `_GETCHU` (4
  channel constants) with one: `METADATA_SEARCH: 'metadata:search'`
- Replace `SearchDlsiteRequestSchema` / `SearchVndbRequestSchema` /
  `SearchSteamRequestSchema` / `SearchGetchuRequestSchema` (4 schemas) with:
  ```ts
  export const MetadataSearchSourceSchema = z.enum(['dlsite', 'steam', 'vndb', 'getchu'])
  export type MetadataSearchSource = z.infer<typeof MetadataSearchSourceSchema>

  export const MetadataSearchRequestSchema = z.object({
    source: MetadataSearchSourceSchema,
    query: z.string(),
  })
  export type MetadataSearchRequest = z.infer<typeof MetadataSearchRequestSchema>
  ```
- Replace `DlsiteSearchResultDto` / `VndbSearchResultDto` /
  `SteamSearchResultDto` / `GetchuSearchResultDto` (4 identical interfaces)
  with one:
  ```ts
  export interface MetadataSearchResultDto {
    code: z.infer<typeof GameCodeSchema>
    title: string
    thumbnailUrl: string | null
  }
  ```

**`electron/main/ipc/metadataHandlers.ts`**
- Replace the 4 `ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH_X, ...)`
  registrations with one, dispatching via a lookup table:
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

  ipcMain.handle(IPC_CHANNELS.METADATA_SEARCH, async (_event, payload: unknown) => {
    const { source, query } = MetadataSearchRequestSchema.parse(payload)
    return metadataSearchFns[source](query)
  })
  ```

**`electron/preload/index.ts`**
- Replace `searchDlsite` / `searchVndb` / `searchSteam` / `searchGetchu` (4
  methods) with one:
  ```ts
  search: (source: MetadataSearchSource, query: string): Promise<MetadataSearchResultDto[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.METADATA_SEARCH, { source, query }),
  ```

**`src/services/metadataService.ts`**
- Replace `useSearchDlsite` / `useSearchVndb` / `useSearchSteam` /
  `useSearchGetchu` (4 hooks) with one factory:
  ```ts
  export function useSearchMetadata(source: MetadataSearchSource) {
    return useMutation({
      mutationFn: (query: string): Promise<MetadataSearchResultDto[]> =>
        window.api.metadata.search(source, query),
    })
  }
  ```
  Call sites invoke this 4 times with different `source` arguments, each an
  independent `useMutation` instance — preserving the existing requirement
  that the "All" tab fires all four searches in parallel with independent
  pending/error/data state per source.

**`src/pages/GameSearch/GameSearchPage.tsx`**
- Drop the `SearchResult` union type and the `DlsiteSearchResultDto` /
  `GetchuSearchResultDto` / `SteamSearchResultDto` / `VndbSearchResultDto`
  imports; use `MetadataSearchResultDto` directly everywhere `SearchResult`
  was used (in `SourceSearchState`, `renderResultCard`, `renderSourceGroup`,
  and the `selectResult`/`activeSearch` local variables).
- Replace `useSearchDlsite()` / `useSearchSteam()` / `useSearchVndb()` /
  `useSearchGetchu()` call sites with `useSearchMetadata('dlsite')` /
  `useSearchMetadata('steam')` / `useSearchMetadata('vndb')` /
  `useSearchMetadata('getchu')`.
- No other logic in this file changes — `renderResultCard`,
  `renderSourceGroup`, `handleSearch`, `selectResult`, and all the
  pending/error/data derivations already operate on the shared shape and are
  untouched.

## Testing

No existing test file covers any of the five touched files' search-specific
code (`metadataHandlers.ts`, `preload/index.ts`, `metadataService.ts`, and
`GameSearchPage.tsx` have no test files; `shared/types/ipc.ts` has none
either). This matches the project's existing precedent — the four search
paths have never had automated tests, verified manually via `npm run dev`
when each was added. Verification here is the same: run the app, exercise
all four single-source tabs and the "All" tab (parallel search across all
four), and the crawl-and-save flow that follows selecting a result, and
confirm identical behavior to before the change. No new tests are needed
since no new behavior is introduced.

## Out of scope

- The Explorer folder-tree sidebar and the drag-and-drop multi-group
  undo/redo bug — both separately tracked, not part of this cleanup.
- Any behavior change to search results, ordering, or error handling.
- Collapsing `crawlDlsiteSearch` / `searchVndb` / `crawlSteamSearch` /
  `crawlGetchuSearch` themselves — these remain genuinely different
  per-source scraping/API implementations, not duplicated boilerplate.
