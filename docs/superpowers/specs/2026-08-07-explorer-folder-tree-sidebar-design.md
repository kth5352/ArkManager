# Explorer Folder-Tree Sidebar — Design

## Background

Explorer's original scope had three pieces: visual polish + multi-select, drag-and-drop move, and grid/sidebar view modes. The first two shipped; grid view shipped most recently, with the sidebar deliberately deferred (not cancelled) per the user's own "grid first" choice during that sub-project's brainstorming. This is that deferred piece — the second of three items surfaced by a session-wide audit of postponed work (the first, metadata search schema unification, already shipped).

The sidebar is a folder-tree navigation panel: one root node per registered library, expandable to browse the filesystem hierarchy without leaving the current tab. It is a new component, distinct from `AppLayout.tsx`'s existing `Sidebar.tsx` (the app's page-level navigation — Gallery/List/Explorer/etc.) and from `DetailSidebar.tsx` (the per-game detail panel) — naming in code must avoid colliding with either.

## Scope Decisions (confirmed with the user)

- **Single global tree, not per-tab.** Explorer's `viewMode` is per-tab (each tab remembers its own list/grid choice), but the sidebar is one shared panel regardless of which tab is active — clicking a node navigates whichever tab is currently active.
- **Auto-sync.** Switching tabs or navigating within a tab (breadcrumb clicks, drilling into a subfolder) automatically expands the sidebar to reveal and highlight the active tab's current path.
- **Collapsible, state remembered.** A toolbar toggle button shows/hides the sidebar; open/closed state and width persist across restarts (app-wide, like the existing `DetailSidebar` width).
- **Drag-and-drop move target.** Dragging an entry from the main pane onto a sidebar tree node moves it there, reusing `ExplorerPage.tsx`'s existing `DndContext`/`pointerWithin`/library-boundary-gating logic as-is.
- **Light density.** Folder name + expand arrow only — no file-count badges, no thumbnails. Matches Explorer's established light-density precedent (`FolderEntryRow`/`FolderEntryCard` already carry no favorite/rating/playtime badges).

## Architecture

**New component:** `src/pages/Explorer/ExplorerSidebar.tsx`, rendered in `ExplorerPage.tsx` as a sibling to `TabBar`/`FolderView`, inside the existing `DndContext` (not a second one).

**Tree data:** Root nodes come from `useLibraries()` (already used by `ExplorerPage.tsx`) — one per `LibraryWithStatus`. A library with `exists: false` renders dimmed and non-expandable, matching the "warn when path deleted" treatment already established elsewhere (Settings page).

**Lazy expansion:** A folder node's children are fetched only when first expanded, reusing the existing `useFolderScan(path)` hook (`src/services/scannerService.ts`) filtered client-side to `kind === 'folder'`. This hook's React Query cache key is `['folder-scan', path]` — the same key `FolderView.tsx`'s main pane already uses for the identical path, so expanding a tree node and browsing to that folder in the main pane share one cache entry. Rejected alternative: eagerly recursive-scanning an entire library upfront to build the whole tree in memory — `useFolderScanRecursive`'s own comment already documents this as the most expensive scan this app performs, wrong tradeoff for a navigation aid that's often left collapsed.

**Expand state:** A `Set<string>` of expanded folder paths, held as local component state in `ExplorerSidebar.tsx` — not persisted. Resets each session/restart (unlike tab persistence, remembering exactly which nodes were expanded has little value and would need new persistence plumbing for a low-value feature).

**Auto-sync to active tab:** An effect watching `activeTab.path` that (a) computes the ancestor-path chain from the matching library root down to the current path and merges those into the expanded-paths set, and (b) tracks the current path separately for highlighting the matching tree row. Mirrors the existing pattern of deriving breadcrumb segments from a path (`pathToBreadcrumbSegments` in `breadcrumb.ts`) — reuses that helper to compute the ancestor chain rather than re-deriving path-splitting logic.

**Open/closed + width persistence:** Two new `SettingKeySchema` values, `'explorer-tree-open'` and `'explorer-tree-width'`, following the exact pattern `'sidebar-width'` already established (generic `settings:get`/`settings:set` IPC, a `use<X>Query`/`useSet<X>Mutation` pair in `src/services/settingsService.ts`). `explorer-tree-open` stores `'true'`/`'false'` as a string (parsed on read, default `'true'`); `explorer-tree-width` stores a number-as-string, clamped through a new `clampExplorerTreeWidth` following `clampSidebarWidth.ts`'s exact shape (min/max/default constants + a clamp function) — a separate constant/function from `DetailSidebar`'s, since the two panels have independent, unrelated width preferences.

