# Explorer: Drag-and-Drop Move + Undo — Design

## Goal

Explorer's only way to move an entry today is the right-click "이동" (Move) dialog — pick a destination via an OS folder picker, confirm, done. This adds a faster, direct alternative: drag a row (or the current multi-selection) onto a folder row, a breadcrumb segment, or another open tab to move it there. Because a mis-drop is easy and consequential, this also adds a single-level Ctrl+Z undo that covers every move in the app, not just drag-and-drop ones — both mechanisms funnel through the same `useMoveEntries()` mutation, so hooking undo there covers the existing dialog/toolbar move flow for free.

## Scope

Second of three Explorer sub-projects (visual polish + multi-select already shipped → this → grid/sidebar view modes next), second-to-last item in the v1.0.2 backlog. Touches: `src/pages/Explorer/ExplorerPage.tsx`, `FolderView.tsx`, `TabBar.tsx`, `breadcrumb.ts`/its render site, `src/services/fileOpsService.ts`, `src/components/layout/AppLayout.tsx`, a new `src/stores/lastMoveStore.ts`. **Explicitly not in scope:** dragging a file out of Explorer onto the OS desktop/another app, or dragging a file in from the OS file explorer (both would need Electron's `webContents.startDrag`, a completely different mechanism from the in-app `@dnd-kit` drag this spec covers) — confirmed with the user, in-app only. Also not in scope: multi-level undo/redo history (single most-recent move only), and reordering entries within a folder (no ordering concept exists for folder contents beyond the sort field).

## 1. Architecture

A new `DndContext` is added at the `ExplorerPage` level (wrapping both `TabBar` and `FolderView` — a tab is a valid drop target, so the context can't be scoped to `FolderView` alone). This is separate from `TabBar`'s existing tab-reorder `DndContext` (unchanged) — a tab now plays two independent roles: `useSortable` (its existing reordering behavior, untouched) in `TabBar`'s own context, and `useDroppable` (a new file-drop target) in the new outer context. Both coexist without conflict since they're separate `DndContext` instances.

- **Drag sources** (`useDraggable`): `FolderEntryRow` and `SearchResultRow`, both in `FolderView.tsx`.
- **Drop targets** (`useDroppable`): folder-kind rows only (not files), breadcrumb segments, and tabs.
- **Gesture coexistence**: each row already has `useLongPress` (2000ms hold → selection mode) and a click handler (open/navigate). Drag activation uses the same distance-based `PointerSensor` constraint `TabBar` already uses for tab reorder (a few pixels of movement starts a drag). The three gestures are naturally distinguished by what happens after pointer-down: hold still past the threshold → long-press; move past the distance threshold → drag; release quickly with no movement → click. No new coordination logic is needed between them beyond wiring `useDraggable`'s listeners onto the same row alongside the existing long-press handlers.
- **Multi-select interaction**: if the dragged row's path is already in `useSelectionStore`'s `selectedPaths`, the whole current selection drags together (drag overlay shows "N개 항목"); otherwise only that single row drags, regardless of what else happens to be selected.
- **Drag activation without selection mode**: dragging works immediately in normal browsing (selection mode is not a prerequisite) — matching a real file manager, where grabbing an unselected file starts a plain single-item drag.

## 2. Visual feedback and validity

- `DragOverlay` (dnd-kit) shows the dragged entry's name, or "N개 항목" when dragging the active selection.
- A `useDroppable` target under the active drag (`isOver`) gets a highlight — applies to folder rows, breadcrumb segments, and tabs alike.
- Invalid targets are simply not droppable: file-kind rows never register as `useDroppable`, and dropping onto the folder currently being browsed (the drag's own source folder) or onto the dragged item itself is a no-op (checked before calling the mutation, not surfaced as an error).
- Anything else that could make a move invalid (e.g. moving a folder into its own descendant) is left to the same backend validation `useMoveEntries()` already relies on for the existing dialog — its `MoveResultDto[]` per-item `success`/`error` shape is reused as-is; no new validation logic is added on top.
- On drop: call `useMoveEntries()` with the resolved paths (selection or single row) and the target's path as `destDir`. Success shows a toast (see below); any failed item shows an error toast with that item's `error` message.

## 3. Toast feedback

Reuses the `sonner` toast primitive introduced by the launch-config-toast sub-project (`<Toaster>` already mounted in `AppLayout.tsx`) — no new toast infrastructure. A successful move shows `toast.success('N개 항목 이동됨', { action: { label: '실행취소', onClick: undo } })`; sonner's `action` option renders a real button inside the toast (confirmed against the installed version's own type definitions, `Action { label, onClick }`). This applies to every move regardless of entry point — drag-and-drop, the existing right-click "이동" dialog, or the multi-select toolbar's batch move — since the toast is fired from `useMoveEntries()`'s shared `onSuccess`, not duplicated per call site. `MoveDialog`'s own existing per-item results screen is unchanged and still shown for that entry point; the toast is an additional, lighter-weight confirmation that also happens to carry the undo affordance, not a replacement for it.

## 4. Undo

**State**: a new `src/stores/lastMoveStore.ts` (Zustand, matching `selectionStore.ts`'s shape) holds `lastMove: { path: string; newPath: string }[] | null` — one entry per successfully-moved item, sourced directly from `MoveResultDto`'s existing `path`/`newPath` fields (results missing `newPath`, i.e. failures, are excluded). `useMoveEntries()`'s `onSuccess` sets this, unconditionally replacing whatever was recorded before — the store only ever remembers the single most recent move, matching the chosen "one level" scope.

**Undo execution**: group the recorded `{path, newPath}` pairs by the *original* parent directory (`path`'s dirname) — usually one group (drag-and-drop and most dialog moves originate from a single folder), occasionally more than one (a batch move built from recursive search results, where selected items can come from different subfolders). Issue one `useMoveEntries()` call per group, moving each group's items (by their current `newPath`) back to that group's shared original parent as `destDir`. This is still a single user-facing "undo" action — the grouping is invisible, just correct.

**Trigger surfaces**: the toast's "실행취소" button (above), and a new global `Ctrl+Z` keydown listener mounted once in `AppLayout.tsx` (matching `<Toaster>`'s own singleton-at-root placement — moves can originate from Gallery/List/DetailList/Explorer, not just Explorer, so this can't be scoped to `TabBar.tsx` like the existing Ctrl+W handler). The listener no-ops silently if `lastMove` is `null` (nothing to undo). It skips entirely while a text input/textarea/contentEditable has focus, reusing the exact `isEditingElsewhere` guard `TabBar.tsx`'s own Ctrl+W handler already established — Ctrl+Z must not hijack a text field's native undo (e.g. while typing in the rename dialog or search box).

**Emergent redo**: undo itself calls `useMoveEntries()`, which re-triggers the same `onSuccess` and overwrites `lastMove` with the undo's own move record. Pressing Ctrl+Z again therefore undoes the undo — i.e. redoes the original move. This isn't separately implemented; it falls out of hooking undo at the mutation level rather than tracking "was this specific action an undo" as its own flag.

## Testing

No test infrastructure exists for this app's components/dialogs (established precedent, unchanged). The one new piece of pure logic — grouping `{path, newPath}` pairs by original parent directory for undo — gets a real unit test (a pure function, easy to isolate: given entries from 1 vs. 2+ distinct parents, returns the correctly-grouped move calls). Everything else is verified live via `npm run dev`: dragging a single row and a multi-selection onto a folder row/breadcrumb/tab; drag overlay and drop-target highlight rendering; invalid targets (file rows, the source folder itself) correctly not accepting a drop; the success toast with a working undo button; Ctrl+Z performing the same undo, both immediately after a drag-and-drop move and after a dialog/toolbar move; Ctrl+Z being a no-op with nothing to undo and while a text field is focused; and undoing an undo (redo) working via a second Ctrl+Z.
