# Excluded Entries (Gallery/List/DetailList) — Design

## Goal

Let a user right-click a game folder/file in Gallery, List, or DetailList and
exclude it from those three views — for junk folders, duplicates, or
anything cluttering the library that isn't worth deleting outright. Give
them a way to see and restore what they've excluded, reachable from the
app's View menu.

## Scope

Sixth sub-project of the v1.0.2 backlog (group "G"). B, F, A, and C are
shipped. Touches: a new DB table + repository, a handful of new IPC
channels (including the app's first-ever main-process-menu-triggers-a-
renderer-dialog push channel), the shared `GameEntryContextMenu` component,
`useVisibleGames`, and a new management dialog. Explorer is explicitly
**not** in scope — it stays a raw, unfiltered filesystem browser; excluding
an entry only affects Gallery/List/DetailList. Not in scope: backlog items
D (VNDB/Getchu) and E (Explorer overhaul).

## 1. Data Model & Identity

New table `excluded_entries`, hand-written `CREATE TABLE IF NOT EXISTS` DDL
in `client.ts` (no drizzle-kit migrations, matching every table this
project has ever added):

```sql
CREATE TABLE IF NOT EXISTS excluded_entries (
  key TEXT PRIMARY KEY,
  key_type TEXT NOT NULL,      -- 'code' | 'path'
  name TEXT NOT NULL,          -- entry.name snapshot at exclude time
  excluded_at TEXT NOT NULL
)
```

Keyed exactly like `game_user_data` already is: `resolveGameEntryKey`
(`electron/main/ipc/resolveGameEntryKey.ts`) resolves a `GameEntryIdentifier`
(`{code, path}`) to `{key, keyType}` — code value when the entry is
code-linked, else `normalizeLibraryPath(path)`. This project already treats
that as the one stable identity model for "a game entry," and this feature
reuses it exactly rather than inventing a second one.

`name` is a snapshot of `ScannedEntry.name` (the folder/file name) taken at
exclude time — not a live metadata lookup. This keeps the management dialog
self-contained (always has something to show, even for entries whose
metadata was never crawled or whose crawl later fails) at the cost of not
reflecting a game's real crawled title if it differs from its folder name —
an acceptable trade for a low-traffic admin dialog.

**No refactor needed here:** `normalizeLibraryPath` already lives in
`shared/normalizeLibraryPath.ts` (moved there prior to this backlog, commit
`a77c6e4`), pure string manipulation — lowercase + strip a trailing slash —
with `electron/main/database/librariesRepository.ts` re-exporting it for
its own existing call sites' backward compatibility. The renderer-side
filter (§2) can `import { normalizeLibraryPath } from
'../../shared/normalizeLibraryPath'` directly, applying the exact same
normalization `resolveGameEntryKey` uses to a live `ScannedEntry`'s path —
no drift risk, no new plumbing, this was already solved for a different
feature.

## 2. Where Filtering Happens

