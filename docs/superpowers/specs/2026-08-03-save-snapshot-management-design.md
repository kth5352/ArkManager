# Save Snapshot Management Utilities — Design

## Goal

Give the existing save-backup ("스냅샷") feature the utility actions it's
missing: delete (individual and all-at-once), open a snapshot's or the live
save folder in Explorer, a memo + auto-detected version label per snapshot,
a warning when restoring a snapshot recorded against a newer game version
than the one currently installed, and a search box on the Saves page's game
list.

## Scope

Second sub-project of the v1.0.2 backlog (item 8, "F" in the agreed
B→F→A→C→G→D→E order — B shipped as
`docs/superpowers/specs/2026-08-03-detail-sidebar-button-cleanup-design.md`).
Touches only the save-snapshot feature: `SaveManagerDialog.tsx`,
`SaveDataSection.tsx`, `SavesPage.tsx`, `electron/main/save/*`,
`electron/main/ipc/saveHandlers.ts`, and one new DB table. Not in scope: any
other backlog item, and not the save-folder *picker* flow
(`usePickSaveFolder`/`useSetSavePath`), which is unchanged.

## Current State

- `SaveManagerDialog` lists snapshots (timestamp, file count, size) with a
  single "복원" button each and a "새 저장" button - no delete, no
  Explorer link, no labels.
