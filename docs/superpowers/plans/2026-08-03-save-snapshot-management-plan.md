# Save Snapshot Management Utilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add delete (individual + all), Explorer-open, memo+auto-detected-version labels, and a version-mismatch restore warning to the save-snapshot feature, plus a search box on the Saves page's game list.

**Architecture:** A new `save_snapshot_labels` SQLite table + repository backs per-snapshot memo/version; three new pure functions (`extractVersionFromName`, `compareVersions`, `detectGameVersion`) implement version auto-detection; five new IPC handlers in the existing `saveHandlers.ts` expose delete/label/folder/mismatch-check to the renderer; three existing UI files (`SaveManagerDialog.tsx`, `SaveDataSection.tsx`, `SavesPage.tsx`) get extended, not replaced.

**Tech Stack:** Electron + TypeScript strict + Drizzle ORM (better-sqlite3) + React 19 + TanStack Query + Zod.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-03-save-snapshot-management-design.md` (committed `ac29f7a`).
- No drizzle-kit migrations - new table DDL is hand-written in `client.ts` alongside the existing `CREATE TABLE IF NOT EXISTS` blocks (see that file's own comment).
- `SNAPSHOT_TIMESTAMP_PATTERN` (already defined in `shared/types/ipc.ts`) must validate every new request schema's `timestamp` field - it's what stops a crafted timestamp from escaping the backup folder via path traversal.
- Do not touch `usePickSaveFolder`/`useSetSavePath` or any other v1.0.2 backlog item.
- No component/hook tests (none exist in this codebase). New pure functions get `.test.ts` files matching `extractCode.test.ts`'s style.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: `save_snapshot_labels` table and repository

**Files:**
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Create: `electron/main/database/saveSnapshotLabelsRepository.ts`
- Test: `electron/main/database/saveSnapshotLabelsRepository.test.ts`

**Interfaces:**
- Produces: `getSnapshotLabel(db: AppDatabase, key: string, timestamp: string): { memo: string | null; version: string | null }`, `setSnapshotLabel(db: AppDatabase, key: string, timestamp: string, updates: { memo?: string; version?: string }): void`, `deleteSnapshotLabel(db: AppDatabase, key: string, timestamp: string): void`, `deleteSnapshotLabelsForKey(db: AppDatabase, key: string): void` - all consumed by Task 4.

- [ ] **Step 1: Add the table to `schema.ts`**

Add `primaryKey` to the existing import and append the new table at the end of the file:

```ts
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
```

```ts
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

- [ ] **Step 2: Add the DDL to `client.ts`**

Add this block after the existing `path_code_overrides` block, before `return drizzle(sqlite, { schema })`:

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS save_snapshot_labels (
      key TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      memo TEXT,
      version TEXT,
      PRIMARY KEY (key, timestamp)
    )
  `)
```

- [ ] **Step 3: Write the failing repository test**

```ts
// electron/main/database/saveSnapshotLabelsRepository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDbClient, type AppDatabase } from './client'
import {
  getSnapshotLabel,
  setSnapshotLabel,
  deleteSnapshotLabel,
  deleteSnapshotLabelsForKey,
} from './saveSnapshotLabelsRepository'

describe('saveSnapshotLabelsRepository', () => {
  let dir: string
  let db: AppDatabase

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-labels-'))
    db = createDbClient(join(dir, 'test.db'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns nulls for a label that was never set', () => {
    expect(getSnapshotLabel(db, 'RJ01234567', 't1')).toEqual({ memo: null, version: null })
  })

  it('sets and reads back memo and version', () => {
    setSnapshotLabel(db, 'RJ01234567', 't1', { memo: '보스전 직전', version: '1.2.0' })
    expect(getSnapshotLabel(db, 'RJ01234567', 't1')).toEqual({
      memo: '보스전 직전',
      version: '1.2.0',
    })
  })

  it('updating one field does not clobber the other', () => {
    setSnapshotLabel(db, 'RJ01234567', 't1', { memo: '메모', version: '1.0.0' })
    setSnapshotLabel(db, 'RJ01234567', 't1', { memo: '수정된 메모' })
    expect(getSnapshotLabel(db, 'RJ01234567', 't1')).toEqual({
      memo: '수정된 메모',
      version: '1.0.0',
    })
  })

  it('labels are isolated per (key, timestamp) pair', () => {
    setSnapshotLabel(db, 'RJ01234567', 't1', { memo: 'A' })
    setSnapshotLabel(db, 'RJ01234567', 't2', { memo: 'B' })
    setSnapshotLabel(db, 'RJ09999999', 't1', { memo: 'C' })
    expect(getSnapshotLabel(db, 'RJ01234567', 't1').memo).toBe('A')
    expect(getSnapshotLabel(db, 'RJ01234567', 't2').memo).toBe('B')
    expect(getSnapshotLabel(db, 'RJ09999999', 't1').memo).toBe('C')
  })

  it('deleteSnapshotLabel removes only that one label', () => {
    setSnapshotLabel(db, 'RJ01234567', 't1', { memo: 'A' })
    setSnapshotLabel(db, 'RJ01234567', 't2', { memo: 'B' })
    deleteSnapshotLabel(db, 'RJ01234567', 't1')
    expect(getSnapshotLabel(db, 'RJ01234567', 't1')).toEqual({ memo: null, version: null })
    expect(getSnapshotLabel(db, 'RJ01234567', 't2').memo).toBe('B')
  })

  it('deleteSnapshotLabelsForKey removes every label for that key only', () => {
    setSnapshotLabel(db, 'RJ01234567', 't1', { memo: 'A' })
    setSnapshotLabel(db, 'RJ01234567', 't2', { memo: 'B' })
    setSnapshotLabel(db, 'RJ09999999', 't1', { memo: 'C' })
    deleteSnapshotLabelsForKey(db, 'RJ01234567')
    expect(getSnapshotLabel(db, 'RJ01234567', 't1')).toEqual({ memo: null, version: null })
    expect(getSnapshotLabel(db, 'RJ01234567', 't2')).toEqual({ memo: null, version: null })
    expect(getSnapshotLabel(db, 'RJ09999999', 't1').memo).toBe('C')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run electron/main/database/saveSnapshotLabelsRepository.test.ts`
Expected: FAIL - `saveSnapshotLabelsRepository` module not found.

- [ ] **Step 5: Implement the repository**

