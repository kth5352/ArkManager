# Shared Detail Entry Point + Code Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page (Gallery, List, DetailList, Explorer) can open the same `DetailOverlay` for any entry regardless of whether it has a DLsite code, and code-less entries gain a way to manually link a code without renaming their folder.

**Architecture:** Extract `DetailOverlay`'s open/close logic into a small `useGameDetailOverlay()` hook that each page calls locally (no global store). Relocate `DetailOverlay` from `src/pages/Explorer/` to `src/components/game/` since it's now shared. Add a `path_code_overrides` table + scanner post-processing step so a manually-linked code survives future scans without requiring a file rename. Fix `rekeyToCode`'s known data-loss bug on this task's own first real caller.

**Tech Stack:** Electron + React + TypeScript strict + Drizzle ORM + better-sqlite3 + React Query + Zod IPC validation + Vitest.

## Global Constraints

- No manual/CDP live-UI click verification — this project's worktrees have an established, logged policy that coordinate-based clicking is unreliable on this machine. Skip any "수동 검증" step; rely on code-level review instead.
- This repo has zero component-testing infrastructure (no `@testing-library/react`, `vitest.config.ts` only collects `*.test.ts`, not `.tsx`). New `.tsx` components get no dedicated test file — this matches every UI-wiring task in this project's history.
- `rekeyToCode`'s conflict-merge rule (exact, do not re-derive a different one): the CODE-keyed row's non-default values always win; the PATH row's values only backfill fields that are null/default on the code row — `isFavorite: false`, `rating: null`, `memo: null`, `launchConfig: null`, `totalPlaytimeMs: 0`, `lastPlayedAt: null`, `savePath: null`. No field from either row is ever silently dropped.
- Windows/PowerShell caveat: never use `Get-Content -Raw`/`Set-Content` without `-Encoding utf8` on files containing Korean text — it corrupts them. Use the Edit/Write tools instead.
- Follow this project's established repository/IPC/service three-layer pattern exactly: SQL only in `electron/main/database/*Repository.ts`, IPC handlers validate with Zod then call repository functions, renderer components never call `window.api` directly (only via `src/services/*` React Query hooks).
- Run `npm run typecheck && npm run lint && npm run test` after every task; run the full suite (not just the new test file) at least once per task to catch regressions early.

---

### Task 1: `path_code_overrides` table + repository

**Files:**
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Create: `electron/main/database/pathCodeOverridesRepository.ts`
- Create: `electron/main/database/pathCodeOverridesRepository.test.ts`

**Interfaces:**
- Produces: `setPathCodeOverride(db, normalizedPath: string, code: string): void`, `getPathCodeOverride(db, normalizedPath: string): string | null` — Task 3 (scanner fallback) and Task 4 (link-code IPC handler) consume both.

- [ ] **Step 1: Add the table to `schema.ts`**

