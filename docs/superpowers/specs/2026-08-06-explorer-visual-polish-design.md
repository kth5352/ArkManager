# Explorer: Visual Row Rework + Multi-Select/Batch Actions — Design

## Goal

Explorer's `FolderEntryRow` (`FolderView.tsx`) renders coded entries with a tiny thumbnail, media files with a `Music` icon, and everything else (plain folders/files — most of what a user actually browses) as bare text with no icon at all. It also has no multi-select or batch rename/move/delete, unlike Gallery/List, which already have both a full icon system (`FileKindIcon`) and a complete multi-select/batch pipeline (`useSelectionStore`, `SelectionCheckbox`, `SelectionToolbar`, plus multi-target `RenameDialog`/`MoveDialog`/`DeleteConfirmDialog`) that Explorer simply never adopted. This sub-project wires Explorer's row rendering into those same existing components — rather than building a parallel system — and adds three targeted animations (row hover, folder/tab-switch fade, tab add/remove) to close the "빈약하다"/"불편하다" gap the user described.

## Scope

First of the three Explorer sub-projects (visual polish + multi-select → drag-and-drop move → grid/sidebar view modes), agreed order per user. Touches: `src/pages/Explorer/FolderView.tsx`, `src/pages/Explorer/TabBar.tsx`. Reuses without modifying: `FileKindIcon`, `GameThumbnail`, `SelectionCheckbox`, `SelectionToolbar`, `useSelectionStore`, `useLongPress`, `RenameDialog`/`MoveDialog`/`DeleteConfirmDialog`. **Explicitly not in scope:** drag-and-drop file moves and grid/sidebar view modes (the next two sub-projects), any change to Gallery/List/DetailList, and any new info density beyond name + icon + code (explicitly rejected in favor of staying "file-explorer-light" rather than matching List's full favorite/rating/playtime/genre row).

## 1. Row visual rework

`FolderEntryRow` gains an icon slot mirroring List's `GameRow` exactly:

- **No code:** `FileKindIcon` (folder/archive/file, from `isArchiveFile`) at a fixed size — every row gets an icon now, not just coded/media ones.
- **Code linked:** `GameThumbnail` in the same `h-8 w-8` square box `FolderEntryRow` already uses today, with `FileKindIcon` added as a badge overlay (`absolute bottom-0.5 right-0.5`, matching `GameRow`'s exact badge treatment, scaled to `h-3 w-3`) instead of the icon disappearing behind the thumbnail as it does now.
- **Media file (no code):** keep the existing `Music` icon, unchanged.

Row height becomes fixed (40px, vs. today's content-dependent `py-2`) — deliberately shorter than List's 84px, since this stays name+icon+code only (no favorite/cleared/rating/playtime/genre badges — the user explicitly chose "가볍게 유지" over matching List's richer row). The search-results list (`isSearching` branch), which today renders plain text with no icon at all, gets the same icon treatment for visual consistency between Explorer's two list states.

## 2. Multi-select + batch actions

Wire the existing selection pipeline into Explorer exactly as Gallery/List already use it:

- `SelectionCheckbox` + `useLongPress`-triggered activation on `FolderEntryRow`, identical to `GameRow`'s pattern.
- `SelectionToolbar` added to `FolderView`'s toolbar row (next to `SearchHeader`/`PageToolbar`), with `allEntries` switching between `shallowEntries` (normal browsing) and `sortedSearchResults` (search mode) depending on `isSearching` — both list states support selection, not just the default one.
- Batch rename/move/delete reuse `RenameDialog`/`MoveDialog`/`DeleteConfirmDialog` as-is — they already accept `targets: ScannedEntry[]`, no changes needed there.

**Selection reset on navigation.** `useSelectionStore` is a global singleton shared across Gallery/List/DetailList/Explorer. Unlike those single-view pages, Explorer's whole model is navigating between folders and tabs — without an explicit reset, a selection made in folder A would still show as "selected" after navigating to folder B (a different set of entries, some coincidentally sharing paths would stay checked, most would just silently vanish from view while remaining in the store). This is the same state-leak shape as the rename/launch-config dialog bug fixed earlier this session (component-external state not scoped to the thing the user is currently looking at). Fix: navigating within a tab (breadcrumb click or drilling into a subfolder) or switching tabs calls `useSelectionStore.getState().deactivate()`. Since `FolderView` is intentionally not remounted on path change (only on tab change, via `key={activeTab.id}` in `ExplorerPage.tsx`), the path-change case needs the same render-time sync-state pattern already established in this codebase (`DetailSidebar.tsx`'s `syncedGamePath`) rather than a `useEffect`.

## 3. Animation

- **Row hover:** scaling the full-width row would clip/overlap neighbors inside the `divide-y` bordered list, so only the icon/thumbnail box gets a subtle `whileHover={{ scale: 1.08 }}` (framer-motion, matching the transition duration Gallery's cards already use). The row's existing `hover:bg-accent` CSS transition is unchanged.
- **Folder navigation / tab-switch fade:** `FolderView` deliberately stays mounted across path changes (React Query re-fetches on the `path`-keyed query instead) — the fade must not disturb that. Only the entry list (`<ul>`) is wrapped in `AnimatePresence` keyed on `path`, with a short opacity fade (~150ms). Tab switches already remount `FolderView` via its own key, so the same wrapper picks up a mount-in fade there for free.
- **Tab add/remove:** `TabBar`'s tab list wraps each `SortableTab` in `AnimatePresence mode="popLayout"` with `initial`/`animate`/`exit` opacity+width, plus `layout` on the tab so surviving tabs slide smoothly into the closed tab's freed space instead of snapping.

## Testing

No test infrastructure exists for this app's components/dialogs (established precedent, unchanged by this sub-project) — no new automated tests for the row rendering or animations themselves. The one new piece of logic (selection-reset-on-navigation) is a direct call into `useSelectionStore`'s existing, already-tested `deactivate()` — nothing new to unit test there either. Verified live via `npm run dev`: icons render correctly for plain folders/files/archives/coded entries/media files in both the normal and search-result lists; long-press and the toolbar's "선택" button both enter selection mode; selecting across multiple rows and running batch rename/move/delete succeeds; selection clears on breadcrumb navigation, subfolder drill-down, and tab switch; hover/fade/tab animations run without layout jitter or console errors.