```ts
// electron/main/database/saveSnapshotLabelsRepository.ts
import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { saveSnapshotLabels } from './schema'

export interface SnapshotLabel {
  memo: string | null
  version: string | null
}

export function getSnapshotLabel(db: AppDatabase, key: string, timestamp: string): SnapshotLabel {
  const row = db
    .select({ memo: saveSnapshotLabels.memo, version: saveSnapshotLabels.version })
    .from(saveSnapshotLabels)
    .where(and(eq(saveSnapshotLabels.key, key), eq(saveSnapshotLabels.timestamp, timestamp)))
    .get()
  return row ?? { memo: null, version: null }
}

export function setSnapshotLabel(
  db: AppDatabase,
  key: string,
  timestamp: string,
  updates: { memo?: string; version?: string }
): void {
  const existing = getSnapshotLabel(db, key, timestamp)
  const memo = updates.memo !== undefined ? updates.memo : existing.memo
  const version = updates.version !== undefined ? updates.version : existing.version
  db.insert(saveSnapshotLabels)
    .values({ key, timestamp, memo, version })
    .onConflictDoUpdate({
      target: [saveSnapshotLabels.key, saveSnapshotLabels.timestamp],
      set: { memo, version },
    })
    .run()
}

export function deleteSnapshotLabel(db: AppDatabase, key: string, timestamp: string): void {
  db.delete(saveSnapshotLabels)
    .where(and(eq(saveSnapshotLabels.key, key), eq(saveSnapshotLabels.timestamp, timestamp)))
    .run()
}

export function deleteSnapshotLabelsForKey(db: AppDatabase, key: string): void {
  db.delete(saveSnapshotLabels).where(eq(saveSnapshotLabels.key, key)).run()
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run electron/main/database/saveSnapshotLabelsRepository.test.ts`
Expected: PASS, 6/6 tests.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/saveSnapshotLabelsRepository.ts electron/main/database/saveSnapshotLabelsRepository.test.ts
git commit -m "$(cat <<'EOF'
feat: add save_snapshot_labels table and repository

New table for per-snapshot memo/version, keyed by (key, timestamp) -
DDL hand-written in client.ts alongside every other table (this
project has no drizzle-kit migration pipeline, see that file's own
comment on why). setSnapshotLabel does a read-then-upsert so setting
one field never clobbers the other, since memo and version are set
independently (memo on every blur, version once at snapshot-creation
time, see the upcoming detectGameVersion work).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Version-string pure functions

**Files:**
- Create: `electron/main/save/extractVersion.ts`
- Test: `electron/main/save/extractVersion.test.ts`
- Create: `electron/main/save/compareVersions.ts`
- Test: `electron/main/save/compareVersions.test.ts`

**Interfaces:**
- Produces: `extractVersionFromName(name: string): string | null`, `compareVersions(a: string, b: string): number | null` - both consumed by Task 3.

- [ ] **Step 1: Write the failing `extractVersionFromName` tests**

```ts
// electron/main/save/extractVersion.test.ts
import { describe, it, expect } from 'vitest'
import { extractVersionFromName } from './extractVersion'

describe('extractVersionFromName', () => {
  it('extracts a bare dotted-number version', () => {
    expect(extractVersionFromName('1.2.3')).toBe('1.2.3')
  })

  it('extracts a version embedded in a longer name', () => {
    expect(extractVersionFromName('MyGame_v1.2.3_full')).toBe('1.2.3')
  })

  it('extracts a version from a filename with an extension', () => {
    expect(extractVersionFromName('patch_1.0.5.exe')).toBe('1.0.5')
  })

  it('does not match a two-segment number', () => {
    expect(extractVersionFromName('MyGame_1.2')).toBeNull()
  })

  it('does not match embedded in a longer digit run', () => {
    expect(extractVersionFromName('resolution_1920.1080.999999')).toBeNull()
  })

  it('returns null when there is no version-shaped substring', () => {
    expect(extractVersionFromName('Game.exe')).toBeNull()
  })

  it('returns the first match when multiple are present', () => {
    expect(extractVersionFromName('1.2.3_to_2.0.0_patch')).toBe('1.2.3')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run electron/main/save/extractVersion.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement `extractVersionFromName`**

```ts
// electron/main/save/extractVersion.ts

// Same lookaround shape as codeRecognition.ts's extractCode: not preceded
// or followed by another digit, so "1920.1080.999999" doesn't yield a
// false-positive "1080.999999"-shaped... actually a longer run just fails
// the trailing (?![0-9]) check at whichever 3-segment window is tried,
// since every digit run stays part of the surrounding number. Punctuation,
// letters, underscores, or start/end of string are all acceptable on
// either side of the whole match.
const VERSION_PATTERN = /(?<![0-9])\d+\.\d+\.\d+(?![0-9])/