Inside `useVisibleGames` (`src/hooks/useVisibleGames.ts`), alongside its
existing library-visibility filter — not inside the scanner
(`folderScanner.ts`) and not inside the `SCANNER_SCAN_RECURSIVE` IPC
handler. This matters because other consumers of the raw scan result (the
Saves page's `usePathByCode`, for one) go through `useGames()` directly,
not `useVisibleGames()` — filtering upstream of that split would silently
hide an excluded-but-still-save-managed entry from save management, which
isn't what was asked for. Scoping the filter to `useVisibleGames` keeps the
blast radius to exactly Gallery/List/DetailList, matching how the existing
library-visibility filter is already scoped.

The match itself: for each `ScannedEntry`, compute
`entry.code ? entry.code.value : normalizeLibraryPath(entry.path)` (the
exact same formula `resolveGameEntryKey` uses) and check it against a
`Set<string>` of currently-excluded keys, fetched via a new query hook
(`useExcludedEntries()`, TanStack Query) that both this filter and the
management dialog (§4) share — one query, two consumers, no duplicate
fetching. The actual "is this entry excluded" comparison is pulled into a
small pure function (e.g. `isEntryExcluded(entry, excludedKeys): boolean`
in a new file) so it's unit-testable independent of the hook, following
this project's established pattern for pulling matching/decision logic out
of hooks into pure functions (`shuffleOrder.ts`, `compareVersions.ts`).

**Crawl-skip comes for free.** `GalleryPage.tsx` already builds its
bulk-crawl-missing code list from `useVisibleGames()`'s filtered output,
not the raw scan (`useTriggerBulkCrawlMissingMetadata(gameCodes)` where
`gameCodes` derives from the already-filtered `games`) — so once excluded
entries are filtered out at that layer, they're automatically skipped by
the bulk-crawl trigger too, with no separate change needed. Already-crawled
metadata for an excluded entry is left alone (not deleted), so restoring it
later shows its cover/title immediately rather than needing to re-crawl.

## 3. IPC Surface

New channels, following this project's established `GameEntryIdentifier`
request-shape convention (same as `SET_FAVORITE`/`SET_CLEARED`):

- `GAME_ENTRY_EXCLUDE` — request `{identifier: GameEntryIdentifierSchema, name: string}`. Handler resolves the key via `resolveGameEntryKey`, inserts/upserts the row.
- `GAME_ENTRY_RESTORE` — request `{key: string}` (the dialog already has the raw key from the list it's displaying, no need to re-resolve an identifier).
- `GAME_ENTRY_LIST_EXCLUDED` — no request, returns `ExcludedEntryDto[]` (`{key, keyType, name, excludedAt}[]`), shared by both `useVisibleGames`'s filter and the management dialog via one `useExcludedEntries()` hook.
- `MENU_OPEN_EXCLUDED_ENTRIES_DIALOG` — push-only, main → renderer, no request/response schema (matches `SCANNER_SCAN_PROGRESS`/`MEDIA_STATE_SYNC`'s existing push-channel shape). Fired from the View menu's click handler via `win.webContents.send(...)`. This is the app's first main-process-menu-triggers-a-renderer-dialog channel — every dialog today opens from renderer-side state only, so this is new plumbing, not a reuse of an existing pattern, though it directly mirrors the shape of pushes that already exist for other purposes.

Renderer subscribes to `MENU_OPEN_EXCLUDED_ENTRIES_DIALOG` once (mounted at
app root, matching where `useBulkCrawlProgress` is already mounted once in
`AppLayout.tsx`) and calls a new, non-persisted Zustand store's `open()`
action — same "ephemeral, not a saved preference" precedent as
`libraryVisibilityStore`, just for dialog-open state instead of a filter
set.

## 4. Context Menu

`GameEntryContextMenu` (`src/components/game/GameEntryContextMenu.tsx`)
gains an optional prop, following its existing pattern for view-specific
items (`onOpenInNewTab` is already Explorer-only and optional for the same
reason):

```tsx
onExclude?: (entry: ScannedEntry) => void
```

Gallery/List/DetailList's usages pass it (wired to a new
`useExcludeEntry()` mutation that invalidates the `useExcludedEntries()`
query on success, so the entry disappears from view immediately). Explorer's
usage in `FolderView.tsx` does not pass it, so the item never renders there
— Explorer stays fully unaffected without any conditional logic inside
Explorer itself.

The new item (`t('exclude.excludeFromView')`, "보기에서 제외" / "ビューから除外" /
"Exclude from view") is placed with the favorite/cleared toggles — the
existing items closest in spirit ("how I want to see this entry"), away
from rename/move/delete. A new `ContextMenuSeparator` (exported by
`src/components/ui/context-menu.tsx` but not yet used anywhere in this app)
is added directly before the destructive "삭제" (Delete) item — the menu
currently has zero separators, including none before its one existing
destructive action; this closes that gap for every user of the menu, not
just this new item.

No confirmation dialog and no toast on exclude — this app has no toast
system anywhere (confirmed, none to reuse) and excluding is instantly
reversible via the management dialog, matching how the existing
favorite/cleared toggles already behave with zero confirmation. The
entry's disappearance from the grid/list is itself the feedback.

## 5. Management Dialog

A controlled Radix `Dialog` (`open`/`onOpenChange` driven by the new
Zustand store, not an uncontrolled `DialogTrigger` — this dialog has no
visible trigger button anywhere in the UI, only the View menu opens it),
otherwise structured like the existing `LibraryVisibilityDialog`
(`DialogContent` > `DialogHeader` > `DialogTitle`, no `DialogDescription`).

- Title: "제외된 항목 관리" (Manage excluded items).
- Empty state: this app's established idiom (seen in `GalleryPage.tsx`'s
  own empty state) — a centered `text-sm text-muted-foreground` message,
  "제외된 항목이 없습니다" (No excluded items) — rather than
  `LibraryVisibilityDialog`'s approach of returning `null` outright (that
  only works there because a Sidebar button conditionally hides itself when
  irrelevant; this dialog has no such visibility cue since it opens from a
  menu item that's always present).
- List: `max-h-96 overflow-y-auto` (exclusions can accumulate unboundedly
  over time, unlike the small fixed library list `LibraryVisibilityDialog`
  shows).
- Each row: name (truncated, flex-1) plus the key shown small/muted when
  `keyType === 'code'` (mirroring `SaveEntryRow`'s existing
  `<p className="truncate text-xs text-muted-foreground">{code.value}</p>`
  pattern), `hover:bg-accent` row highlight (same as every other list row
  in this app), and a `variant="outline" size="sm"` "복원" (Restore) button
  that calls a new `useRestoreEntry()` mutation, invalidating
  `useExcludedEntries()` on success so the row disappears from the dialog
  and the entry reappears in Gallery/List/DetailList.
- No footer close button — same as `LibraryVisibilityDialog`, relies on the
  Dialog's own built-in close affordance (X button, Escape, outside-click).

## Testing

- Repository (`excludedEntriesRepository.ts`): real `:memory:`-DB test
  mirroring `pathCodeOverridesRepository.test.ts`'s exact shape (insert,
  get, list, delete, overwrite-on-conflict).
- `isEntryExcluded` (the pure matching function): unit-tested directly
  against a `Set<string>` and various `ScannedEntry` shapes (code-linked,
  path-only, excluded, not excluded) — no DB or IPC needed.
- No tests for the IPC handlers, the context menu item, or the dialog UI —
  matches this app's established precedent (no component test
  infrastructure exists anywhere in this codebase); verified live via
  `npm run dev` / Playwright instead, same as every other UI change this
  session.