**Resize handle:** Mirrors `DetailSidebar.tsx`'s pointer-drag resize handle exactly (`onPointerDown` → `setPointerCapture` → track `pointermove`/`pointerup`/`pointercancel` → clamp → mutate on release). Sidebar is on the left edge of the content area (opposite side from `DetailSidebar`, which sits on the right), so the resize handle sits on the sidebar's right edge instead of its left.

**Drag-and-drop:** Each expanded tree node's row becomes a `useDroppable` target (`id: node.path`, `data: { type: 'folder-entry', path: node.path } satisfies ExplorerDropData` — the exact same `ExplorerDropData` shape `FolderEntryRow`/`BreadcrumbSegmentButton` already produce, so `ExplorerPage.tsx`'s existing `handleDragEnd` needs no changes at all to also accept sidebar drops). Root (library) nodes are also droppable the same way. Tree nodes are not drag sources — dragging always originates from the main pane, never from the sidebar.

**Click-to-navigate:** Clicking any folder node's label calls the same `onNavigate` callback `ExplorerPage.tsx` already passes into `FolderView` (`(path) => navigateTab(activeTab.id, path)`) — `ExplorerSidebar` receives this as a prop from `ExplorerPage.tsx`, not a separate implementation.

## Component Structure

```
ExplorerSidebar.tsx
├── SidebarTreeNode (recursive, one per folder — library roots use it too, with kind='library')
│   ├── expand/collapse chevron (only if kind==='library' or the node is a known folder)
│   ├── droppable wrapper (useDroppable, same ExplorerDropData shape as elsewhere)
│   ├── label button (click → onNavigate)
│   └── children: SidebarTreeNode[] (only rendered while expanded, fetched via useFolderScan)
├── resize handle (mirrors DetailSidebar's pointer-drag handle, opposite edge)
└── (toggle button lives in PageToolbar.tsx, not inside this component — see below)
```

**Toolbar toggle:** `PageToolbar.tsx` gets a new optional `sidebarOpen`/`onSidebarOpenChange` prop pair, following the exact conditional-rendering pattern its existing `zoom`/`onZoomChange` and (from the grid-view sub-project) `viewMode`/`onViewModeChange` pairs already use — only `FolderView.tsx` passes these (via props threaded from `ExplorerPage.tsx`), Gallery/List never do.

## Data Flow

1. `ExplorerPage.tsx` reads `explorer-tree-open`/`explorer-tree-width` via the new settings hooks, and `useLibraries()` (already reads this).
2. Renders `ExplorerSidebar` (if open) as a flex sibling before `TabBar`+`FolderView`'s container, inside the existing `DndContext`.
3. `ExplorerSidebar` renders one root node per library; each node lazily fetches its own children via `useFolderScan` on first expand.
4. Clicking a node calls `onNavigate(path)`, which calls `navigateTab(activeTab.id, path)` — identical to a breadcrumb click today.
5. An effect in `ExplorerSidebar` watches `activeTab.path`, expands the ancestor chain, and marks the matching row highlighted.
6. Dropping a dragged entry on a tree node's droppable is handled entirely by `ExplorerPage.tsx`'s existing `handleDragEnd` — no new drop-handling code path, just a new droppable ID source.

## Error Handling

- Library `exists: false`: root node dimmed, non-expandable, no droppable (matches "can't drop into a place that isn't there").
- A folder's `useFolderScan` erroring (deleted/unmounted mid-browse) mid-expand: node shows an inline error state (small text, no crash), matching `FolderView.tsx`'s own `isError` → `explorer.cannotAccessFolder` treatment for the main pane.
- Active tab's path outside every registered library (can happen via the Move dialog's arbitrary-destination flow leaving a tab there, or a stale persisted path): auto-sync simply finds no matching root and highlights nothing — no error state needed, this is a normal "nothing to highlight" case.

## Testing

Matches this project's established Explorer-feature precedent: no new component tests (no test infra exists for Explorer's UI components — `FolderEntryRow`/`FolderEntryCard`/grid rendering were all verified manually, not unit-tested). The one new piece of pure logic — `clampExplorerTreeWidth` — gets a unit test mirroring `clampSidebarWidth.test.ts`'s exact structure. Everything else (expand/collapse, auto-sync, drag-and-drop-onto-tree-node, click-to-navigate, persistence) is verified manually via `npm run dev`.

## Out of Scope

- Per-tab sidebars or per-tab expand state (explicitly rejected — single global tree).
- Persisting which nodes are expanded across restarts.
- File-count badges, thumbnails, or any content beyond folder name + expand arrow.
- Renaming/deleting/moving folders from within the tree itself (context-menu actions) — the tree is navigation + drop-target only; those actions remain in the main pane's existing `GameEntryContextMenu` flow.
- Search integration — the sidebar does not filter or highlight based on Explorer's existing search box; it only tracks the active tab's browsing path.