Add after the existing `gameUserData` export (don't touch anything else in the file):

```ts
export const pathCodeOverrides = sqliteTable('path_code_overrides', {
  path: text('path').primaryKey(), // normalized via normalizeLibraryPath
  code: text('code').notNull(),
  createdAt: text('created_at').notNull(),
})
```

- [ ] **Step 2: Add the `CREATE TABLE` to `client.ts`**

Add after the existing `game_user_data` block (don't touch anything else):

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS path_code_overrides (
      path TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
```

- [ ] **Step 3: Write failing tests**

`electron/main/database/pathCodeOverridesRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { setPathCodeOverride, getPathCodeOverride } from './pathCodeOverridesRepository'

describe('pathCodeOverridesRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns null when no override exists for a path', () => {
    expect(getPathCodeOverride(db, 'd:\\games\\some-folder')).toBeNull()
  })

  it('stores and retrieves an override', () => {
    setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ01234567')
    expect(getPathCodeOverride(db, 'd:\\games\\some-folder')).toBe('RJ01234567')
  })

  it('overwrites an existing override for the same path', () => {
    setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ01234567')
    setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ09999999')
    expect(getPathCodeOverride(db, 'd:\\games\\some-folder')).toBe('RJ09999999')
  })
})
```

- [ ] **Step 4: Run to confirm failure**

Run: `npm run test -- electron/main/database/pathCodeOverridesRepository.test.ts`
Expected: FAIL — `pathCodeOverridesRepository.ts` does not exist.

- [ ] **Step 5: Implement `pathCodeOverridesRepository.ts`**

```ts
import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { pathCodeOverrides } from './schema'

export function getPathCodeOverride(db: AppDatabase, normalizedPath: string): string | null {
  const row = db
    .select({ code: pathCodeOverrides.code })
    .from(pathCodeOverrides)
    .where(eq(pathCodeOverrides.path, normalizedPath))
    .get()
  return row?.code ?? null
}

export function setPathCodeOverride(
  db: AppDatabase,
  normalizedPath: string,
  code: string
): void {
  const now = new Date().toISOString()
  db.insert(pathCodeOverrides)
    .values({ path: normalizedPath, code, createdAt: now })
    .onConflictDoUpdate({ target: pathCodeOverrides.path, set: { code } })
    .run()
}
```

- [ ] **Step 6: Run to confirm pass**

Run: `npm run test -- electron/main/database/pathCodeOverridesRepository.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/pathCodeOverridesRepository.ts electron/main/database/pathCodeOverridesRepository.test.ts
git commit -m "feat: add path_code_overrides table and repository"
```

---

### Task 2: Fix `rekeyToCode`'s data-loss bug (deterministic conflict merge)

**Files:**
- Modify: `electron/main/database/gameUserDataRepository.ts`
- Modify: `electron/main/database/gameUserDataRepository.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `rekeyToCode(db, oldPathKey, newCode)` — same signature as before, callers unaffected. Task 4's IPC handler is `rekeyToCode`'s first real caller.

**Context:** `rekeyToCode` already exists (see the current file — it migrates a path-keyed row onto a code key) but has never had a real caller, so its conflict-fallback path (what happens when `newCode` already has its own row) has never mattered until now. Today that fallback only bumps `updatedAt` and silently discards everything from the path row. This task replaces that with the deterministic merge from this plan's Global Constraints.

- [ ] **Step 1: Read the existing `gameUserDataRepository.test.ts` file's rekey tests first**

Run: `npm run test -- electron/main/database/gameUserDataRepository.test.ts`
Expected: PASS, current count (confirm the exact number by reading the test output — do not assume a stale count from this plan text, this repository has had tests added across several prior plans).

- [ ] **Step 2: Write the failing regression test**

Add to `electron/main/database/gameUserDataRepository.test.ts` (inside the existing `describe('gameUserDataRepository', ...)` block, near the other rekey tests):

```ts
it('rekeying onto an existing code-keyed row merges without losing either side\'s data', () => {
  // The code already has its own accumulated data (e.g. crawled/favorited independently).
  setFavorite(db, 'RJ07777777', 'code', true)
  setRatingAndMemo(db, 'RJ07777777', 'code', 4, 'code-side memo')

  // The path also has its own accumulated data (playtime, save path) - nothing
  // the code row has yet.
  recordPlaySession(db, 'd:\\games\\some-folder', 'path', 90_000)
  setSavePath(db, 'd:\\games\\some-folder', 'path', 'd:\\saves\\some-folder')

  rekeyToCode(db, 'd:\\games\\some-folder', 'RJ07777777')

  const merged = getGameUserData(db, 'RJ07777777')
  // Code row's non-default values win.
  expect(merged?.isFavorite).toBe(true)
  expect(merged?.rating).toBe(4)
  expect(merged?.memo).toBe('code-side memo')
  // Path row backfills fields the code row left at default.
  expect(merged?.totalPlaytimeMs).toBe(90_000)
  expect(merged?.savePath).toBe('d:\\saves\\some-folder')
  // The old path-keyed row is gone.
  expect(getGameUserData(db, 'd:\\games\\some-folder')).toBeUndefined()
})

it('rekeying onto an existing code-keyed row backfills isFavorite from the path row when the code row was never favorited', () => {
  touchGameUserData(db, 'RJ08888888', 'code') // exists, but isFavorite defaults to false
  setFavorite(db, 'd:\\games\\another-folder', 'path', true)

  rekeyToCode(db, 'd:\\games\\another-folder', 'RJ08888888')

  expect(getGameUserData(db, 'RJ08888888')?.isFavorite).toBe(true)
})
```

- [ ] **Step 3: Run to confirm the first new test fails**

Run: `npm run test -- electron/main/database/gameUserDataRepository.test.ts`
Expected: FAIL on the first new test — `merged?.totalPlaytimeMs` is `0`, not `90_000` (today's code silently drops it). The second new test currently passes by accident (`isFavorite: false` in the `set` clause of the old `onConflictDoUpdate` — wait, check the actual current behavior: today's fallback only sets `updatedAt`, so `isFavorite` stays whatever the code row already had — for `touchGameUserData`, that's `false`, never updated to `true`. So both new tests should fail against today's code.)

- [ ] **Step 4: Replace `rekeyToCode`**

```ts
export function rekeyToCode(db: AppDatabase, oldPathKey: string, newCode: string): void {
  const existing = getGameUserData(db, oldPathKey)
  if (!existing || existing.keyType !== 'path') return

  const currentCodeRow = getGameUserData(db, newCode)
  const now = new Date().toISOString()

  const merged = {
    isFavorite: (currentCodeRow?.isFavorite ?? false) || existing.isFavorite,
    rating: currentCodeRow?.rating ?? existing.rating,
    memo: currentCodeRow?.memo ?? existing.memo,
    launchConfig: currentCodeRow?.launchConfig ?? existing.launchConfig,
    totalPlaytimeMs:
      currentCodeRow && currentCodeRow.totalPlaytimeMs !== 0
        ? currentCodeRow.totalPlaytimeMs
        : existing.totalPlaytimeMs,
    lastPlayedAt: currentCodeRow?.lastPlayedAt ?? existing.lastPlayedAt,
    savePath: currentCodeRow?.savePath ?? existing.savePath,
    createdAt: currentCodeRow?.createdAt ?? existing.createdAt,
  }

  db.transaction((tx) => {
    tx.delete(gameUserData).where(eq(gameUserData.key, oldPathKey)).run()
    tx.insert(gameUserData)
      .values({
        key: newCode,
        keyType: 'code',
        isFavorite: merged.isFavorite,
        rating: merged.rating,
        memo: merged.memo,
        launchConfig: merged.launchConfig ? JSON.stringify(merged.launchConfig) : null,
        totalPlaytimeMs: merged.totalPlaytimeMs,
        lastPlayedAt: merged.lastPlayedAt,
        savePath: merged.savePath,
        createdAt: merged.createdAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: gameUserData.key,
        set: {
          isFavorite: merged.isFavorite,
          rating: merged.rating,
          memo: merged.memo,
          launchConfig: merged.launchConfig ? JSON.stringify(merged.launchConfig) : null,
          totalPlaytimeMs: merged.totalPlaytimeMs,
          lastPlayedAt: merged.lastPlayedAt,
          savePath: merged.savePath,
          updatedAt: now,
        },
      })
      .run()
  })
}
```

- [ ] **Step 5: Run to confirm all pass**

Run: `npm run test -- electron/main/database/gameUserDataRepository.test.ts`
Expected: PASS, all tests including the pre-existing ones (the pre-existing "rekeys a path-keyed row to a code, preserving createdAt" test and its sibling covering the other fields must still pass — this change must not regress the no-conflict case, only fix the conflict case).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add electron/main/database/gameUserDataRepository.ts electron/main/database/gameUserDataRepository.test.ts
git commit -m "fix: merge deterministically instead of dropping data when rekeyToCode conflicts with an existing code row"
```

---

### Task 3: Scanner override fallback

**Files:**
- Create: `electron/main/scanner/applyPathCodeOverrides.ts`
- Create: `electron/main/scanner/applyPathCodeOverrides.test.ts`
- Modify: `electron/main/ipc/scannerHandlers.ts`
- Modify: `electron/main/index.ts`

**Interfaces:**
- Consumes: `getPathCodeOverride` (Task 1), `normalizeLibraryPath` (`electron/main/database/librariesRepository.ts`, already exists).
- Produces: `applyPathCodeOverrides(db, entries: ScannedEntry[]): ScannedEntry[]` — Task 4 does not consume this directly, but this task's IPC wiring is what makes a linked code visible on the next scan.

**Design note:** This is deliberately a post-processing step over the IPC handler's scan results, not a change to `folderScanner.ts`'s pure, already-well-tested `scanFolderShallow`/`scanLibraryRecursive`/`toScannedEntry` functions. Those functions have no database dependency today; keeping it that way avoids threading `db` through a module that has neither needed nor had it, and keeps the override concern isolated to one small new file.

- [ ] **Step 1: Write the failing test**

`electron/main/scanner/applyPathCodeOverrides.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from '../database/client'
import { setPathCodeOverride } from '../database/pathCodeOverridesRepository'
import { applyPathCodeOverrides } from './applyPathCodeOverrides'
import type { ScannedEntry } from '../../../shared/types/scanner'

function makeEntry(overrides: Partial<ScannedEntry> = {}): ScannedEntry {
  return {
    name: 'some-folder',
    path: 'D:\\games\\some-folder',
    kind: 'folder',
    mtimeMs: 0,
    size: 0,
    code: null,
    ...overrides,
  }
}

describe('applyPathCodeOverrides', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('leaves entries with no override untouched', () => {
    const entries = [makeEntry()]
    const result = applyPathCodeOverrides(db, entries)
    expect(result[0]?.code).toBeNull()
  })

  it('fills in code from an override, matching case-insensitively via normalization', () => {
    setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ01234567')
    const entries = [makeEntry({ path: 'D:\\games\\some-folder' })]
    const result = applyPathCodeOverrides(db, entries)
    expect(result[0]?.code).toEqual({ type: 'RJ', value: 'RJ01234567' })
  })

  it('never overrides an entry that already has a code from its filename', () => {
    setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ09999999')
    const entries = [makeEntry({ code: { type: 'RJ', value: 'RJ01234567' } })]
    const result = applyPathCodeOverrides(db, entries)
    expect(result[0]?.code?.value).toBe('RJ01234567')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm run test -- electron/main/scanner/applyPathCodeOverrides.test.ts`
Expected: FAIL — `applyPathCodeOverrides.ts` does not exist.

- [ ] **Step 3: Implement `applyPathCodeOverrides.ts`**

```ts
import type { AppDatabase } from '../database/client'
import { getPathCodeOverride } from '../database/pathCodeOverridesRepository'
import { normalizeLibraryPath } from '../database/librariesRepository'
import type { GameCode, GameCodeType, ScannedEntry } from '../../../shared/types/scanner'

function toGameCode(code: string): GameCode {
  const type = code.slice(0, 2) as GameCodeType
  return { type, value: code }
}

// The scanner (folderScanner.ts) derives ScannedEntry.code purely from the
// filename and has no database dependency. This runs as a post-processing
// step over its results so a manually-linked code (see path_code_overrides,
// set via the "코드 연동" feature) keeps showing up on future scans without
// requiring the user to rename the folder.
export function applyPathCodeOverrides(db: AppDatabase, entries: ScannedEntry[]): ScannedEntry[] {
  return entries.map((entry) => {
    if (entry.code) return entry
    const overrideCode = getPathCodeOverride(db, normalizeLibraryPath(entry.path))
    if (!overrideCode) return entry
    return { ...entry, code: toGameCode(overrideCode) }
  })
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm run test -- electron/main/scanner/applyPathCodeOverrides.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire into `scannerHandlers.ts`**

Change the file to accept `db` and apply overrides to both scan handlers' results. Replace the full file:

```ts
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { ipcMain } from 'electron'
import {
  GetThumbnailRequestSchema,
  IPC_CHANNELS,
  ScanRecursiveRequestSchema,
  ScanShallowRequestSchema,
} from '../../../shared/types/ipc'
import { scanFolderShallow, scanLibraryRecursive } from '../scanner/folderScanner'
import { findThumbnailPath } from '../scanner/thumbnail'
import { applyPathCodeOverrides } from '../scanner/applyPathCodeOverrides'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { AppDatabase } from '../database/client'

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

export async function encodeThumbnail(imagePath: string): Promise<string> {
  const buffer = await readFile(imagePath)
  const mimeType = MIME_TYPES[extname(imagePath).toLowerCase()] ?? 'application/octet-stream'
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export function registerScannerHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SCANNER_SCAN_RECURSIVE, async (_event, payload: unknown) => {
    const { libraryPaths } = ScanRecursiveRequestSchema.parse(payload)
    const results = await Promise.all(
      libraryPaths.map(async (libraryPath): Promise<ScannedEntry[]> => {
        try {
          return await scanLibraryRecursive(libraryPath)
        } catch {
          // Library path no longer exists (deleted/unmounted drive) - skip it,
          // the rest of the registered libraries still scan normally.
          return []
        }
      })
    )
    return applyPathCodeOverrides(db, results.flat())
  })

  ipcMain.handle(IPC_CHANNELS.SCANNER_SCAN_SHALLOW, async (_event, payload: unknown) => {
    const { dirPath } = ScanShallowRequestSchema.parse(payload)
    const results = await scanFolderShallow(dirPath)
    return applyPathCodeOverrides(db, results)
  })

  ipcMain.handle(IPC_CHANNELS.SCANNER_GET_THUMBNAIL, async (_event, payload: unknown) => {
    const { entryPath } = GetThumbnailRequestSchema.parse(payload)

    const stats = await stat(entryPath).catch(() => null)
    if (!stats || !stats.isDirectory()) return null

    const thumbnailPath = await findThumbnailPath(entryPath)
    if (!thumbnailPath) return null

    return encodeThumbnail(thumbnailPath)
  })
}
```

- [ ] **Step 6: Update the registration call in `electron/main/index.ts`**

Change `registerScannerHandlers()` to `registerScannerHandlers(db)` (single-line change; leave every other registration call untouched).

- [ ] **Step 7: Run the full test suite and typecheck/lint**

Run: `npm run test && npm run typecheck && npm run lint`
Expected: all exit 0. Pay attention to any existing `scannerHandlers`-adjacent test — if one exists, confirm it still passes with the new `db` parameter (search for it first: `Glob electron/main/ipc/scannerHandlers.test.ts` — if it doesn't exist, no action needed).

- [ ] **Step 8: Commit**

```bash
git add electron/main/scanner/applyPathCodeOverrides.ts electron/main/scanner/applyPathCodeOverrides.test.ts electron/main/ipc/scannerHandlers.ts electron/main/index.ts
git commit -m "feat: apply path_code_overrides to scan results so linked codes survive rescans"
```

---

### Task 4: `gameUserData:link-code` IPC handler

**Files:**
- Modify: `shared/types/ipc.ts`
- Modify: `electron/main/ipc/gameUserDataHandlers.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Consumes: `setPathCodeOverride` (Task 1), `rekeyToCode` (Task 2, now fixed).
- Produces: `window.api.gameUserData.linkCode(path: string, code: GameCode): Promise<void>` — Task 5's `useLinkCode` hook consumes this.

- [ ] **Step 1: Add the channel and schema to `shared/types/ipc.ts`**

Add to `IPC_CHANNELS` (after `GAME_USER_DATA_LIST_RECENTLY_PLAYED`):

```ts
  GAME_USER_DATA_LINK_CODE: 'game-user-data:link-code',
```

Add near the other `GameUserData*RequestSchema` definitions:

```ts
export const LinkCodeRequestSchema = z.object({
  path: z.string(),
  code: GameCodeSchema,
})
export type LinkCodeRequest = z.infer<typeof LinkCodeRequestSchema>
```

- [ ] **Step 2: Add the handler to `gameUserDataHandlers.ts`**

Import additions at the top:

```ts
import {
  GetGameUserDataRequestSchema,
  IPC_CHANNELS,
  LinkCodeRequestSchema,
  SetFavoriteRequestSchema,
  SetRatingAndMemoRequestSchema,
  type GameUserDataDto,
} from '../../../shared/types/ipc'
import {
  getGameUserData,
  setFavorite,
  setRatingAndMemo,
  listFavoriteKeys,
  listRecentlyPlayedKeys,
  rekeyToCode,
} from '../database/gameUserDataRepository'
import { setPathCodeOverride } from '../database/pathCodeOverridesRepository'
import { normalizeLibraryPath } from '../database/librariesRepository'
```

Add inside `registerGameUserDataHandlers`, after the existing `GAME_USER_DATA_LIST_RECENTLY_PLAYED` handler:

```ts
  ipcMain.handle(IPC_CHANNELS.GAME_USER_DATA_LINK_CODE, (_event, payload: unknown) => {
    const { path, code } = LinkCodeRequestSchema.parse(payload)
    const normalizedPath = normalizeLibraryPath(path)
    setPathCodeOverride(db, normalizedPath, code.value)
    rekeyToCode(db, normalizedPath, code.value)
  })
```

- [ ] **Step 3: Expose via preload**

In `electron/preload/index.ts`, add to the `gameUserData` object (after `listRecentlyPlayed`):

```ts
    linkCode: (path: string, code: GameCode): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_USER_DATA_LINK_CODE, { path, code }),
```

`GameCode` is already imported in this file (used elsewhere for `metadata`/`launch`/`save` methods) — no new import needed.

- [ ] **Step 4: Write a failing integration test exercising the full chain the handler performs**

The IPC handler itself has no dedicated test (thin plumbing calling two already-tested functions, matching this codebase's established pattern for handlers with no logic of their own) — but the SEQUENCE it performs (write an override, then rekey) is real logic worth a real test, without needing to mock Electron's `ipcMain`. Add this to `electron/main/database/pathCodeOverridesRepository.test.ts` (it already has the exact db fixture this needs):

```ts
import { rekeyToCode, getGameUserData, setFavorite } from './gameUserDataRepository'

// ... (inside the existing describe block, after the other tests)

it('composes with rekeyToCode exactly as the link-code IPC handler does: override written, existing path-keyed data migrated', () => {
  setFavorite(db, 'd:\\games\\some-folder', 'path', true)

  setPathCodeOverride(db, 'd:\\games\\some-folder', 'RJ01234567')
  rekeyToCode(db, 'd:\\games\\some-folder', 'RJ01234567')

  expect(getPathCodeOverride(db, 'd:\\games\\some-folder')).toBe('RJ01234567')
  expect(getGameUserData(db, 'RJ01234567')?.isFavorite).toBe(true)
  expect(getGameUserData(db, 'd:\\games\\some-folder')).toBeUndefined()
})
```

- [ ] **Step 5: Run to confirm pass**

Run: `npm run test -- electron/main/database/pathCodeOverridesRepository.test.ts`
Expected: PASS, 4 tests (this test should pass immediately since it only composes two already-implemented, already-tested functions — if it fails, the bug is in how this task's handler code called them, not in the functions themselves; re-check Step 2's handler body against this test's call order).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Manual trace verification of the handler itself**

Read back the handler you wrote in Step 2 and confirm `path` is normalized exactly once, via the same `normalizeLibraryPath` call, before being used as both the override key and the `rekeyToCode` old-key argument — a mismatch between the two would mean the override table and `game_user_data` end up keyed differently for the same logical path, which Step 4's test does not directly catch (it calls the two functions with an already-normalized literal, not through the handler's own normalization step).

- [ ] **Step 8: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/gameUserDataHandlers.ts electron/preload/index.ts electron/main/database/pathCodeOverridesRepository.test.ts
git commit -m "feat: add gameUserData:link-code IPC handler"
```

---

### Task 5: `useLinkCode` hook + `LinkCodeDialog` component

**Files:**
- Modify: `src/services/gameUserDataService.ts`
- Create: `src/components/game/LinkCodeDialog.tsx`

**Interfaces:**
- Consumes: `window.api.gameUserData.linkCode` (Task 4), `useCrawlGameMetadata` (already exists in `src/services/metadataService.ts`), `parseCodeInput` (already exists at `src/pages/DlsiteSearch/parseCodeInput.ts`).
- Produces: `useLinkCode()` mutation hook, `<LinkCodeDialog>` component — Task 6 wires this into `DetailOverlay`.

- [ ] **Step 1: Add `useLinkCode` to `gameUserDataService.ts`**

Add the import at the top (extend the existing `import type { ScannedEntry }` line's neighbor — add a new import line, don't modify the existing ones):

```ts
import type { GameCode } from '../../shared/types/scanner'
```

Add at the end of the file:

```ts
export function useLinkCode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, code }: { path: string; code: GameCode }) =>
      window.api.gameUserData.linkCode(path, code),
    onSuccess: () => {
      // The linked entry's identity changed (path-keyed -> code-keyed), and
      // its ScannedEntry.code will only reflect that after a rescan - the
      // simplest correct invalidation is all three caches that could now be
      // stale: this entry's own user-data cache (key changed), the
      // favorite/recently-played lists (could now show under a new key),
      // and the live scan results Gallery/List/DetailList/Explorer read.
      queryClient.invalidateQueries({ queryKey: ['game-user-data'] })
      queryClient.invalidateQueries({ queryKey: ['games'] })
      queryClient.invalidateQueries({ queryKey: ['folder-scan'] })
    },
  })
}
```

- [ ] **Step 2: Implement `LinkCodeDialog.tsx`**

```tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useLinkCode } from '../../services/gameUserDataService'
import { useCrawlGameMetadata } from '../../services/metadataService'
import { parseCodeInput } from '../../pages/DlsiteSearch/parseCodeInput'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface LinkCodeDialogProps {
  entry: ScannedEntry | null
  onClose: () => void
}

export function LinkCodeDialog({ entry, onClose }: LinkCodeDialogProps) {
  const [input, setInput] = useState('')
  const linkCode = useLinkCode()
  const crawlMetadata = useCrawlGameMetadata()

  const parsedCode = parseCodeInput(input)

  const handleConfirm = (): void => {
    if (!entry || !parsedCode) return
    linkCode.mutate(
      { path: entry.path, code: parsedCode },
      {
        onSuccess: () => {
          crawlMetadata.mutate(parsedCode)
          onClose()
        },
      }
    )
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>코드 연동 {entry ? `- ${entry.name}` : ''}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          폴더명을 직접 바꾸면 기존 즐겨찾기/평점 기록이 유지되지 않습니다. 데이터를 유지하려면
          여기서 코드를 연동하세요.
        </p>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="RJ01234567"
        />
        <Button onClick={handleConfirm} disabled={!parsedCode || linkCode.isPending}>
          연동
        </Button>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/services/gameUserDataService.ts src/components/game/LinkCodeDialog.tsx
git commit -m "feat: add useLinkCode hook and LinkCodeDialog component"
```

---

### Task 6: Relocate `DetailOverlay`, add code-less support + code-linking button, extract `useGameDetailOverlay`

**Files:**
- Create: `src/components/game/DetailOverlay.tsx` (moved from `src/pages/Explorer/DetailOverlay.tsx`, which is deleted)
- Create: `src/hooks/useGameDetailOverlay.tsx`
- Modify: `src/pages/Explorer/FolderView.tsx`

**Interfaces:**
- Consumes: `LinkCodeDialog` (Task 5).
- Produces: `useGameDetailOverlay(): { openDetail: (entry: ScannedEntry) => void; DetailOverlayElement: () => JSX.Element }` — Tasks 7, 8, 9 (Gallery/List/DetailList) and this project's Explorer Search plan all consume this.

**Design note (read before writing code):** `FolderView`'s current click handler is `if (entry.code) { setSelectedGame(entry) } else if (entry.kind === 'folder') { onNavigate(entry.path) }` — clicking a code-less FOLDER navigates into it; clicking a code-less FILE does nothing. Explorer's core navigation model (clicking a folder browses into it) must not change — a code-less folder is exactly what a user browses through to find the game folder they want to link a code to. The fix is: code-less FILES also open the detail overlay now (previously did nothing); code-less FOLDERS still navigate (unchanged) but gain a **right-click context menu item** "코드 연동" so the user can still open the detail/link-code flow for a folder without clicking into it. Coded entries (file or folder) already opened the overlay and still do.

- [ ] **Step 1: Move `DetailOverlay.tsx` and add code-less + code-linking support**

Create `src/components/game/DetailOverlay.tsx` with this content (note the changed import paths, since this file now lives one directory shallower relative to `shared/`, `components/ui`, and `services`, plus the two new imports and the restructured JSX described below):

```tsx
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { RatingMemoDialog } from './RatingMemoDialog'
import { LaunchConfigDialog } from './LaunchConfigDialog'
import { LinkCodeDialog } from './LinkCodeDialog'
import { useThumbnail } from '../../services/thumbnailService'
import { useOpenExternal } from '../../services/shellService'
import { useLaunchGame } from '../../services/launchService'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface DetailOverlayProps {
  game: ScannedEntry | null
  onClose: () => void
}

export function DetailOverlay({ game, onClose }: DetailOverlayProps) {
  const { data: thumbnail } = useThumbnail(game?.path ?? '', game?.kind ?? 'file')
  const openExternal = useOpenExternal()
  const launchGame = useLaunchGame()
  const [editingRating, setEditingRating] = useState(false)
  const [configuringLaunch, setConfiguringLaunch] = useState(false)
  const [linkingCode, setLinkingCode] = useState(false)

  useEffect(() => {
    if (!game) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key === 'Enter' && game.kind === 'folder') {
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return // 메모 입력 중엔 무시
        event.preventDefault()
        launchGame.mutate(game)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [game, launchGame])

  return (
    <Dialog open={game !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {game && (
          <>
            <DialogHeader>
              <DialogTitle>{game.name}</DialogTitle>
            </DialogHeader>
            <div className="flex gap-4">
              <div className="h-40 w-32 shrink-0 overflow-hidden rounded bg-muted">
                {thumbnail && (
                  <img
                    src={thumbnail}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                {game.code ? (
                  <button
                    className="text-left underline-offset-2 hover:underline"
                    onClick={() => game.code && openExternal.mutate(game.code)}
                  >
                    작품번호: {game.code.value}
                  </button>
                ) : (
                  <p>코드없음</p>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {game.code && (
                <Button onClick={() => game.code && openExternal.mutate(game.code)}>
                  DLsite 열기
                </Button>
              )}
              <Button variant="secondary" onClick={() => console.log('open folder', game.path)}>
                폴더 열기
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (game.kind === 'folder') launchGame.mutate(game)
                }}
              >
                실행
              </Button>
              <Button variant="secondary" onClick={() => setConfiguringLaunch(true)}>
                실행 설정
              </Button>
              <Button variant="secondary" onClick={() => setEditingRating(true)}>
                평점/메모
              </Button>
              {!game.code && (
                <Button variant="secondary" onClick={() => setLinkingCode(true)}>
                  코드 연동
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
      <RatingMemoDialog
        key={editingRating && game ? (game.code ? game.code.value : game.path) : 'closed'}
        entry={editingRating ? game : null}
        onClose={() => setEditingRating(false)}
      />
      <LaunchConfigDialog
        key={configuringLaunch && game ? (game.code ? game.code.value : game.path) : 'closed'}
        entry={configuringLaunch ? game : null}
        onClose={() => setConfiguringLaunch(false)}
      />
      <LinkCodeDialog
        key={linkingCode && game ? game.path : 'closed'}
        entry={linkingCode ? game : null}
        onClose={() => setLinkingCode(false)}
      />
    </Dialog>
  )
}
```

Delete `src/pages/Explorer/DetailOverlay.tsx` (its content is now `src/components/game/DetailOverlay.tsx`).

- [ ] **Step 2: Implement `useGameDetailOverlay.tsx`**

```tsx
import { useState } from 'react'
import { DetailOverlay } from '../components/game/DetailOverlay'
import type { ScannedEntry } from '../../shared/types/scanner'

// Each page (Gallery/List/DetailList/Explorer) calls this locally - no
// global/Zustand state, matching this project's established "search/filter
// state is independent per page" convention. Each page renders
// <DetailOverlayElement /> once and calls openDetail(entry) from its
// card/row click handler (or, for Explorer's code-less folders, from a
// context-menu action instead of a click - see FolderView.tsx).
export function useGameDetailOverlay(): {
  openDetail: (entry: ScannedEntry) => void
  DetailOverlayElement: () => JSX.Element
} {
  const [selectedGame, setSelectedGame] = useState<ScannedEntry | null>(null)

  const openDetail = (entry: ScannedEntry): void => {
    setSelectedGame(entry)
  }

  function DetailOverlayElement(): JSX.Element {
    return <DetailOverlay game={selectedGame} onClose={() => setSelectedGame(null)} />
  }

  return { openDetail, DetailOverlayElement }
}
```

- [ ] **Step 3: Update `FolderView.tsx`**

Replace the full file:

```tsx
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../components/ui/context-menu'
import { pathToBreadcrumbSegments } from './breadcrumb'
import { useExplorerStore } from '../../stores/explorerStore'
import { useThumbnail } from '../../services/thumbnailService'
import { useOpenExternal } from '../../services/shellService'
import { useFolderScan } from '../../services/scannerService'
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface FolderViewProps {
  tabId: string
  path: string
  onNavigate: (path: string) => void
}

function FolderEntryContextMenu({
  entry,
  onOpenInNewTab,
  onOpenDetail,
}: {
  entry: ScannedEntry
  onOpenInNewTab: (entry: ScannedEntry) => void
  onOpenDetail: (entry: ScannedEntry) => void
}) {
  const openExternal = useOpenExternal()

  if (entry.code) {
    return (
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => console.log('launch', entry.path)}>실행</ContextMenuItem>
        <ContextMenuItem onSelect={() => entry.code && openExternal.mutate(entry.code)}>
          DLsite 페이지 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('open folder', entry.path)}>
          폴더 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.code?.value ?? '')}>
          RJ번호 복사
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.name)}>
          제목 복사
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('edit custom title', entry.path)}>
          사용자 지정 제목 편집
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('refresh metadata', entry.code?.value)}>
          메타데이터 새로고침
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('redownload cover', entry.code?.value)}>
          커버 이미지 재다운로드
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('extract archive', entry.path)}>
          압축 해제
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('toggle favorite', entry.path)}>
          즐겨찾기 설정
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('edit memo', entry.path)}>
          메모 설정
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('set rating', entry.path)}>
          평점 설정
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }

  if (entry.kind === 'folder') {
    return (
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onOpenInNewTab(entry)}>새 탭으로 열기</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('reveal in OS explorer', entry.path)}>
          탐색기(OS)에서 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('pin favorite', entry.path)}>
          즐겨찾기로 고정
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onOpenDetail(entry)}>코드 연동</ContextMenuItem>
      </ContextMenuContent>
    )
  }

  return null
}

function FolderEntryRow({
  entry,
  onOpenInNewTab,
  onEntryClick,
  onOpenDetail,
}: {
  entry: ScannedEntry
  onOpenInNewTab: (entry: ScannedEntry) => void
  onEntryClick: (entry: ScannedEntry) => void
  onOpenDetail: (entry: ScannedEntry) => void
}) {
  const { data: thumbnail } = useThumbnail(entry.path, entry.kind)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
          onClick={() => onEntryClick(entry)}
        >
          {entry.code && (
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
              {thumbnail && (
                <img
                  src={thumbnail}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              )}
            </div>
          )}
          <span className="truncate">{entry.name}</span>
        </li>
      </ContextMenuTrigger>
      <FolderEntryContextMenu entry={entry} onOpenInNewTab={onOpenInNewTab} onOpenDetail={onOpenDetail} />
    </ContextMenu>
  )
}

export function FolderView({ tabId, path, onNavigate }: FolderViewProps) {
  const { openDetail, DetailOverlayElement } = useGameDetailOverlay()
  const addTab = useExplorerStore((s) => s.addTab)
  const breadcrumbs = pathToBreadcrumbSegments(path)

  // useFolderScan's queryKey includes `path`, so React Query automatically
  // re-fetches when it changes - ExplorerPage keys FolderView only on the
  // active tab's id, not its path, so navigating into a subfolder (or via
  // breadcrumb) updates `path` without unmounting this component.
  const { data: entries = [], isError } = useFolderScan(path)

  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('explorer')
  const sortedEntries = sortEntries(entries, sortField, sortDirection)

  const openInNewTab = (entry: ScannedEntry): void => {
    addTab({ label: entry.name, path: entry.path })
  }

  // Coded entries (file or folder) and code-less files open the detail
  // overlay. Code-less folders still navigate into them - clicking through
  // folders to find a game is Explorer's core browsing model, and a
  // code-less folder is exactly what a user browses through on their way to
  // linking a code (via the right-click "코드 연동" item above, not a click).
  const handleEntryClick = (entry: ScannedEntry): void => {
    if (entry.code) {
      openDetail(entry)
    } else if (entry.kind === 'folder') {
      onNavigate(entry.path)
    } else {
      openDetail(entry)
    }
  }

  return (
    <div className="flex h-full flex-col" data-tab-id={tabId}>
      <div className="flex items-center gap-1 border-b border-border px-4 py-2 text-sm text-muted-foreground">
        {breadcrumbs.map((segment, index) => (
          <span key={segment.path} className="flex items-center gap-1">
            {index > 0 && <span>/</span>}
            <button
              className="hover:text-foreground hover:underline"
              onClick={() => onNavigate(segment.path)}
            >
              {segment.label}
            </button>
          </span>
        ))}
      </div>
      <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
      {isError ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          이 폴더에 접근할 수 없습니다.
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-auto">
          {sortedEntries.map((entry) => (
            <FolderEntryRow
              key={entry.path}
              entry={entry}
              onOpenInNewTab={openInNewTab}
              onEntryClick={handleEntryClick}
              onOpenDetail={openDetail}
            />
          ))}
        </ul>
      )}
      <DetailOverlayElement />
    </div>
  )
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. Confirm there are no remaining imports of `../../pages/Explorer/DetailOverlay` anywhere in the codebase (`Grep` for `Explorer/DetailOverlay` — should only match the new `components/game/DetailOverlay` path after this task).

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: all pass, no regressions (this task touches no test files directly, but confirms the move/refactor didn't break anything covered indirectly).

- [ ] **Step 6: Commit**

```bash
git add src/components/game/DetailOverlay.tsx src/hooks/useGameDetailOverlay.tsx src/pages/Explorer/FolderView.tsx
git rm src/pages/Explorer/DetailOverlay.tsx
git commit -m "refactor: relocate DetailOverlay to components/game, extract useGameDetailOverlay hook, support code-less entries and code linking"
```

---

### Task 7: Wire `useGameDetailOverlay` into Gallery

**Files:**
- Modify: `src/pages/Gallery/GalleryPage.tsx`

**Interfaces:**
- Consumes: `useGameDetailOverlay` (Task 6).

**Note before starting:** Read the actual current `GalleryPage.tsx` first — it may have been touched by other work since this plan was written (e.g. a parallel rating-display plan adds a star row inside `GameCard`'s JSX). The replacement below shows this task's own baseline; if the current file already differs in unrelated ways (extra JSX, different prop already added), apply this task's specific changes (the import, the hook call, `onOpenDetail` threading, the `onClick`, and `<DetailOverlayElement />`) onto the ACTUAL current file rather than blindly overwriting it with the block below, and note the adaptation in your report.

- [ ] **Step 1: Replace the full file**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Grid, type CellComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'
import { useGames } from '../../services/useGames'
import { useThumbnail } from '../../services/thumbnailService'
import {
  useGameUserData,
  useToggleFavorite,
  userDataQueryKey,
} from '../../services/gameUserDataService'
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
import { Skeleton } from '../../components/ui/skeleton'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { filterEntries } from '../../lib/filterEntries'
import { useGameMetadataMany } from '../../services/metadataService'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { GameUserDataDto } from '../../../shared/types/ipc'

const CARD_WIDTH = 180
const GAP = 16
const CARD_TEXT_BLOCK_HEIGHT = 16 + 36 + 20

function computeCardHeight(cardWidth: number): number {
  return cardWidth * (4 / 3) + CARD_TEXT_BLOCK_HEIGHT
}

const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.8
const ZOOM_STEP = 0.05

function GameCard({
  game,
  genres,
  onToggleGenreFilter,
  onHoverChange,
  onOpenDetail,
}: {
  game: ScannedEntry
  genres: string[]
  onToggleGenreFilter: (genre: string) => void
  onHoverChange: (game: ScannedEntry | null) => void
  onOpenDetail: (game: ScannedEntry) => void
}) {
  const { data: thumbnail } = useThumbnail(game.path, game.kind)
  const { data: userData } = useGameUserData(game)
  const toggleFavorite = useToggleFavorite()

  return (
    <motion.div
      onMouseEnter={() => onHoverChange(game)}
      onMouseLeave={() => onHoverChange(null)}
      onClick={() => onOpenDetail(game)}
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.15 }}
      className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <button
        aria-label="즐겨찾기 토글"
        onClick={(e) => {
          e.stopPropagation()
          toggleFavorite.mutate({ entry: game, isFavorite: !(userData?.isFavorite ?? false) })
        }}
        className="absolute right-2 top-2 z-10 rounded-full bg-background/70 p-1 text-muted-foreground hover:text-foreground"
      >
        <Heart className="h-4 w-4" fill={userData?.isFavorite ? 'currentColor' : 'none'} />
      </button>
      <div className="aspect-[3/4] w-full bg-muted">
        {thumbnail && (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <div className="shrink-0 p-2">
        <p className="truncate text-sm font-medium">{game.name}</p>
        {game.code && <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>}
        {genres.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {genres.slice(0, 3).map((genre) => (
              <button
                key={genre}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleGenreFilter(genre)
                }}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
              >
                {genre}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

interface GridCellProps {
  games: ScannedEntry[]
  columnCount: number
  gap: number
  cardWidth: number
  metadataByCode: Record<string, { genres: string[] }>
  onToggleGenreFilter: (genre: string) => void
  onHoverChange: (game: ScannedEntry | null) => void
  onOpenDetail: (game: ScannedEntry) => void
}

function GameCell({
  columnIndex,
  rowIndex,
  style,
  games,
  columnCount,
  gap,
  cardWidth,
  metadataByCode,
  onToggleGenreFilter,
  onHoverChange,
  onOpenDetail,
}: CellComponentProps<GridCellProps>) {
  const index = rowIndex * columnCount + columnIndex
  const game = games[index]
  if (!game) return null
  const genres = game.code ? (metadataByCode[game.code.value]?.genres ?? []) : []
  return (
    <div style={{ ...style, padding: gap / 2, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: cardWidth }}>
        <GameCard
          game={game}
          genres={genres}
          onToggleGenreFilter={onToggleGenreFilter}
          onHoverChange={onHoverChange}
          onOpenDetail={onOpenDetail}
        />
      </div>
    </div>
  )
}

export function GalleryPage() {
  const { data: games, isLoading } = useGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('gallery')
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const [hoveredGame, setHoveredGame] = useState<ScannedEntry | null>(null)
  const toggleFavoriteShortcut = useToggleFavorite()
  const queryClient = useQueryClient()
  const { openDetail, DetailOverlayElement } = useGameDetailOverlay()

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

  const toggleGenreFilter = (genre: string): void => {
    setExcludedGenres((current) =>
      current.includes(genre) ? current.filter((g) => g !== genre) : [...current, genre]
    )
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'f' || event.ctrlKey || event.altKey) return
      if (!hoveredGame) return
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return // 검색창 입력 중엔 무시
      event.preventDefault()
      const cached = queryClient.getQueryData<GameUserDataDto | null>(userDataQueryKey(hoveredGame))
      toggleFavoriteShortcut.mutate({
        entry: hoveredGame,
        isFavorite: !(cached?.isFavorite ?? false),
      })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hoveredGame, toggleFavoriteShortcut, queryClient])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      setZoom((current) => {
        const next = event.deltaY > 0 ? current - ZOOM_STEP : current + ZOOM_STEP
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
      })
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [isLoading])

  if (isLoading || !games) {
    return (
      <div className="grid grid-cols-5 gap-4 p-6">
        {Array.from({ length: 15 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
        ))}
      </div>
    )
  }

  const cardWidth = CARD_WIDTH * zoom
  const cardHeight = computeCardHeight(cardWidth)
  const gap = GAP * zoom

  const filteredGames =
    games.length > 0 ? filterEntries(games, metadataByCode, searchQuery, excludedGenres) : games
  const sortedGames =
    filteredGames.length > 0 ? sortEntries(filteredGames, sortField, sortDirection) : filteredGames

  return (
    <div className="flex h-full flex-col">
      <SearchHeader
        query={searchQuery}
        onQueryChange={setSearchQuery}
        excludedGenres={excludedGenres}
        onClearFilters={() => setExcludedGenres([])}
      />
      <PageToolbar
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={setSort}
        zoom={zoom}
        onZoomChange={setZoom}
      />
      {sortedGames.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.
        </div>
      ) : (
        <div ref={containerRef} className="h-full w-full p-6">
          <AutoSizer
            style={{ height: '100%', width: '100%' }}
            renderProp={({ height, width }) => {
              if (height === undefined || width === undefined) return null

              const columnCount = Math.max(1, Math.floor(width / (cardWidth + gap)))
              const usedWidth = columnCount * (cardWidth + gap)
              const extraPerColumn = columnCount > 0 ? (width - usedWidth) / columnCount : 0
              const effectiveColumnWidth = cardWidth + gap + extraPerColumn
              const rowCount = Math.ceil(sortedGames.length / columnCount)

              return (
                <Grid
                  cellComponent={GameCell}
                  cellProps={{
                    games: sortedGames,
                    columnCount,
                    gap,
                    cardWidth,
                    metadataByCode,
                    onToggleGenreFilter: toggleGenreFilter,
                    onHoverChange: setHoveredGame,
                    onOpenDetail: openDetail,
                  }}
                  columnCount={columnCount}
                  columnWidth={effectiveColumnWidth}
                  rowCount={rowCount}
                  rowHeight={cardHeight + gap}
                  style={{ height, width, overflowX: 'hidden' }}
                />
              )
            }}
          />
        </div>
      )}
      <DetailOverlayElement />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Gallery/GalleryPage.tsx
git commit -m "feat: open shared detail overlay on Gallery card click"
```

---

### Task 8: Wire `useGameDetailOverlay` into List

**Files:**
- Modify: `src/pages/List/ListPage.tsx`

**Interfaces:**
- Consumes: `useGameDetailOverlay` (Task 6).

**Note before starting:** Read the actual current `ListPage.tsx` first — it may have been touched by other work since this plan was written (e.g. a parallel rating-display plan adds a rating column). Apply this task's specific changes onto the actual current file if it already differs from the baseline below in unrelated ways, and note the adaptation in your report.

- [ ] **Step 1: Replace the full file**

```tsx
import { useState } from 'react'
import { List, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { Heart } from 'lucide-react'
import { useGames } from '../../services/useGames'
import { useThumbnail } from '../../services/thumbnailService'
import { useOpenExternal } from '../../services/shellService'
import { useGameUserData, useToggleFavorite } from '../../services/gameUserDataService'
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
import { Skeleton } from '../../components/ui/skeleton'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { filterEntries } from '../../lib/filterEntries'
import { useGameMetadataMany } from '../../services/metadataService'
import type { ScannedEntry } from '../../../shared/types/scanner'

const ROW_HEIGHT = 64

function formatMtime(mtimeMs: number): string {
  const date = new Date(mtimeMs)
  return date.toISOString().slice(0, 10)
}

function GameRow({
  game,
  genres,
  onToggleGenreFilter,
  onOpenDetail,
}: {
  game: ScannedEntry
  genres: string[]
  onToggleGenreFilter: (genre: string) => void
  onOpenDetail: (game: ScannedEntry) => void
}) {
  const { data: thumbnail } = useThumbnail(game.path, game.kind)
  const { data: userData } = useGameUserData(game)
  const toggleFavorite = useToggleFavorite()
  const openExternal = useOpenExternal()

  return (
    <div
      className="flex cursor-pointer items-center gap-4 border-b border-border px-4 py-2 transition-colors hover:bg-accent"
      onClick={() => onOpenDetail(game)}
    >
      <button
        aria-label="즐겨찾기 토글"
        onClick={(e) => {
          e.stopPropagation()
          toggleFavorite.mutate({ entry: game, isFavorite: !(userData?.isFavorite ?? false) })
        }}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <Heart className="h-4 w-4" fill={userData?.isFavorite ? 'currentColor' : 'none'} />
      </button>
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
        {thumbnail && (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 truncate text-sm font-medium">{game.name}</p>
          {genres.length > 0 && (
            <div className="flex shrink-0 gap-1">
              {genres.slice(0, 3).map((genre) => (
                <button
                  key={genre}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleGenreFilter(genre)
                  }}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
                >
                  {genre}
                </button>
              ))}
            </div>
          )}
        </div>
        {game.code ? (
          <button
            className="truncate text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={(e) => {
              e.stopPropagation()
              game.code && openExternal.mutate(game.code)
            }}
          >
            {game.code.value}
          </button>
        ) : (
          <p className="truncate text-xs text-muted-foreground">코드없음</p>
        )}
      </div>
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {formatMtime(game.mtimeMs)}
      </span>
    </div>
  )
}

interface ListRowProps {
  games: ScannedEntry[]
  metadataByCode: Record<string, { genres: string[] }>
  onToggleGenreFilter: (genre: string) => void
  onOpenDetail: (game: ScannedEntry) => void
}

function Row({
  index,
  style,
  games,
  metadataByCode,
  onToggleGenreFilter,
  onOpenDetail,
}: RowComponentProps<ListRowProps>) {
  const game = games[index]
  if (!game) return null
  const genres = game.code ? (metadataByCode[game.code.value]?.genres ?? []) : []
  return (
    <div style={style}>
      <GameRow
        game={game}
        genres={genres}
        onToggleGenreFilter={onToggleGenreFilter}
        onOpenDetail={onOpenDetail}
      />
    </div>
  )
}

export function ListPage() {
  const { data: games, isLoading } = useGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const { openDetail, DetailOverlayElement } = useGameDetailOverlay()

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

  const toggleGenreFilter = (genre: string): void => {
    setExcludedGenres((current) =>
      current.includes(genre) ? current.filter((g) => g !== genre) : [...current, genre]
    )
  }

  if (isLoading || !games) {
    return (
      <div className="flex flex-col gap-2 p-6">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    )
  }

  const filteredGames =
    games.length > 0 ? filterEntries(games, metadataByCode, searchQuery, excludedGenres) : games
  const sortedGames =
    filteredGames.length > 0 ? sortEntries(filteredGames, sortField, sortDirection) : filteredGames

  return (
    <div className="flex h-full flex-col">
      <SearchHeader
        query={searchQuery}
        onQueryChange={setSearchQuery}
        excludedGenres={excludedGenres}
        onClearFilters={() => setExcludedGenres([])}
      />
      <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
      {sortedGames.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.
        </div>
      ) : (
        <div className="h-full w-full">
          <AutoSizer
            style={{ height: '100%', width: '100%' }}
            renderProp={({ height, width }) => {
              if (height === undefined || width === undefined) return null

              return (
                <List
                  rowComponent={Row}
                  rowProps={{
                    games: sortedGames,
                    metadataByCode,
                    onToggleGenreFilter: toggleGenreFilter,
                    onOpenDetail: openDetail,
                  }}
                  rowCount={sortedGames.length}
                  rowHeight={ROW_HEIGHT}
                  style={{ height, width }}
                />
              )
            }}
          />
        </div>
      )}
      <DetailOverlayElement />
    </div>
  )
}
```

Note two behavior-preserving `stopPropagation()` additions beyond just the new `onOpenDetail` wiring: the favorite-heart button already had it; the DLsite-code button (`game.code.value`) did NOT previously need it (the row itself had no click handler before this task) but now does, since the row itself is clickable — without it, clicking the code button would both open DLsite AND open the detail overlay underneath. This is called out explicitly here so the implementer doesn't silently drop it while adapting to a possibly-already-modified file.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/pages/List/ListPage.tsx
git commit -m "feat: open shared detail overlay on List row click"
```

---

### Task 9: Wire `useGameDetailOverlay` into DetailList

**Files:**
- Modify: `src/pages/DetailList/DetailListPage.tsx`

**Interfaces:**
- Consumes: `useGameDetailOverlay` (Task 6).

**Note before starting:** Read the actual current `DetailListPage.tsx` first — it may have been touched by other work since this plan was written (e.g. a parallel rating-display plan adds a rating column and a `useGameUserData` call in `Row`). Apply this task's specific changes onto the actual current file if it already differs from the baseline below in unrelated ways, and note the adaptation in your report.

- [ ] **Step 1: Replace the full file**

```tsx
import { List, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { useState } from 'react'
import { useGames } from '../../services/useGames'
import { useGameMetadataMany } from '../../services/metadataService'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { filterEntries } from '../../lib/filterEntries'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { Skeleton } from '../../components/ui/skeleton'
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
import type { ScannedEntry } from '../../../shared/types/scanner'

const ROW_HEIGHT = 32

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)}${units[unitIndex]}`
}

function formatDate(mtimeMs: number): string {
  return new Date(mtimeMs).toISOString().slice(0, 10)
}

interface DetailListRowProps {
  entries: ScannedEntry[]
  metadataByCode: Record<string, { genres: string[] }>
  onOpenDetail: (entry: ScannedEntry) => void
}

function Row({
  index,
  style,
  entries,
  metadataByCode,
  onOpenDetail,
}: RowComponentProps<DetailListRowProps>) {
  const entry = entries[index]
  if (!entry) return null
  const genres = entry.code ? (metadataByCode[entry.code.value]?.genres ?? []) : []

  return (
    <div
      style={style}
      className="flex cursor-pointer items-center gap-4 border-b border-border px-4 text-xs text-muted-foreground"
      onClick={() => onOpenDetail(entry)}
    >
      <span className="w-28 shrink-0 truncate">{entry.code?.value ?? '-'}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{entry.name}</span>
      <span className="w-64 shrink-0 truncate">{entry.path}</span>
      <span className="w-40 shrink-0 truncate">{genres.join(', ')}</span>
      <span className="w-24 shrink-0">{formatDate(entry.mtimeMs)}</span>
      <span className="w-20 shrink-0">{formatSize(entry.size)}</span>
    </div>
  )
}

export function DetailListPage() {
  const { data: games, isLoading } = useGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('detail-list')
  const [searchQuery, setSearchQuery] = useState('')
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const { openDetail, DetailOverlayElement } = useGameDetailOverlay()

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

  if (isLoading || !games) {
    return (
      <div className="flex flex-col gap-1 p-4">
        {Array.from({ length: 15 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }

  const filtered = filterEntries(games, metadataByCode, searchQuery, excludedGenres)
  const sorted = sortEntries(filtered, sortField, sortDirection)

  return (
    <div className="flex h-full flex-col">
      <SearchHeader
        query={searchQuery}
        onQueryChange={setSearchQuery}
        excludedGenres={excludedGenres}
        onClearFilters={() => setExcludedGenres([])}
      />
      <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
      {sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          표시할 항목이 없습니다.
        </div>
      ) : (
        <div className="h-full w-full">
          <AutoSizer
            style={{ height: '100%', width: '100%' }}
            renderProp={({ height, width }) => {
              if (height === undefined || width === undefined) return null
              return (
                <List
                  rowComponent={Row}
                  rowProps={{ entries: sorted, metadataByCode, onOpenDetail: openDetail }}
                  rowCount={sorted.length}
                  rowHeight={ROW_HEIGHT}
                  style={{ height, width }}
                />
              )
            }}
          />
        </div>
      )}
      <DetailOverlayElement />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DetailList/DetailListPage.tsx
git commit -m "feat: open shared detail overlay on DetailList row click"
```

---

### Task 10: Final verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full verification suite**

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
npm run build
```

Expected: all five exit 0. For `format:check`, use the established git-blob-comparison method to distinguish real issues from pre-existing CRLF-checkout noise: for every flagged file this plan touched, run `git show HEAD:<path> | npx prettier --check --stdin-filepath <path>` — only files that still fail against the committed blob are real issues to fix via `prettier --write`.

- [ ] **Step 2: Commit any fixes**

Only if Step 1 required changes:

```bash
git add -A
git commit -m "fix: address issues found in shared-detail-entry-code-linking verification pass"
```
