# Detail Access, Rating/Playtime Display, Explorer Search — Design

## Context

The final whole-branch review of the just-merged `game-management-expansion` batch (6 plans, 37 tasks, now on `master`) surfaced three gaps that were individually in-scope-looking within their original tasks but only visible at the whole-app level:

1. Rating/memo/playtime are stored (`game_user_data`, built across the earlier Plans 3-4) but never displayed anywhere except their own edit dialog (`RatingMemoDialog`).
2. Launch (실행) / 평점·메모 / 실행 설정 are only reachable via Explorer's `DetailOverlay`, and `DetailOverlay` is only opened by `FolderView.tsx`'s `if (entry.code)` gate — Gallery/List/DetailList have no entry point at all, and code-less (path-keyed) Explorer entries can never open it either, despite the backend already supporting path-keyed identifiers everywhere.
3. Explorer has no search bar, despite the original design spec naming it as in-scope alongside Gallery/List/DetailList.

This design also folds in a related, user-requested addition discovered while designing the fix for gap 2: a way to manually link a DLsite code to a code-less entry without renaming its folder, preserving any favorite/rating/memo/playtime already accumulated under its path key.

## Out of scope (explicitly deferred, not part of this spec)

- The code-less-folder recursive-scan-flooding question (uncoded extracted-game folders exposing their internal files as individual Gallery/List cards) — a separate product decision the user has not yet made.
- AI-based filename normalization (original item 7 of the 18-item request) — deferred to a future discussion per the user's own earlier statement.
- Automatic detection/reconciliation of a folder rename that adds a code to its name — considered and explicitly rejected (see Section 1c) as too risky (requires mtime/size-based heuristics with real false-positive/data-merge risk). The supported path to preserve accumulated data when "coding" a folder is the in-app link feature (Section 1c), not renaming the folder yourself.

## Section 1a: Shared DetailOverlay entry point

`DetailOverlay`'s open/close logic (currently `FolderView.tsx`'s local `selectedGame` state) is extracted into a small hook:

```ts
function useGameDetailOverlay(): {
  openDetail: (entry: ScannedEntry) => void
  DetailOverlayElement: () => JSX.Element
}
```