export function extractVersionFromName(name: string): string | null {
  const match = VERSION_PATTERN.exec(name)
  return match ? match[0] : null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run electron/main/save/extractVersion.test.ts`
Expected: PASS, 7/7 tests.

- [ ] **Step 5: Write the failing `compareVersions` tests**

```ts
// electron/main/save/compareVersions.test.ts
import { describe, it, expect } from 'vitest'
import { compareVersions } from './compareVersions'

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('returns 1 when a is greater', () => {
    expect(compareVersions('1.3.0', '1.2.9')).toBe(1)
  })

  it('returns -1 when a is less', () => {
    expect(compareVersions('1.2.0', '1.3.0')).toBe(-1)
  })

  it('treats missing trailing segments as 0', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.0.1', '1.2')).toBe(1)
  })

  it('compares multi-digit segments numerically, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
  })

  it('returns null when a has a non-numeric segment', () => {
    expect(compareVersions('베타', '1.0.0')).toBeNull()
  })

  it('returns null when b has a non-numeric segment', () => {
    expect(compareVersions('1.0.0', 'v1.0.0')).toBeNull()
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run electron/main/save/compareVersions.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 7: Implement `compareVersions`**

```ts
// electron/main/save/compareVersions.ts

// Used only to decide the restore-time "snapshot is newer than the
// installed game" warning (saveHandlers.ts's SAVE_CHECK_VERSION_MISMATCH)
// - null means "can't safely compare" (e.g. a manually-typed non-numeric
// version like "베타"), which the caller treats as "skip the warning",
// never as "less than".
export function compareVersions(a: string, b: string): number | null {
  const partsA = a.split('.')
  const partsB = b.split('.')
  const length = Math.max(partsA.length, partsB.length)

  for (let i = 0; i < length; i++) {
    const rawA = partsA[i] ?? '0'
    const rawB = partsB[i] ?? '0'
    if (!/^\d+$/.test(rawA) || !/^\d+$/.test(rawB)) return null

    const numA = Number(rawA)
    const numB = Number(rawB)
    if (numA !== numB) return numA > numB ? 1 : -1
  }

  return 0
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run electron/main/save/compareVersions.test.ts`
Expected: PASS, 7/7 tests.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add electron/main/save/extractVersion.ts electron/main/save/extractVersion.test.ts electron/main/save/compareVersions.ts electron/main/save/compareVersions.test.ts
git commit -m "$(cat <<'EOF'
feat: add extractVersionFromName and compareVersions pure functions

Two building blocks for the upcoming version-auto-detect and
restore-time mismatch-warning work: extractVersionFromName scans a
file/folder name for a x.y.z-shaped substring (same lookaround style
as codeRecognition.ts's extractCode), compareVersions numerically
compares two dotted-number strings and returns null (not 0) when
either side isn't cleanly numeric, since a manually-typed version like
"베타" must never silently sort as "older."

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `readExeFileVersion` and `detectGameVersion`

**Files:**
- Create: `electron/main/save/readExeFileVersion.ts`
- Create: `electron/main/save/detectGameVersion.ts`
- Test: `electron/main/save/detectGameVersion.test.ts`

**Interfaces:**
- Consumes: `listExecutables(folderPath: string): Promise<string[]>` from `electron/main/launch/listExecutables.ts` (existing, unchanged). `extractVersionFromName` from Task 2.
- Produces: `readExeFileVersion(exePath: string): Promise<string | null>`, `detectGameVersion(gameFolderPath: string, preferredExePath: string | null, readExeVersion?: (exePath: string) => Promise<string | null>): Promise<string | null>` - both consumed by Task 4.

- [ ] **Step 1: Implement `readExeFileVersion` (no test - see note)**

This wraps a PowerShell call to read a Windows executable's file-version
resource, mirroring the exact safety pattern already used by this
project's own dependency
`node_modules/electron-updater/out/windowsExecutableCodeSignatureVerifier.js`
(`preparePowerShellExec`: `PSModulePath` reset, `chcp 65001`, single-quote
escaping to prevent command injection via a crafted path). No test file:
there's nothing to unit-test here without either mocking `execFile` (which
would only test that the mock was called, not real behavior) or actually
shelling out to PowerShell against a real exe (slow, environment-dependent)
- `electron-updater`'s own equivalent has no test file either, for the same
reason. `detectGameVersion`'s test (Step 4 below) covers this function's
role in the fallback chain via dependency injection instead.

```ts
// electron/main/save/readExeFileVersion.ts
import { execFile } from 'node:child_process'

function preparePowerShellExec(
  command: string
): [string, string[], { shell: boolean; timeout: number }] {
  const executable = `set "PSModulePath=" & chcp 65001 >NUL & powershell.exe`
  const args = ['-NoProfile', '-NonInteractive', '-InputFormat', 'None', '-Command', command]
  return [executable, args, { shell: true, timeout: 10_000 }]
}

export function readExeFileVersion(exePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const escaped = exePath.replace(/'/g, "''")
    const [executable, args, options] = preparePowerShellExec(
      `(Get-Item -LiteralPath '${escaped}').VersionInfo.FileVersion`
    )
    execFile(executable, args, options, (error, stdout) => {
      if (error) {
        resolve(null)
        return
      }
      const trimmed = stdout.trim()
      resolve(trimmed.length > 0 ? trimmed : null)
    })
  })
}
```

- [ ] **Step 2: Write the failing `detectGameVersion` tests**

Uses real temp directories (matching `folderScanner.test.ts`'s style) for
the filesystem-scanning tiers, and dependency-injects a stub for
`readExeVersion` instead of mocking the PowerShell-shelling module - the
fake stands in for "this exe's PE version is X" without actually running
PowerShell.

```ts
// electron/main/save/detectGameVersion.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectGameVersion } from './detectGameVersion'

describe('detectGameVersion', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-version-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('prefers the configured executable\'s PE version when available', async () => {
    const exePath = join(dir, 'Game.exe')
    await writeFile(exePath, '')
    const readExeVersion = async (path: string) => (path === exePath ? '1.2.3' : null)

    const version = await detectGameVersion(dir, exePath, readExeVersion)
    expect(version).toBe('1.2.3')
  })

  it('falls back to any other exe in the folder when the configured one has no PE version', async () => {
    const configuredExe = join(dir, 'Launcher.exe')
    const otherExe = join(dir, 'Game.exe')
    await writeFile(configuredExe, '')
    await writeFile(otherExe, '')
    const readExeVersion = async (path: string) => (path === otherExe ? '2.0.0' : null)

    const version = await detectGameVersion(dir, configuredExe, readExeVersion)
    expect(version).toBe('2.0.0')
  })

  it('falls back to a version pattern in a file/folder name when no exe has a PE version', async () => {
    await writeFile(join(dir, 'Game.exe'), '')
    await mkdir(join(dir, 'MyGame_v3.4.5'))
    const readExeVersion = async () => null

    const version = await detectGameVersion(dir, null, readExeVersion)
    expect(version).toBe('3.4.5')
  })

  it('returns null when nothing yields a version', async () => {
    await writeFile(join(dir, 'Game.exe'), '')
    const readExeVersion = async () => null

    const version = await detectGameVersion(dir, null, readExeVersion)
    expect(version).toBeNull()
  })

  it('returns null for a folder that does not exist, without throwing', async () => {
    const readExeVersion = async () => null
    const version = await detectGameVersion(join(dir, 'nonexistent'), null, readExeVersion)
    expect(version).toBeNull()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run electron/main/save/detectGameVersion.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 4: Implement `detectGameVersion`**

```ts
// electron/main/save/detectGameVersion.ts
import { readdir } from 'node:fs/promises'
import { listExecutables } from '../launch/listExecutables'
import { extractVersionFromName } from './extractVersion'
import { readExeFileVersion as defaultReadExeFileVersion } from './readExeFileVersion'

// Three-tier fallback, first non-null result wins: (1) the game's
// configured launch executable's own PE file-version resource - most
// likely to be accurate since it's the exe the user actually runs; (2) any
// other top-level exe in the folder, for games with no launch config saved
// yet; (3) a x.y.z-shaped substring in any top-level file/folder name (many
// indie games never set PE version info, but their release zip/folder name
// often carries a real version). Never throws - every tier degrades to
// "try the next one" on any error, including a folder that doesn't exist
// (a not-yet-extracted archive), so the whole chain just returns null.
export async function detectGameVersion(
  gameFolderPath: string,
  preferredExePath: string | null,
  readExeVersion: (exePath: string) => Promise<string | null> = defaultReadExeFileVersion
): Promise<string | null> {
  if (preferredExePath) {
    const version = await readExeVersion(preferredExePath)
    if (version) return version
  }

  const executables = await listExecutables(gameFolderPath)
  for (const exePath of executables) {
    if (exePath === preferredExePath) continue
    const version = await readExeVersion(exePath)
    if (version) return version
  }

  let names: string[]
  try {
    names = await readdir(gameFolderPath)
  } catch {
    return null
  }
  for (const name of names) {
    const version = extractVersionFromName(name)
    if (version) return version
  }

  return null
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run electron/main/save/detectGameVersion.test.ts`
Expected: PASS, 5/5 tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add electron/main/save/readExeFileVersion.ts electron/main/save/detectGameVersion.ts electron/main/save/detectGameVersion.test.ts
git commit -m "$(cat <<'EOF'
feat: add version auto-detection (exe PE version -> filename pattern)

detectGameVersion tries the configured launch executable's Windows
file-version resource first, then any other exe in the game folder,
then a x.y.z pattern in a file/folder name, then gives up (null) -
used both to auto-fill a new snapshot's version label and, later, to
re-detect the *current* game version at restore time for the
newer-snapshot-than-installed-game warning. readExeFileVersion mirrors
electron-updater's own PowerShell-exec safety pattern (already vendored
in node_modules) - no test file for it, same reasoning as that
dependency's own equivalent: nothing to usefully unit-test without
either a real PowerShell run or a mock that only proves itself was
called. detectGameVersion's own test covers the fallback chain via
dependency injection instead of mocking the untestable leaf.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: IPC layer - shared types, main handlers, preload, renderer service

**Files:**
- Modify: `shared/types/ipc.ts`
- Modify: `electron/main/ipc/saveHandlers.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/services/saveService.ts`

**Interfaces:**
- Consumes: `getSnapshotLabel`/`setSnapshotLabel`/`deleteSnapshotLabel`/`deleteSnapshotLabelsForKey` (Task 1), `detectGameVersion`/`compareVersions` (Tasks 2-3), existing `resolveGameEntryKey`, `getGameUserData` (has `.launchConfig?.executablePath`).
- Produces: `window.api.save.setSnapshotLabel(code, path, timestamp, updates)`, `.deleteSnapshot(code, path, timestamp)`, `.deleteAllSnapshots(code, path)`, `.showSnapshotInFolder(code, path, timestamp)`, `.checkVersionMismatch(code, path, timestamp)`; React Query hooks `useSetSnapshotLabel()`, `useDeleteSnapshot()`, `useDeleteAllSnapshots()`, `useShowSnapshotInFolder()`, `useCheckVersionMismatch()` - all consumed by Task 5's `SaveManagerDialog` changes. `SaveSnapshotDto` gains `memo`/`version` fields, consumed by Task 5 for the row layout.

- [ ] **Step 1: Extend `shared/types/ipc.ts`**

Add four new channels to `IPC_CHANNELS`, right after the existing `SAVE_LIST_GAMES_WITH_SAVE_PATH` line:

```ts
  SAVE_LIST_GAMES_WITH_SAVE_PATH: 'save:list-games-with-save-path',
  SAVE_SET_SNAPSHOT_LABEL: 'save:set-snapshot-label',
  SAVE_DELETE_SNAPSHOT: 'save:delete-snapshot',
  SAVE_DELETE_ALL_SNAPSHOTS: 'save:delete-all-snapshots',
  SAVE_SHOW_SNAPSHOT_IN_FOLDER: 'save:show-snapshot-in-folder',
  SAVE_CHECK_VERSION_MISMATCH: 'save:check-version-mismatch',
```

Extend `SaveSnapshotDto` (currently `{timestamp, fileCount, totalSizeBytes}`) to:

```ts
export interface SaveSnapshotDto {
  timestamp: string
  fileCount: number
  totalSizeBytes: number
  memo: string | null
  version: string | null
}
```

Add these new schemas and the new DTO directly after the existing
`SaveDiffRequestSchema` block (so they can reference
`SNAPSHOT_TIMESTAMP_PATTERN`, already defined above that point):

```ts
export const SetSnapshotLabelRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  timestamp: z.string().regex(SNAPSHOT_TIMESTAMP_PATTERN),
  memo: z.string().optional(),
  version: z.string().optional(),
})

export const DeleteSnapshotRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  timestamp: z.string().regex(SNAPSHOT_TIMESTAMP_PATTERN),
})

export const DeleteAllSnapshotsRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
})

export const ShowSnapshotInFolderRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  timestamp: z.string().regex(SNAPSHOT_TIMESTAMP_PATTERN),
})

export const CheckVersionMismatchRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  timestamp: z.string().regex(SNAPSHOT_TIMESTAMP_PATTERN),
})

export interface VersionMismatchDto {
  snapshotVersion: string | null
  currentVersion: string | null
  isSnapshotNewer: boolean
}
```

- [ ] **Step 2: Extend `saveHandlers.ts`**

Replace the file's imports with:

```ts
import { app, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import {
  IPC_CHANNELS,
  PickSaveFolderRequestSchema,
  RestoreSaveSnapshotRequestSchema,
  SaveDiffRequestSchema,
  SaveSnapshotRequestSchema,
  SetSavePathRequestSchema,
  SetSnapshotLabelRequestSchema,
  DeleteSnapshotRequestSchema,
  DeleteAllSnapshotsRequestSchema,
  ShowSnapshotInFolderRequestSchema,
  CheckVersionMismatchRequestSchema,
  type GameWithSavePathDto,
  type SaveDiffEntryDto,
  type SaveSnapshotDto,
  type VersionMismatchDto,
} from '../../../shared/types/ipc'
import { createSnapshot } from '../save/createSnapshot'
import { listSnapshots } from '../save/listSnapshots'
import { restoreSnapshot } from '../save/restoreSnapshot'
import { diffSaveFolders } from '../save/diffSaveFolders'
import { keyToSafeDirName } from '../save/keyToSafeDirName'
import { detectGameVersion } from '../save/detectGameVersion'
import { compareVersions } from '../save/compareVersions'
import {
  getGameUserData,
  listGamesWithSavePath,
  setSavePath,
} from '../database/gameUserDataRepository'
import {
  getSnapshotLabel,
  setSnapshotLabel,
  deleteSnapshotLabel,
  deleteSnapshotLabelsForKey,
} from '../database/saveSnapshotLabelsRepository'
import { resolveGameEntryKey } from './resolveGameEntryKey'
import type { AppDatabase } from '../database/client'
```

Replace the `SAVE_LIST_SNAPSHOTS` handler body to join labels onto each
snapshot:

```ts
  ipcMain.handle(
    IPC_CHANNELS.SAVE_LIST_SNAPSHOTS,
    async (_event, payload: unknown): Promise<SaveSnapshotDto[]> => {
      const { identifier } = SaveSnapshotRequestSchema.parse(payload)
      const { key } = resolveGameEntryKey(identifier)
      const snapshots = await listSnapshots(backupRootDir(key))
      return snapshots.map((snapshot) => {
        const label = getSnapshotLabel(db, key, snapshot.timestamp)
        return { ...snapshot, memo: label.memo, version: label.version }
      })
    }
  )
```

Replace the `SAVE_CREATE_SNAPSHOT` handler body to auto-fill the version
label after a successful snapshot:

```ts
  ipcMain.handle(IPC_CHANNELS.SAVE_CREATE_SNAPSHOT, async (_event, payload: unknown) => {
    const { identifier } = SaveSnapshotRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)

    const userData = getGameUserData(db, key)
    if (!userData?.savePath) {
      throw new Error('백업할 세이브 경로가 지정되어 있지 않습니다.')
    }
    const timestamp = await createSnapshot(userData.savePath, backupRootDir(key))
    const version = await detectGameVersion(
      identifier.path,
      userData.launchConfig?.executablePath ?? null
    )
    if (version) setSnapshotLabel(db, key, timestamp, { version })
  })
