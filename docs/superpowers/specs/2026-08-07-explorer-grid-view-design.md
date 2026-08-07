# Explorer: Grid View — Design

## Goal

Explorer only ever renders as a single-column list. This adds a grid view (thumbnail-forward cards, matching Gallery's existing grid pattern) as a second, per-tab-selectable display mode — closing the "그리드/사이드바" item of the original Explorer-overhaul wishlist. The folder-tree sidebar navigation panel from the same wishlist item is a separate, deliberately deferred sub-project (confirmed with the user: grid ships first).

## Scope

Third and final Explorer sub-project (visual polish + multi-select and drag-and-drop move already shipped) — the last item in the entire v1.0.2 backlog. Touches: `electron/main/database/schema.ts` + `client.ts` (a new persisted column), `electron/main/database/explorerTabsRepository.ts`, `shared/types/ipc.ts`, `src/services/explorerTabsService.ts`, `src/stores/explorerStore.ts`, `src/hooks/useExplorerTabsPersistence.ts`, `src/pages/Explorer/FolderView.tsx` (a new grid rendering path alongside the existing list one), `src/components/layout/PageToolbar.tsx` (a view-mode toggle button, following its existing conditional-zoom-slider pattern). **Explicitly not in scope:** the folder-tree sidebar (a future sub-project), any change to Gallery/List/DetailList, and grid support for Explorer's recursive-search results (confirmed with the user: search results always render as a list regardless of the tab's view mode, since a compact grid card has no room for the relative-path context a search result needs).

## 1. Data model — view mode is a per-tab, persisted setting

Per the user's explicit choice, view mode is remembered **per tab**, not app-wide — tab A can be in grid view while tab B stays list, and this survives an app restart exactly like each tab's own path already does.

- `electron/main/database/client.ts`: add `view_mode TEXT NOT NULL DEFAULT 'list'` to the `explorer_tabs` `CREATE TABLE IF NOT EXISTS` DDL, and add it to the existing `ensureColumns(sqlite, 'explorer_tabs', [...])` backfill list (this project's established pattern for adding a column an existing install's table won't have yet — confirmed via `client.ts`'s own comment documenting several prior columns added this exact way).
- `electron/main/database/schema.ts`: add `viewMode: text('view_mode').notNull().default('list')` to the `explorerTabs` Drizzle table definition, matching the DDL above.
- `electron/main/database/explorerTabsRepository.ts`: `PersistedExplorerTab` gains `viewMode: 'list' | 'grid'`.
- `shared/types/ipc.ts`: the explorer-tabs save request schema gains the same field.
- `src/stores/explorerStore.ts`: `ExplorerTab` gains `viewMode: 'list' | 'grid'` (new tabs default to `'list'`, via `addTab`'s existing shape). A new store action `setViewMode(tabId: string, mode: 'list' | 'grid'): void` updates just that tab's field.
- `src/hooks/useExplorerTabsPersistence.ts`: its load/save mapping (`{ id, label, path }` today) includes `viewMode` in both directions.

## 2. Grid rendering

`FolderView.tsx` receives the active tab's `viewMode` (passed down from `ExplorerPage.tsx`, same as `path`/`tabId` today) and branches its normal-browsing render (not the search-results one, which per Scope always stays list) between the existing `<ul>` of `FolderEntryRow`s and a new grid of cards, reusing Gallery's established `react-window` `Grid` + `AutoSizer` virtualization pattern rather than inventing a new one.

The card mirrors Gallery's `GameCard` structure — a large thumbnail/icon area with the name (and, for a coded entry, its code) below — but stays within Explorer's already-established "light" density (from the visual-polish sub-project): no favorite/rating/playtime/genre badges, just what `EntryIcon` already renders (game thumbnail with a kind badge for coded entries, a large folder/file/archive icon otherwise) at card scale instead of row scale. `SelectionCheckbox`, the long-press-to-select gesture, and the existing `useDraggable`/`useDroppable` wiring all attach to the grid card exactly as they do to the list row today — switching view modes never changes what a user can do, only how it's laid out. A zoom slider (same `PageToolbar` slider component and `0.6`–`1.8` range Gallery already uses) scales card size, per the user's choice to keep this consistent with Gallery's own grid.

## 3. Toggle UI

`PageToolbar.tsx` gains a new optional `viewMode`/`onViewModeChange` prop pair, following the exact pattern its existing optional `zoom`/`onZoomChange` pair already uses (rendered only when both are provided — Gallery/List never pass them, only Explorer will). A small icon button toggles between list and grid; the zoom slider only renders when the active tab is in grid mode (matching Gallery's own "zoom only makes sense in grid" precedent).

## Testing

No test infrastructure exists for this app's components (established precedent, unchanged) — the grid rendering and toggle UI are verified live via `npm run dev`. The one real piece of new logic, `ensureColumns`' backfill for the new `view_mode` column, follows an already-proven pattern with no new test needed for the column addition itself; `explorerStore`'s new `setViewMode` action gets a real unit test (`explorerStore.test.ts` already covers this store's other actions the same way — confirm the tab's `viewMode` updates and no other tab's does).