Each page (Gallery, List, DetailList, Explorer's `FolderView`) calls this hook locally — no global/Zustand state, matching the existing "search/filter state is independent per page" precedent. Each page renders `<DetailOverlayElement />` once and calls `openDetail(entry)` from its card/row click handler.

- `FolderView.tsx`'s `if (entry.code)` gate on opening `DetailOverlay` is removed. `DetailOverlay`'s internal buttons already guard on `game.kind === 'folder'` for launch/settings, so opening it for a code-less folder is safe — `resolveGameEntryKey` already handles path-keyed identifiers correctly for every feature (favorite, rating/memo, launch config, save path) per the existing test coverage.
- Gallery card / List row / DetailList row clicks (currently no-ops outside the existing favorite-heart button, which stays `stopPropagation`-isolated) now call `openDetail(entry)`.

## Section 1b: Rating/memo/launch reachable for code-less entries

A direct consequence of 1a — no separate work needed. Once `DetailOverlay` opens for any entry regardless of code, all its existing buttons (실행/실행 설정/평점·메모) work correctly for path-keyed entries, since the backend (`resolveGameEntryKey`, `game_user_data` repository functions) already treats code and path identifiers uniformly.

## Section 1c: Manual code linking for code-less entries

**Problem:** `ScannedEntry.code` is derived fresh from the filename on every scan (`extractCode(name)`). Linking a code to an entry inside the app doesn't survive the next scan unless the app has a durable way to remember "this path has this code" independent of the on-disk name.

**Design:**

- New table `path_code_overrides` (`path TEXT PRIMARY KEY`, `code TEXT NOT NULL`, `created_at TEXT NOT NULL`) in the same database as `game_user_data`/`game_metadata`.
- The scanner (`toScannedEntry` in `electron/main/scanner/folderScanner.ts`) falls back to this table when `extractCode(name)` returns `null`: if the entry's path has an override row, `ScannedEntry.code` is populated from it instead of staying `null`.
- `DetailOverlay` gains a "코드 연동" button, shown only when `entry.code === null`. Clicking it reveals a code input (validated with the existing `parseCodeInput` from `src/pages/DlsiteSearch/parseCodeInput.ts`, reused as-is) and a confirm action.
- Confirming calls a new IPC handler (e.g. `gameUserData:link-code`) that, in one transaction:
  1. Inserts the `path_code_overrides` row.
  2. Calls `rekeyToCode(db, entry.path, code)` to migrate the existing path-keyed `game_user_data` row (favorite/rating/memo/playtime/save path) onto the code key.
  3. **Fixes `rekeyToCode`'s known latent bug** (flagged in the final review, previously unreachable because it had zero callers): today, if a code-keyed row already exists for the target code, the `onConflictDoUpdate` fallback only bumps `updatedAt`, silently discarding the path row's data. Since this feature gives `rekeyToCode` its first real caller, the conflict branch is changed to merge deterministically: the code-keyed row's values win wherever they are non-null/non-default (since they represent data already associated with the canonical DLsite identity); the path row's values only backfill fields that are null/default on the code row (`isFavorite: false`, `rating: null`, `memo: null`, `launchConfig: null`, `totalPlaytimeMs: 0`, `lastPlayedAt: null`, `savePath: null`). No field is ever silently dropped — every non-default value from either row survives.
- On success, the UI triggers `useCrawlGameMetadata` for the newly-linked code so DLsite title/cover/genres populate immediately.
- The dialog explicitly informs the user: renaming the folder directly (outside the app) will not preserve existing favorite/rating/memo — use this feature instead if they want to keep that data.

## Section 2: Rating/playtime inline display

No new IPC or schema — pure rendering additions using data the pages already fetch via `useGameUserData`.

- **Gallery cards**: a compact 5-star row next to the existing favorite-heart icon (only rendered when `rating` is non-null). Clicking it opens the detail overlay like the rest of the card (no separate interaction).
- **List rows / DetailList rows**: a new rating column appended after the existing code/genre/date columns, following the same `genres.slice(0, 3)` "only render if present" precedent already used for genre badges.
- **RecentlyPlayed rows**: a new playtime display next to the existing last-played date, via a new small format helper (e.g. `formatPlaytime(ms): string` → "3시간 20분"), placed alongside the existing `formatDate`/`formatSize` helpers' established pattern.

## Section 3: Explorer recursive search

- `FolderView` gets a `<SearchHeader>` (reused as-is from `src/components/layout/SearchHeader.tsx`, same Ctrl+F-expand + genre-exclude-chip behavior already used by Gallery/List/DetailList).
- When the search query is empty, `FolderView` behaves exactly as today: `useFolderScan(path)` (shallow scan) + normal breadcrumb navigation.
- When a non-empty query is entered, a new hook `useFolderScanRecursive(path, { enabled })` fires instead, calling the existing `window.api.scanner.scanRecursive([path])` (reusing the same IPC endpoint Gallery/List/DetailList already use for whole-library scans, just rooted at a single arbitrary folder instead of a registered library root — the function already accepts any path string).
- **Search root is the currently-displayed folder** (wherever the user has navigated to via the breadcrumb within the tab), not the tab's original opening path — matches the intuitive "search from here down" expectation.
- Results are filtered via the existing `filterEntries` and rendered as a flat list, each showing its **path relative to the search root** alongside its name (to disambiguate same-named entries in different subfolders), matching `DetailList`'s existing path-column convention.
- Results are inherently leaf-level entries only (coded files/folders, code-less files) — matching `scanLibraryRecursive`'s existing "leaves only, code-less folders are walked but never returned themselves" semantics already established for Gallery/List/DetailList. No new filtering logic needed here.
- Clicking a result opens the shared `openDetail` from Section 1a (same as Gallery/List/DetailList), not folder navigation.
- Clearing the search query reverts immediately to the normal shallow-scan browsing mode.

## Testing notes for the implementation plan

- `path_code_overrides` and the scanner fallback need a real-SQLite repository test plus a `folderScanner` test proving a path with an override row (but no code in its filename) produces a non-null `ScannedEntry.code`.
- `rekeyToCode`'s conflict-merge fix needs a regression test proving no data loss when linking a code that already has an existing code-keyed row with its own favorite/rating/memo.
- The `gameUserData:link-code` IPC handler needs a test covering the full chain: override row created, `game_user_data` migrated, existing favorite/rating preserved.
- `useFolderScanRecursive` and the Explorer search UI have no dedicated component tests available (this repo has no component-testing infrastructure, confirmed during the earlier 6-plan batch) — verified via manual/code-level review only, consistent with `SearchHeader`'s own established precedent.
- Manual/CDP live-UI verification should be skipped for this plan too, per this worktree's established, logged policy on unreliable coordinate-based clicking on this machine.