```

Add these five new handlers directly after the existing
`SAVE_LIST_GAMES_WITH_SAVE_PATH` handler, before the closing brace of
`registerSaveHandlers`:

```ts
  ipcMain.handle(IPC_CHANNELS.SAVE_SET_SNAPSHOT_LABEL, (_event, payload: unknown) => {
    const { identifier, timestamp, memo, version } = SetSnapshotLabelRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)
    setSnapshotLabel(db, key, timestamp, { memo, version })
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_DELETE_SNAPSHOT, async (_event, payload: unknown) => {
    const { identifier, timestamp } = DeleteSnapshotRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)
    await rm(join(backupRootDir(key), timestamp), { recursive: true, force: true })
    deleteSnapshotLabel(db, key, timestamp)
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_DELETE_ALL_SNAPSHOTS, async (_event, payload: unknown) => {
    const { identifier } = DeleteAllSnapshotsRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)
    await rm(backupRootDir(key), { recursive: true, force: true })
    deleteSnapshotLabelsForKey(db, key)
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_SHOW_SNAPSHOT_IN_FOLDER, (_event, payload: unknown) => {
    const { identifier, timestamp } = ShowSnapshotInFolderRequestSchema.parse(payload)
    const { key } = resolveGameEntryKey(identifier)
    shell.showItemInFolder(join(backupRootDir(key), timestamp))
  })

  ipcMain.handle(
    IPC_CHANNELS.SAVE_CHECK_VERSION_MISMATCH,
    async (_event, payload: unknown): Promise<VersionMismatchDto> => {
      const { identifier, timestamp } = CheckVersionMismatchRequestSchema.parse(payload)
      const { key } = resolveGameEntryKey(identifier)
      const label = getSnapshotLabel(db, key, timestamp)
      const userData = getGameUserData(db, key)
      const currentVersion = await detectGameVersion(
        identifier.path,
        userData?.launchConfig?.executablePath ?? null
      )
      const comparison =
        label.version && currentVersion ? compareVersions(label.version, currentVersion) : null
      return {
        snapshotVersion: label.version,
        currentVersion,
        isSnapshotNewer: comparison === 1,
      }
    }
  )
```

Every other existing handler in this file (`SAVE_PICK_FOLDER`,
`SAVE_SET_PATH`, `SAVE_RESTORE_SNAPSHOT`, `SAVE_DIFF`,
`SAVE_LIST_GAMES_WITH_SAVE_PATH`) is unchanged.

- [ ] **Step 3: Extend `electron/preload/index.ts`**

Add these five methods inside the existing `save: { ... }` block, after
`listGamesWithSavePath`:

```ts
    setSnapshotLabel: (
      code: GameCode | null,
      path: string,
      timestamp: string,
      updates: { memo?: string; version?: string }
    ): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_SET_SNAPSHOT_LABEL, {
        identifier: { code, path },
        timestamp,
        ...updates,
      }),
    deleteSnapshot: (code: GameCode | null, path: string, timestamp: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_DELETE_SNAPSHOT, {
        identifier: { code, path },
        timestamp,
      }),
    deleteAllSnapshots: (code: GameCode | null, path: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_DELETE_ALL_SNAPSHOTS, { identifier: { code, path } }),
    showSnapshotInFolder: (code: GameCode | null, path: string, timestamp: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_SHOW_SNAPSHOT_IN_FOLDER, {
        identifier: { code, path },
        timestamp,
      }),
    checkVersionMismatch: (
      code: GameCode | null,
      path: string,
      timestamp: string
    ): Promise<VersionMismatchDto> =>
      ipcRenderer.invoke(IPC_CHANNELS.SAVE_CHECK_VERSION_MISMATCH, {
        identifier: { code, path },
        timestamp,
      }),
```

Add `VersionMismatchDto` to this file's existing `import type { ... } from
'../../shared/types/ipc'` block.

- [ ] **Step 4: Extend `src/services/saveService.ts`**

Add `VersionMismatchDto` to the existing type-only import from
`'../../shared/types/ipc'`. Add these five hooks at the end of the file:

```ts
export function useSetSnapshotLabel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      entry,
      timestamp,
      updates,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      timestamp: string
      updates: { memo?: string; version?: string }
    }) => window.api.save.setSnapshotLabel(entry.code, entry.path, timestamp, updates),
    onSuccess: (_result, { entry }) => {
      queryClient.invalidateQueries({ queryKey: ['save-snapshots', identifierKey(entry)] })
    },
  })
}

export function useDeleteSnapshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      entry,
      timestamp,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      timestamp: string
    }) => window.api.save.deleteSnapshot(entry.code, entry.path, timestamp),
    onSuccess: (_result, { entry }) => {
      queryClient.invalidateQueries({ queryKey: ['save-snapshots', identifierKey(entry)] })
    },
  })
}

export function useDeleteAllSnapshots() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entry: Pick<ScannedEntry, 'code' | 'path'>) =>
      window.api.save.deleteAllSnapshots(entry.code, entry.path),
    onSuccess: (_result, entry) => {
      queryClient.invalidateQueries({ queryKey: ['save-snapshots', identifierKey(entry)] })
    },
  })
}

export function useShowSnapshotInFolder() {
  return useMutation({
    mutationFn: ({
      entry,
      timestamp,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      timestamp: string
    }) => window.api.save.showSnapshotInFolder(entry.code, entry.path, timestamp),
  })
}

export function useCheckVersionMismatch() {
  return useMutation({
    mutationFn: ({
      entry,
      timestamp,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      timestamp: string
    }): Promise<VersionMismatchDto> =>
      window.api.save.checkVersionMismatch(entry.code, entry.path, timestamp),
  })
}
```

- [ ] **Step 5: Typecheck, lint, format, full test suite**

Run: `npm run typecheck && npm run lint && npm run format:check && npx vitest run`
Expected: all clean; test count increased by the 6 (Task 1) + 7 + 7 (Task 2)
+ 5 (Task 3) = 25 new tests from earlier tasks, none from this task (no new
pure logic here, only wiring). If `format:check` fails, run `npm run
format` and re-verify only the files this task touched are affected.

- [ ] **Step 6: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/saveHandlers.ts electron/preload/index.ts src/services/saveService.ts
git commit -m "$(cat <<'EOF'
feat: wire snapshot delete/label/folder/mismatch IPC end to end

Five new channels (set-snapshot-label, delete-snapshot,
delete-all-snapshots, show-snapshot-in-folder,
check-version-mismatch) plumbed from saveHandlers.ts through preload
to five new saveService.ts hooks. SAVE_LIST_SNAPSHOTS now joins each
snapshot's label (memo/version) from the new table, and
SAVE_CREATE_SNAPSHOT auto-fills a new snapshot's version via
detectGameVersion right after creating it, preferring the game's
configured launch executable's own PE version. No UI consumes any of
this yet - that's the next task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `SaveManagerDialog` - delete, labels, Explorer, mismatch warning

**Files:**
- Modify: `src/components/game/SaveManagerDialog.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `useSetSnapshotLabel`, `useDeleteSnapshot`, `useDeleteAllSnapshots`, `useShowSnapshotInFolder`, `useCheckVersionMismatch` (Task 4), extended `SaveSnapshotDto` with `memo`/`version` (Task 4).

- [ ] **Step 1: Add new i18n keys**

Add these keys to all three locale blocks in `src/i18n/translations.ts`,
directly after the existing `'saveManager.snapshotCount'` line in each
block.

Korean block:

```ts
  'saveManager.deleteAll': '전체 삭제',
  'saveManager.deleteSnapshotConfirm': '이 스냅샷을 삭제하시겠습니까?',
  'saveManager.deleteAllConfirm1': '이 게임의 모든 스냅샷을 삭제하시겠습니까?',
  'saveManager.deleteAllConfirm2': '스냅샷 {count}개가 모두 삭제됩니다. 되돌릴 수 없습니다.',
  'saveManager.memoPlaceholder': '메모 없음',
  'saveManager.versionPlaceholder': '버전 추가',
  'saveManager.versionMismatchWarning':
    '이 스냅샷은 v{snapshotVersion} 기준으로 저장되었는데, 현재 게임은 v{currentVersion}입니다. 새 버전의 세이브가 호환되지 않을 수 있습니다.',
  'saveManager.restoreAnyway': '그래도 복원',
  'saveManager.searchPlaceholder': '게임 검색...',
```

Japanese block:

```ts
  'saveManager.deleteAll': 'すべて削除',
  'saveManager.deleteSnapshotConfirm': 'このスナップショットを削除しますか?',
  'saveManager.deleteAllConfirm1': 'このゲームの全スナップショットを削除しますか?',
  'saveManager.deleteAllConfirm2': 'スナップショット{count}個がすべて削除されます。元に戻せません。',
  'saveManager.memoPlaceholder': 'メモなし',
  'saveManager.versionPlaceholder': 'バージョン追加',
  'saveManager.versionMismatchWarning':
    'このスナップショットはv{snapshotVersion}時点のものですが、現在のゲームはv{currentVersion}です。新しいバージョンのセーブは互換性がない場合があります。',
  'saveManager.restoreAnyway': 'それでも復元',
  'saveManager.searchPlaceholder': 'ゲーム検索...',
```

English block:

```ts
  'saveManager.deleteAll': 'Delete All',
  'saveManager.deleteSnapshotConfirm': 'Delete this snapshot?',
  'saveManager.deleteAllConfirm1': 'Delete all snapshots for this game?',
  'saveManager.deleteAllConfirm2': 'All {count} snapshots will be deleted. This cannot be undone.',
  'saveManager.memoPlaceholder': 'No memo',
  'saveManager.versionPlaceholder': 'Add version',
  'saveManager.versionMismatchWarning':
    'This snapshot was saved at v{snapshotVersion}, but the game is currently v{currentVersion}. A save from a newer version may not be compatible.',
  'saveManager.restoreAnyway': 'Restore Anyway',
  'saveManager.searchPlaceholder': 'Search games...',
```

- [ ] **Step 2: Run typecheck to confirm the new keys don't break the translations type**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Rewrite `SaveManagerDialog.tsx`**

Replace the entire file:

```tsx
// src/components/game/SaveManagerDialog.tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useTranslation } from '../../i18n/useTranslation'
import {
  useCreateSaveSnapshot,
  useRestoreSaveSnapshot,
  useSaveDiff,
  useSaveSnapshots,
  useSetSnapshotLabel,
  useDeleteSnapshot,
  useDeleteAllSnapshots,
  useShowSnapshotInFolder,
  useCheckVersionMismatch,
} from '../../services/saveService'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { SaveDiffStatus, VersionMismatchDto } from '../../../shared/types/ipc'

interface SaveManagerDialogProps {
  entry: Pick<ScannedEntry, 'code' | 'path' | 'name'> | null
  savePath: string | null
  onClose: () => void
}

// Snapshot directory names are createSnapshot.ts's timestampToDirName
// output (an ISO string with : and . replaced by -) - parsed back here
// only for display.
function formatTimestamp(timestamp: string): string {
  const iso = timestamp.replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-\d{3}Z$/,
    '$1T$2:$3:$4Z'
  )
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString()
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Restoring an older snapshot onto the live save folder is the mirror image
// of saving a new one from it - the same backend diff (snapshot vs live) is
// reused for both previews, just relabeled: a file only in the snapshot
// ("removed" from the save-preview's point of view, since it's gone from
// live) is something a restore would ADD BACK, and vice versa.
function displayStatus(status: SaveDiffStatus, mode: 'save' | 'restore'): SaveDiffStatus {
  if (mode === 'save' || status === 'modified') return status
  return status === 'added' ? 'removed' : 'added'
}

const STATUS_STYLES: Record<SaveDiffStatus, string> = {
  added: 'text-green-500',
  removed: 'text-destructive',
  modified: 'text-yellow-500',
}
const STATUS_SYMBOLS: Record<SaveDiffStatus, string> = { added: '+', removed: '-', modified: '~' }

type PendingAction =
  | { type: 'save'; against: string | null }
  | { type: 'restore'; timestamp: string }
  | { type: 'delete'; timestamp: string }
  | { type: 'deleteAll'; step: 1 | 2 }

export function SaveManagerDialog({ entry, savePath, onClose }: SaveManagerDialogProps) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [mismatch, setMismatch] = useState<VersionMismatchDto | null>(null)
  const { data: snapshots } = useSaveSnapshots(entry)
  const { data: diff } = useSaveDiff(
    entry,
    pending?.type === 'save' ? pending.against : pending?.type === 'restore' ? pending.timestamp : null,
    pending !== null && (pending.type === 'save' || pending.type === 'restore')
  )
  const createSnapshot = useCreateSaveSnapshot()
  const restoreSnapshot = useRestoreSaveSnapshot()
  const setSnapshotLabel = useSetSnapshotLabel()
  const deleteSnapshot = useDeleteSnapshot()
  const deleteAllSnapshots = useDeleteAllSnapshots()
  const showSnapshotInFolder = useShowSnapshotInFolder()
  const checkVersionMismatch = useCheckVersionMismatch()

  const handleClose = (): void => {
    setPending(null)
    setMismatch(null)
    onClose()
  }

  const handleConfirmSave = (): void => {
    if (!entry) return
    createSnapshot.mutate(entry, { onSuccess: () => setPending(null) })
  }

  const handleClickRestore = (timestamp: string): void => {
    if (!entry) return
    const snapshot = (snapshots ?? []).find((s) => s.timestamp === timestamp)
    if (snapshot?.version) {
      checkVersionMismatch.mutate(
        { entry, timestamp },
        {
          onSuccess: (result) => {
            if (result.isSnapshotNewer) {
              setMismatch(result)
            } else {
              setPending({ type: 'restore', timestamp })
            }
          },
        }
      )
    } else {
      setPending({ type: 'restore', timestamp })
    }
  }

  const handleConfirmRestore = (): void => {
    if (!entry || pending?.type !== 'restore') return
    restoreSnapshot.mutate(
      { entry, timestamp: pending.timestamp },
      { onSuccess: () => setPending(null) }
    )
  }

  const handleConfirmDelete = (): void => {
    if (!entry || pending?.type !== 'delete') return
    deleteSnapshot.mutate(
      { entry, timestamp: pending.timestamp },
      { onSuccess: () => setPending(null) }
    )
  }

  const handleConfirmDeleteAll = (): void => {
    if (!entry) return
    deleteAllSnapshots.mutate(entry, { onSuccess: () => setPending(null) })
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('saveManager.title')} {entry ? `- ${entry.name}` : ''}
          </DialogTitle>
        </DialogHeader>

        {!savePath ? (
          <p className="text-sm text-muted-foreground">{t('saveManager.noSavePath')}</p>
        ) : mismatch !== null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-yellow-500">
              {t('saveManager.versionMismatchWarning', {
                snapshotVersion: mismatch.snapshotVersion ?? '',
                currentVersion: mismatch.currentVersion ?? '',
              })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMismatch(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const timestamp = mismatch ? undefined : undefined
                  setPending((current) =>
                    current ?? { type: 'restore', timestamp: pendingTimestampFromMismatch }
                  )
                }}
              >
                {t('saveManager.restoreAnyway')}
              </Button>
            </div>
          </div>
        ) : pending === null ? (
          <>
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  setPending({ type: 'save', against: snapshots?.[0]?.timestamp ?? null })
                }
              >
                {t('saveManager.saveNew')}
              </Button>
              {(snapshots ?? []).length > 0 && (
                <Button variant="destructive" onClick={() => setPending({ type: 'deleteAll', step: 1 })}>
                  {t('saveManager.deleteAll')}
                </Button>
              )}
            </div>
            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {(snapshots ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{t('saveManager.noSnapshots')}</p>
              )}
              {(snapshots ?? []).map((snapshot) => (
                <div
                  key={snapshot.timestamp}
                  className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span>{formatTimestamp(snapshot.timestamp)}</span>
                      <VersionBadge
                        entry={entry}
                        timestamp={snapshot.timestamp}
                        version={snapshot.version}
                        onSave={setSnapshotLabel}
                      />
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t('saveManager.snapshotMeta', {
                        count: snapshot.fileCount,
                        size: formatSize(snapshot.totalSizeBytes),
                      })}
                    </span>
                  </div>
                  <input
                    className="rounded border border-border bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                    placeholder={t('saveManager.memoPlaceholder')}
                    defaultValue={snapshot.memo ?? ''}
                    onBlur={(e) => {
                      if (!entry) return
                      const memo = e.target.value
                      if (memo !== (snapshot.memo ?? '')) {
                        setSnapshotLabel.mutate({ entry, timestamp: snapshot.timestamp, updates: { memo } })
                      }
                    }}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => entry && showSnapshotInFolder.mutate({ entry, timestamp: snapshot.timestamp })}
                    >
                      {t('game.openFolder')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPending({ type: 'delete', timestamp: snapshot.timestamp })}
                    >
                      {t('common.delete')}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleClickRestore(snapshot.timestamp)}>
                      {t('saveManager.restore')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : pending.type === 'delete' ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">{t('saveManager.deleteSnapshotConfirm')}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteSnapshot.isPending}>
                {t('common.delete')}
              </Button>
            </div>
          </div>
        ) : pending.type === 'deleteAll' ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {pending.step === 1
                ? t('saveManager.deleteAllConfirm1')
                : t('saveManager.deleteAllConfirm2', { count: snapshots?.length ?? 0 })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  pending.step === 1
                    ? setPending({ type: 'deleteAll', step: 2 })
                    : handleConfirmDeleteAll()
                }
                disabled={deleteAllSnapshots.isPending}
              >
                {t('saveManager.deleteAll')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium">
              {pending.type === 'save'
                ? t('saveManager.saveDiffTitle')
                : t('saveManager.restoreDiffTitle')}
            </p>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {diff === undefined ? null : diff.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('saveManager.noDifferences')}</p>
              ) : (
                diff.map((d) => {
                  const status = displayStatus(d.status, pending.type)
                  return (
                    <div key={d.relativePath} className="flex items-center gap-2 text-xs">
                      <span className={STATUS_STYLES[status]}>{STATUS_SYMBOLS[status]}</span>
                      <span className="truncate">{d.relativePath}</span>
                    </div>
                  )
                })
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </Button>
              {pending.type === 'save' ? (
                <Button onClick={handleConfirmSave} disabled={createSnapshot.isPending}>
                  {t('saveManager.confirmSave')}
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={handleConfirmRestore}
                  disabled={restoreSnapshot.isPending}
                >
                  {t('saveManager.confirmRestore')}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

**This draft has a bug - fix it in the same step before running anything.**
The `mismatch` confirm view's "그래도 복원" button above references an
undefined `pendingTimestampFromMismatch` and a dead `timestamp` local - it
was written assuming `mismatch` carries the timestamp it's for, but
`VersionMismatchDto` doesn't (see Task 4's schema - it only has
`snapshotVersion`/`currentVersion`/`isSnapshotNewer`). Fix by tracking the
pending timestamp alongside the mismatch state instead of trying to recover
it from the DTO:

Change the state declaration:

```tsx
  const [mismatch, setMismatch] = useState<{ timestamp: string; result: VersionMismatchDto } | null>(
    null
  )
```

Change `handleClickRestore`'s success branch:

```tsx
          onSuccess: (result) => {
            if (result.isSnapshotNewer) {
              setMismatch({ timestamp, result })
            } else {
              setPending({ type: 'restore', timestamp })
            }
          },
```

Change the mismatch view's message and button:

```tsx
        ) : mismatch !== null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-yellow-500">
              {t('saveManager.versionMismatchWarning', {
                snapshotVersion: mismatch.result.snapshotVersion ?? '',
                currentVersion: mismatch.result.currentVersion ?? '',
              })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMismatch(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const timestamp = mismatch.timestamp
                  setMismatch(null)
                  setPending({ type: 'restore', timestamp })
                }}
              >
                {t('saveManager.restoreAnyway')}
              </Button>
            </div>
          </div>