- `SaveDataSection` (the sidebar's collapsible save section) shows the live
  save path as plain truncated text - no Explorer link either.
- Backend has create/list/restore/diff (`electron/main/save/*`) but no
  delete of any kind, and snapshots are unlabeled - identified only by their
  directory name, which is the creation timestamp
  (`{userData}/saves/{safeKey}/{timestamp}/`, see `saveHandlers.ts`'s
  `backupRootDir`).
- A generic `shell:show-item-in-folder` IPC + `useShowItemInFolder()` hook
  already exist and are reused as-is for the live save folder.
- `SaveManagerDialog` already has a `PendingAction` union
  (`{type:'save', against} | {type:'restore', timestamp}`) driving a
  list-view ↔ confirm-view toggle - delete and delete-all extend this same
  union rather than introducing a second dialog or a parallel state shape.
- `gameUserData.launchConfig` (JSON: `{executablePath, launchMode}`), when
  set, already names the game's actual launch executable -
  `electron/main/launch/listExecutables.ts` lists every top-level `.exe` in
  a folder when it isn't set.

## 1. Delete Snapshot (individual + all)

**IPC:** two new channels in `saveHandlers.ts`, both resolving `identifier`
to `key` exactly like the existing handlers:
- `SAVE_DELETE_SNAPSHOT` — payload `{identifier, timestamp}`. Removes
  `{backupRootDir(key)}/{timestamp}` (`fs.rm(..., {recursive: true})`) and
  the matching `save_snapshot_labels` row (see §3).
- `SAVE_DELETE_ALL_SNAPSHOTS` — payload `{identifier}`. Removes the whole
  `backupRootDir(key)` and every `save_snapshot_labels` row for that key.

**UI:** `SaveManagerDialog`'s `PendingAction` union gains two variants:

```ts
type PendingAction =
  | { type: 'save'; against: string | null }
  | { type: 'restore'; timestamp: string }
  | { type: 'delete'; timestamp: string }
  | { type: 'deleteAll'; step: 1 | 2 }
```

- Per-snapshot 🗑 sets `{type: 'delete', timestamp}`, rendering a confirm
  view (reusing the existing pending-view slot - same pattern as the
  save/restore diff confirm, just with a short "정말 삭제하시겠습니까?"
  message instead of a diff list) with Cancel / Delete buttons.
- The dialog-level "전체 삭제" button (next to "새 저장") sets
  `{type: 'deleteAll', step: 1}`. Its confirm view's Delete button doesn't
  call the mutation - it advances to `{type: 'deleteAll', step: 2}`, a
  second confirm view with a stronger warning ("이 게임의 스냅샷
  {count}개가 모두 삭제됩니다. 되돌릴 수 없습니다.") whose Delete button is
  the one that actually calls `useDeleteAllSnapshots().mutate(entry)`. Both
  steps' Cancel returns to `pending === null` (the list), not to step 1.

## 2. Open in Explorer

- **Live save folder:** `SaveDataSection` adds a button next to the
  existing path text, calling the already-existing
  `useShowItemInFolder().mutate(userData.savePath)` - no backend change.
- **Snapshot folder:** the renderer never has the absolute backup path (only
  `backupRootDir()` inside `saveHandlers.ts` does), so this needs a new
  handler: `SAVE_SHOW_SNAPSHOT_IN_FOLDER`, payload `{identifier, timestamp}`,
  resolves `key` and calls
  `shell.showItemInFolder(join(backupRootDir(key), timestamp))` server-side.
  A 📁 button per snapshot row in `SaveManagerDialog` calls it.

## 3. Snapshot Labels (memo + version)

**New table**, following this codebase's existing "hand-written DDL in
`client.ts`, no drizzle-kit migration pipeline" convention (see
`client.ts`'s own comment on this):

```ts
// schema.ts
export const saveSnapshotLabels = sqliteTable(
  'save_snapshot_labels',
  {
    key: text('key').notNull(),
    timestamp: text('timestamp').notNull(),
    memo: text('memo'),
    version: text('version'),
  },
  (table) => ({ pk: primaryKey({ columns: [table.key, table.timestamp] }) })
)
```

```sql
-- client.ts, alongside the other CREATE TABLE IF NOT EXISTS blocks
CREATE TABLE IF NOT EXISTS save_snapshot_labels (
  key TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  memo TEXT,
  version TEXT,
  PRIMARY KEY (key, timestamp)
)
```

No `ensureColumns` call needed (brand new table, no existing installs to
backfill).

**Repository** (`saveSnapshotLabelsRepository.ts`, mirrors
`pathCodeOverridesRepository.ts`'s style): `getSnapshotLabel(db, key,
timestamp)`, `setSnapshotLabel(db, key, timestamp, {memo?, version?})`
(upsert, `onConflictDoUpdate` merging only the provided field so setting
memo alone doesn't clobber an existing version), `deleteSnapshotLabel(db,
key, timestamp)` (called from §1's individual delete),
`deleteSnapshotLabelsForKey(db, key)` (called from §1's delete-all).

**`SAVE_LIST_SNAPSHOTS`** joins the label onto each entry - extend
`SaveSnapshotDto` with `memo: string | null` and `version: string | null`,
filled from `getSnapshotLabel` per snapshot in `listSnapshots`'s caller
(`saveHandlers.ts`), not inside the pure `listSnapshots` directory-scan
function itself.

**`SAVE_SET_SNAPSHOT_LABEL`** — payload `{identifier, timestamp, memo?,
version?}` - calls `setSnapshotLabel`. Used both by the always-visible memo
input (blur-save, per §4's layout) and by manual version edits.

**Version auto-fill at snapshot creation:** `SAVE_CREATE_SNAPSHOT`'s
existing handler already receives `identifier` (which always carries the
game's own folder `path`, not just its save path - see
`resolveGameEntryKey.ts`). After a successful `createSnapshot`, it calls a
new pure-ish helper:

```ts
// electron/main/save/detectGameVersion.ts
export async function detectGameVersion(
  gameFolderPath: string,
  preferredExePath: string | null
): Promise<string | null>
```

Tries, in order, stopping at the first non-null result:
1. `preferredExePath` (from `gameUserData.launchConfig.executablePath`, if
   set) via `readExeFileVersion` (new file, `electron/main/save/readExeFileVersion.ts`
   - PowerShell `(Get-Item -LiteralPath '...').VersionInfo.FileVersion`,
   invoked the same safe way `electron-updater`'s own
   `windowsExecutableCodeSignatureVerifier.js` already does in this
   project's `node_modules` - quote-escaped path, `PSModulePath` reset,
   `chcp 65001`, timeout).
2. Each path from `listExecutables(gameFolderPath)`, first one with a
   non-null `readExeFileVersion` result.
3. `extractVersionFromName` (new pure function, `electron/main/save/extractVersion.ts`,
   same style as `codeRecognition.ts`'s `extractCode` - pattern
   `/(?<![0-9])\d+\.\d+\.\d+(?![0-9])/`) applied to every top-level name in
   `gameFolderPath` (`readdir`, files and folders both), first match wins.
4. `null` (label stays blank - user can fill it in manually; the UI never
   blocks on this).

If `gameFolderPath` isn't a directory (a not-yet-extracted archive), step 1
skips due to no exe, step 2's `listExecutables` already returns `[]` on a
`readdir` failure, and step 3 also fails closed the same way - the whole
chain degrades to `null` without throwing.

**Memo** has no auto-fill - always starts blank, user-entered only.

## 4. Snapshot Row Layout (confirmed: Option A from the visual comparison)

Two-line row inside `SaveManagerDialog`'s snapshot list:
- Line 1: `{timestamp} [{version badge}]` on the left, `{fileCount}개 ·
  {size}` on the right. The version badge is a small clickable text button
  (label reads the version, or "버전 추가" when `null`); clicking it swaps
  it in place for a text input, same auto-save-on-blur behavior as the memo
  input below, via `SAVE_SET_SNAPSHOT_LABEL`.
- Line 2: an always-visible text input bound to `memo` (placeholder "메모
  없음" when empty), blur-saves via the same channel.
- Line 3: 📁 (§2) and 🗑 (§1) icon buttons on the left, "복원" button on the
  right.

The dialog-level "새 저장" / "전체 삭제" buttons stay in their existing
fixed header row above the list.

## 5. Version Mismatch Warning on Restore

When the user clicks "복원" on a snapshot (`pending = {type: 'restore',
timestamp}`), before showing the existing diff-preview confirm view, if
that snapshot's `version` (already in hand from `SAVE_LIST_SNAPSHOTS`, §3)
is non-null: call one new handler, `SAVE_CHECK_VERSION_MISMATCH`, payload
`{identifier, timestamp}`. Entirely main-process-side - it looks up the
snapshot's stored version itself (no need to pass it from the renderer),
runs the exact same `detectGameVersion` chain from §3 against the game's
*current* folder state (not a stored value - the game may have been patched
since the snapshot was made), and compares the two with a new pure
function local to this file's neighborhood:

```ts
// electron/main/save/compareVersions.ts - main-process only, never
// imported from src/, so it never needs a shared/ home.
export function compareVersions(a: string, b: string): number | null
```

Splits both strings on `.`, compares each segment numerically (missing
trailing segments treated as `0`, so `1.2` vs `1.2.0` compare equal); returns
`null` (not 0) if either string has any non-numeric segment, since a
manually-typed version like "베타" can't be compared and must not silently
sort as "less than" real numbers.

`SAVE_CHECK_VERSION_MISMATCH` returns
`{ snapshotVersion: string | null; currentVersion: string | null;
isSnapshotNewer: boolean }` (`isSnapshotNewer` is `compareVersions(...) ===
1`, and `false` whenever either version is `null` or incomparable - the
renderer only needs this one boolean plus the two strings to render the
message, never `compareVersions`'s own three-way result).

If `isSnapshotNewer`, show a warning before the existing diff view: "이
스냅샷은 v{snapshotVersion} 기준으로 저장되었는데, 현재 게임은
v{currentVersion}입니다. 새 버전의 세이브가 호환되지 않을 수 있습니다."
with "그래도 복원" / "취소" - "그래도 복원" proceeds to the existing
diff-preview confirm view exactly as today; it does not skip straight to
restoring.

## 6. SavesPage Search

A text input above the game list in `SavesPage`, filtering the already-loaded
`games` array (`useGamesWithSavePath()`'s result) by substring match against
`game.key` (case-insensitive). Deliberately not matching against the crawled
metadata title: each row's title is fetched independently, per-row, by
`SaveEntryRow` itself (`useGameMetadata`) - the list-level filter runs before
those per-row fetches exist, and lifting metadata fetching up to the list
level to enable title search is out of scope for this utility feature (real
restructuring, not a small addition). `game.key` is the DLsite/Steam code for
code-type games or the folder/file path for path-type ones - both are
already visible in the existing row (`SaveEntryRow` renders `code.value` when
present), so searching by what's on-screen is the honest scope here.

## Testing

No component/hook test infrastructure exists in this codebase (only
pure-logic `.test.ts` files anywhere in the repo). New pure functions get
unit tests the same way `extractCode.test.ts` does:
- `extractVersion.test.ts` - matches/non-matches for the version pattern
  (including the lookaround edge cases: no match embedded in a longer
  number, matches with surrounding text/punctuation).
- `compareVersions.test.ts` - equal/greater/less, differing segment counts,
  non-numeric segments returning `null`.
- `detectGameVersion.test.ts` - the three-tier fallback chain, mocking
  `readExeFileVersion`/`listExecutables`/`readdir` (however this codebase's
  existing tests for similar chains, e.g. `dlsiteParser.test.ts`, structure
  their mocks - the plan should follow that precedent, not invent a new
  mocking style).
- `readExeFileVersion.test.ts` - likely thin/skipped if it's pure
  `execFile` plumbing with nothing to unit-test cleanly (precedent:
  `electron-updater`'s own equivalent has no test file either) - the plan
  should decide this explicitly rather than leaving it implicit.

Everything else (delete flows, Explorer buttons, label editing, the
mismatch warning, search) is manual `npm run dev` verification, per this
codebase's established convention for UI work.
