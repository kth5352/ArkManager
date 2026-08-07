# Explorer Folder-Tree Sidebar — Design

## Background

Explorer's original scope had three pieces: visual polish + multi-select, drag-and-drop move, and grid/sidebar view modes. The first two shipped; grid view shipped most recently, with the sidebar deliberately deferred (not cancelled) per the user's own "grid first" choice during that sub-project's brainstorming. This is that deferred piece — the second of three items surfaced by a session-wide audit of postponed work (the first, metadata search schema unification, already shipped).

The sidebar is a folder-tree navigation panel, rooted at the active tab's current drive, expandable to browse the filesystem hierarchy without leaving the current tab. It is a new component, distinct from `AppLayout.tsx`'s existing `Sidebar.tsx` (the app's page-level navigation — Gallery/List/Explorer/etc.) and from `DetailSidebar.tsx` (the per-game detail panel) — naming in code must avoid colliding with either.

## Scope Decisions (confirmed with the user)

> **Revision (2026-08-07, after Task 1/2 shipped):** The original design rooted the tree at one node per registered library. Live-testing the shipped Task 2 surfaced that this doesn't match what a folder-tree sidebar should do in this app — the user wants the sidebar to behave like a real OS file-explorer tree, rooted at whichever **drive** the active tab's current path is on, not restricted to registered library folders. Registered libraries now appear as ordinary folders within that drive's tree, with no special treatment. This is consistent with Explorer's existing navigation model: breadcrumbs already let you navigate above a library root to the bare drive letter (`pathToBreadcrumbSegments` has always supported this), and `scanFolderShallow` has never been restricted to library paths — only drag-and-drop *move* targets are library-gated, as a deliberate safety net, not a navigation restriction. The "Architecture" section below reflects the revised design; the single-global-tree/collapsible/drag-and-drop/light-density decisions below are unchanged.

- **Single global tree, not per-tab.** Explorer's `viewMode` is per-tab (each tab remembers its own list/grid choice), but the sidebar is one shared panel regardless of which tab is active — clicking a node navigates whichever tab is currently active.
- **Auto-sync.** Switching tabs or navigating within a tab (breadcrumb clicks, drilling into a subfolder) automatically expands the sidebar to reveal and highlight the active tab's current path.
- **Collapsible, state remembered.** A toolbar toggle button shows/hides the sidebar; open/closed state and width persist across restarts (app-wide, like the existing `DetailSidebar` width).
- **Drag-and-drop move target.** Dragging an entry from the main pane onto a sidebar tree node moves it there, reusing `ExplorerPage.tsx`'s existing `DndContext`/`pointerWithin`/library-boundary-gating logic as-is.
- **Light density.** Folder name + expand arrow only — no file-count badges, no thumbnails. Matches Explorer's established light-density precedent (`FolderEntryRow`/`FolderEntryCard` already carry no favorite/rating/playtime badges).

## Architecture

**New component:** `src/pages/Explorer/ExplorerSidebar.tsx`, rendered in `ExplorerPage.tsx` as a sibling to `TabBar`/`FolderView`, inside the existing `DndContext` (not a second one).

**Tree data (revised):** The tree has a single root — the drive of the active tab's current path (e.g. `C:\`), derived via `pathToBreadcrumbSegments(activePath)[0].path` (that helper already special-cases a bare drive letter as its own root segment). When no tab is open, the root falls back to the first registered library's own drive (`useLibraries()`, so the sidebar still has something to click before a first tab exists); when there are neither, the sidebar shows an empty-state message instead of a tree. Registered libraries are not otherwise distinguished in the tree — they render as plain folders like any other. There is no "disabled/dimmed" node concept anymore (that existed only for a non-existent *library*'s root in the original design); an unreadable folder anywhere in the tree instead shows the same inline error state already used for a failed expansion (see Error Handling below), discovered reactively on expand rather than pre-checked.

**Lazy expansion:** A folder node's children are fetched only when first expanded, reusing the existing `useFolderScan(path)` hook (`src/services/scannerService.ts`) filtered client-side to `kind === 'folder'`. This hook's React Query cache key is `['folder-scan', path]` — the same key `FolderView.tsx`'s main pane already uses for the identical path, so expanding a tree node and browsing to that folder in the main pane share one cache entry. Rejected alternative: eagerly recursive-scanning an entire library upfront to build the whole tree in memory — `useFolderScanRecursive`'s own comment already documents this as the most expensive scan this app performs, wrong tradeoff for a navigation aid that's often left collapsed.

**Expand state:** A `Set<string>` of expanded folder paths, held as local component state in `ExplorerSidebar.tsx` — not persisted. Resets each session/restart (unlike tab persistence, remembering exactly which nodes were expanded has little value and would need new persistence plumbing for a low-value feature).

**Auto-sync to active tab (now load-bearing, not just polish):** Since the root itself is derived from `activeTab.path`, an effect watching that value both selects the root drive AND expands every ancestor folder between it and the current path (inclusive of the current path itself, so its own children are fetched too — matching normal file-tree "navigate into" behavior), plus highlights the matching row. Reuses `pathToBreadcrumbSegments` (`breadcrumb.ts`) for both the root-drive derivation (its first segment) and the ancestor chain (its full segment list) — one helper, two uses, no bespoke path-splitting logic.

**Open/closed + width persistence:** Two new `SettingKeySchema` values, `'explorer-tree-open'` and `'explorer-tree-width'`, following the exact pattern `'sidebar-width'` already established (generic `settings:get`/`settings:set` IPC, a `use<X>Query`/`useSet<X>Mutation` pair in `src/services/settingsService.ts`). `explorer-tree-open` stores `'true'`/`'false'` as a string (parsed on read, default `'true'`); `explorer-tree-width` stores a number-as-string, clamped through a new `clampExplorerTreeWidth` following `clampSidebarWidth.ts`'s exact shape (min/max/default constants + a clamp function) — a separate constant/function from `DetailSidebar`'s, since the two panels have independent, unrelated width preferences.

**Resize handle:** Mirrors `DetailSidebar.tsx`'s pointer-drag resize handle exactly (`onPointerDown` → `setPointerCapture` → track `pointermove`/`pointerup`/`pointercancel` → clamp → mutate on release). Sidebar is on the left edge of the content area (opposite side from `DetailSidebar`, which sits on the right), so the resize handle sits on the sidebar's right edge instead of its left.

**Drag-and-drop:** Every tree node's row (root included) becomes a `useDroppable` target (`id: node.path`, `data: { type: 'folder-entry', path: node.path } satisfies ExplorerDropData` — the exact same `ExplorerDropData` shape `FolderEntryRow`/`BreadcrumbSegmentButton` already produce, so `ExplorerPage.tsx`'s existing `handleDragEnd` needs no changes at all to also accept sidebar drops). A drop outside every registered library is still silently rejected by that handler's existing `findLibraryForPath` safety net regardless of the node's own droppable state — no per-node library-membership gating is needed in the tree itself. Tree nodes are not drag sources — dragging always originates from the main pane, never from the sidebar.

**Click-to-navigate:** Clicking any folder node's label calls the same `onNavigate` callback `ExplorerPage.tsx` already passes into `FolderView` (`(path) => navigateTab(activeTab.id, path)`) — `ExplorerSidebar` receives this as a prop from `ExplorerPage.tsx`, not a separate implementation.

## Component Structure

```
ExplorerSidebar.tsx
├── one root TreeNode (path = getDriveRoot(activePath ?? firstLibrary?.path))
│   └── TreeNode (recursive, same component for every depth including root)
│       ├── expand/collapse chevron
│       ├── droppable wrapper (useDroppable, same ExplorerDropData shape as elsewhere)
│       ├── label button (click → onNavigate), highlighted when path === activePath
│       └── children: TreeNode[] (only rendered while expanded, fetched via useFolderScan)
├── resize handle (mirrors DetailSidebar's pointer-drag handle, opposite edge)
└── (toggle button lives in PageToolbar.tsx, not inside this component — see below)
```

**Toolbar toggle:** `PageToolbar.tsx` gets a new optional `sidebarOpen`/`onSidebarOpenChange` prop pair, following the exact conditional-rendering pattern its existing `zoom`/`onZoomChange` and (from the grid-view sub-project) `viewMode`/`onViewModeChange` pairs already use — only `FolderView.tsx` passes these (via props threaded from `ExplorerPage.tsx`), Gallery/List never do.

## Data Flow

1. `ExplorerPage.tsx` reads `explorer-tree-open`/`explorer-tree-width` via the new settings hooks, and passes `activeTab?.path` down as `ExplorerSidebar`'s `activePath` prop.
2. Renders `ExplorerSidebar` (if open) as a flex sibling before `TabBar`+`FolderView`'s container, inside the existing `DndContext`.
3. `ExplorerSidebar` derives its single root from `activePath` (or the first library's drive as a fallback, or nothing); the root `TreeNode` and every expanded descendant lazily fetch their own children via `useFolderScan` on first expand.
4. Clicking a node calls `onNavigate(path)`, which calls `navigateTab(activeTab.id, path)` — identical to a breadcrumb click today.
5. An effect in `ExplorerSidebar` watches `activePath`, expands the ancestor chain (root through the active path inclusive), and marks the matching row highlighted.
6. Dropping a dragged entry on a tree node's droppable is handled entirely by `ExplorerPage.tsx`'s existing `handleDragEnd` — no new drop-handling code path, just a new droppable ID source.

## Error Handling

- A folder's `useFolderScan` erroring (deleted/unmounted mid-browse, or an unreadable system folder encountered while browsing the full drive tree) mid-expand: node shows an inline error state (small text, no crash), matching `FolderView.tsx`'s own `isError` → `explorer.cannotAccessFolder` treatment for the main pane. This is now also how an invalid root (e.g. a since-unplugged drive) surfaces — no upfront existence check, discovered reactively on expand.
- No active tab and no registered libraries: nothing to derive a root from — the sidebar shows a short empty-state message instead of a tree.
- A drop resolving outside every registered library: silently rejected by `ExplorerPage.tsx`'s existing `findLibraryForPath` safety net, same as any other drop target in this app — no sidebar-specific handling needed.

## Testing

Matches this project's established Explorer-feature precedent: no new component tests (no test infra exists for Explorer's UI components — `FolderEntryRow`/`FolderEntryCard`/grid rendering were all verified manually, not unit-tested). The one new piece of pure logic — `clampExplorerTreeWidth` — gets a unit test mirroring `clampSidebarWidth.test.ts`'s exact structure. Everything else (expand/collapse, auto-sync, drag-and-drop-onto-tree-node, click-to-navigate, persistence) is verified manually via `npm run dev`.

## Out of Scope

- Per-tab sidebars or per-tab expand state (explicitly rejected — single global tree).
- Persisting which nodes are expanded across restarts.
- File-count badges, thumbnails, or any content beyond folder name + expand arrow.
- Renaming/deleting/moving folders from within the tree itself (context-menu actions) — the tree is navigation + drop-target only; those actions remain in the main pane's existing `GameEntryContextMenu` flow.
- Search integration — the sidebar does not filter or highlight based on Explorer's existing search box; it only tracks the active tab's browsing path.