```

- [ ] **Step 4: Implement the `VersionBadge` inline-edit sub-component**

Add this component in the same file, above `SaveManagerDialog`:

```tsx
function VersionBadge({
  entry,
  timestamp,
  version,
  onSave,
}: {
  entry: Pick<ScannedEntry, 'code' | 'path'> | null
  timestamp: string
  version: string | null
  onSave: ReturnType<typeof useSetSnapshotLabel>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <input
        autoFocus
        className="w-20 rounded border border-border bg-transparent px-1 text-xs text-foreground"
        defaultValue={version ?? ''}
        onBlur={(e) => {
          setEditing(false)
          if (!entry) return
          const next = e.target.value
          if (next !== (version ?? '')) {
            onSave.mutate({ entry, timestamp, updates: { version: next } })
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
      onClick={() => setEditing(true)}
    >
      {version ? `v${version}` : t('saveManager.versionPlaceholder')}
    </button>
  )
}
```

- [ ] **Step 5: Typecheck, lint, format**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors. Run `npm run format` if `format:check` fails, then
re-verify.

- [ ] **Step 6: Full test suite**

Run: `npx vitest run`
Expected: all existing + Task 1-3 tests pass (this task adds no new tests -
no component test infrastructure, per Global Constraints).

- [ ] **Step 7: Manual verification via `npm run dev`**

Open a game with a save path set and at least one snapshot, then confirm:
- Each snapshot row shows a version badge (or "버전 추가" if none) and a
  memo input (or the "메모 없음" placeholder).
- Clicking the version badge turns it into an editable input; typing a
  value and clicking away (blur) saves it, and it reappears as `v{value}`.
- Typing into the memo input and clicking away saves it (reopen the dialog
  to confirm it persisted).
- "폴더 열기" on a snapshot row opens that exact snapshot's backup folder
  in Explorer.
- "삭제" on one snapshot row asks for confirmation, then removes only that
  snapshot from the list.
- "전체 삭제" appears only when there's at least one snapshot, asks for
  confirmation twice (the second message states the count), and removes
  every snapshot.
- Create a new snapshot and confirm a version badge appears automatically
  if the game has any `.exe` with PE version info, or a version-shaped
  name in its folder - otherwise "버전 추가" (this depends on the specific
  test game's files, so treat "no auto-detected version" as expected for a
  game with neither).
- To exercise the mismatch warning: manually set one snapshot's version
  (via the badge) to something clearly higher than the game's own detected
  version (e.g. `99.0.0`), then click "복원" on it - confirm the warning
  appears with both version numbers, "취소" returns to the list, and
  "그래도 복원" proceeds to the normal restore diff view.

- [ ] **Step 8: Commit**

```bash
git add src/components/game/SaveManagerDialog.tsx src/i18n/translations.ts
git commit -m "$(cat <<'EOF'
feat: snapshot delete, memo/version labels, Explorer link, mismatch warning

SaveManagerDialog's existing PendingAction/pending-view architecture
now covers delete (single confirm) and delete-all (two-step confirm,
per the user's explicit ask for this specifically), gains a memo input
and a click-to-edit version badge per snapshot row (both blur-save via
the label IPC from the previous task), a folder button that opens that
exact snapshot's own backup directory, and a version-mismatch warning
inserted before the restore flow whenever the snapshot being restored
is recorded against a newer version than the game currently detects.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `SaveDataSection` - open live save folder

**Files:**
- Modify: `src/components/game/SaveDataSection.tsx`

**Interfaces:**
- Consumes: `useShowItemInFolder()` from `src/services/shellService.ts` (existing, unchanged).

- [ ] **Step 1: Add the Explorer button**

Add the import:

```tsx
import { useShowItemInFolder } from '../../services/shellService'
```

Add the hook inside the component, alongside the existing hooks:

```tsx
  const showItemInFolder = useShowItemInFolder()
```

Replace the save-path display block:

```tsx
          {userData?.savePath && (
            <p className="truncate text-xs text-muted-foreground" title={userData.savePath}>
              {userData.savePath}
            </p>
          )}
```

with:

```tsx
          {userData?.savePath && (
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs text-muted-foreground" title={userData.savePath}>
                {userData.savePath}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => showItemInFolder.mutate(userData.savePath)}
              >
                {t('game.openFolder')}
              </Button>
            </div>
          )}
```

- [ ] **Step 2: Typecheck, lint, format**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors.

- [ ] **Step 3: Manual verification via `npm run dev`**

Open the detail sidebar for a game with a save path set, expand "세이브
데이터 관리," and confirm the new "폴더 열기" button opens the live save
folder in Explorer.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/SaveDataSection.tsx
git commit -m "$(cat <<'EOF'
feat: open the live save folder from the sidebar's save section

Reuses the existing generic useShowItemInFolder hook - no backend
change needed, the save path is already available client-side.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `SavesPage` - game search

**Files:**
- Modify: `src/pages/Saves/SavesPage.tsx`
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: `saveManager.searchPlaceholder` was already added in Task 5** -
  no new i18n keys needed for this task.

- [ ] **Step 2: Add the search input and filter**

Add `useState` to the existing React import if not already present (it
already is - `SavesPage.tsx` imports `useState` today). Add a search state
and filter the `games` array before mapping:

```tsx
export function SavesPage() {
  const { t } = useTranslation()
  const { data: games, isLoading } = useGamesWithSavePath()
  const [managing, setManaging] = useState<ManagingEntry | null>(null)
  const [search, setSearch] = useState('')

  if (isLoading || !games) return null

  if (games.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('saveManager.noGamesWithSavePath')}
      </div>
    )
  }

  const filteredGames = search.trim()
    ? games.filter((game) => game.key.toLowerCase().includes(search.trim().toLowerCase()))
    : games

  return (
    <div className="flex flex-col">
      <div className="border-b border-border p-2">
        <input
          className="w-full rounded border border-border bg-transparent px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground"
          placeholder={t('saveManager.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {filteredGames.map((game) => (
        <SaveEntryRow
          key={game.key}
          entryKey={game.key}
          savePath={game.savePath}
          onManage={setManaging}
        />
      ))}
      <SaveManagerDialog
        entry={managing}
        savePath={managing?.savePath ?? null}
        onClose={() => setManaging(null)}
      />
    </div>
  )
}
```

- [ ] **Step 3: Typecheck, lint, format**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors.

- [ ] **Step 4: Full test suite**

Run: `npx vitest run`
Expected: all tests pass (no new tests this task).

- [ ] **Step 5: Manual verification via `npm run dev`**

Open the Saves page with at least two games with different codes/paths set,
type a substring of one game's code/path into the search box, and confirm
only matching rows remain; clearing the box restores the full list.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Saves/SavesPage.tsx
git commit -m "$(cat <<'EOF'
feat: add a search box to the Saves page's game list

Filters by game.key (the DLsite/Steam code for code-linked games, or
the folder/path for path-type ones) - not by crawled metadata title,
since title is fetched per-row inside SaveEntryRow itself, after this
list-level filter would need to run. Deliberately out of scope for
this small utility addition (see the design spec's Scope note).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (delete individual + all, 2-step confirm) → Task 5.
  §2 (Explorer: live folder, snapshot folder) → Tasks 6, 5. §3 (labels +
  version auto-detect) → Tasks 1, 2, 3, 4, 5. §4 (row layout, Option A) →
  Task 5. §5 (mismatch warning) → Tasks 4, 5. §6 (search) → Task 7. Every
  spec section has a task.
- **Placeholder scan:** none remaining - Task 5's draft-then-fix structure
  for the `mismatch` state is deliberate (shows the real bug a plan-follower
  would hit copying the first draft literally, and the exact fix), not a
  "TBD."
- **Type consistency:** `VersionMismatchDto` (Task 4's shared type) fields
  (`snapshotVersion`, `currentVersion`, `isSnapshotNewer`) are used
  identically in Task 5's `mismatch.result.*` accesses.
  `detectGameVersion`'s injected-parameter name (`readExeVersion`) matches
  between its Task 3 definition and Task 4's default-parameter usage
  (`readExeFileVersion as defaultReadExeFileVersion`, called positionally so
  the name itself doesn't need to match at the call site in
  `saveHandlers.ts`, which only ever calls the 2-argument form). `getSnapshotLabel`/`setSnapshotLabel`/etc. signatures match between Task 1's
  definition and Task 4's imports/usage.
