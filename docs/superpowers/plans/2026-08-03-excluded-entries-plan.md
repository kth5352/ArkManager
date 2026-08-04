# Excluded Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user right-click a game entry in Gallery/List/DetailList to exclude it from those three views, with a View-menu-accessible dialog to see and restore what's excluded.

**Architecture:** A new `excluded_entries` table keyed exactly like `game_user_data` (code value, else normalized path, via the existing `resolveGameEntryKey`). Filtering happens at the `useVisibleGames` layer via a pure `isEntryExcluded` function, so Explorer and the Saves page (which don't go through `useVisibleGames`) stay unaffected and the existing bulk-crawl-missing trigger (which already reads `useVisibleGames`'s filtered output) skips excluded entries for free. A new push-style IPC channel lets the View menu open a renderer dialog — this app's first main-process-menu-triggers-a-renderer-dialog channel, following the shape of existing push channels like `SCANNER_SCAN_PROGRESS`.

**Tech Stack:** Electron + better-sqlite3/drizzle (hand-written DDL, no migrations) + TanStack Query + Zustand + shadcn/ui (Radix Dialog/ContextMenu) + Vitest.

## Global Constraints

- Identity: reuse `resolveGameEntryKey` (`electron/main/ipc/resolveGameEntryKey.ts`) exactly — code value when linked, else `normalizeLibraryPath(path)` (already in `shared/normalizeLibraryPath.ts`, no move needed).
- Filtering happens in `useVisibleGames` only — never in the scanner or its IPC handlers. Explorer's `FolderView.tsx` usage of `GameEntryContextMenu` must not gain the exclude item.
- No confirmation dialog and no toast on exclude — matches existing favorite/cleared toggle behavior exactly. This app has no toast system anywhere; don't introduce one.
- Context menu: new item placed with the favorite/cleared toggles, a new `ContextMenuSeparator` before the destructive "삭제" item (currently has none).
- Management dialog: controlled `Dialog` (`open`/`onOpenChange` from a Zustand store, not `DialogTrigger`), empty state uses this app's centered `text-sm text-muted-foreground` idiom, row style mirrors `SaveEntryRow` (truncated name, small muted code, `hover:bg-accent`), restore button is `variant="outline" size="sm"`, no footer close button.
- Main-process strings (the new View menu item) are hardcoded Korean, no i18n — matches `guardedReload`'s existing menu items. Renderer-facing strings (context menu item, dialog) go through `src/i18n/translations.ts`'s three locale blocks.
- No drizzle-kit migrations — hand-written `CREATE TABLE IF NOT EXISTS` DDL in `client.ts`, matching every table this project has added.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

- `electron/main/database/schema.ts` (modify) — `excludedEntries` table.
- `electron/main/database/client.ts` (modify) — matching DDL.
- `electron/main/database/excludedEntriesRepository.ts` (new) + `.test.ts` — list/exclude/restore, mirrors `pathCodeOverridesRepository.ts`.
- `src/lib/isEntryExcluded.ts` (new) + `.test.ts` — pure matching function.
- `shared/types/ipc.ts` (modify) — 4 new `IPC_CHANNELS`, 2 new request schemas, 1 new DTO interface.
- `electron/main/ipc/excludedEntriesHandlers.ts` (new) — the 3 CRUD IPC handlers.
- `electron/preload/index.ts` (modify) — `api.gameEntry` namespace (4 methods).
- `electron/main/index.ts` (modify) — register the CRUD handlers; separately, the View menu item + push send.
- `src/hooks/useVisibleGames.ts` (modify) — adds the exclusion filter.
- `src/services/excludedEntriesService.ts` (new) — `useExcludedEntries`/`useExcludeEntry`/`useRestoreEntry`.
- `src/components/game/GameEntryContextMenu.tsx` (modify) — `onExclude` prop, new item, new separator.
- `src/pages/Gallery/GalleryPage.tsx`, `src/pages/List/ListPage.tsx`, `src/pages/DetailList/DetailListPage.tsx` (modify) — wire `onExclude` through their row/card components.
- `src/stores/excludedEntriesDialogStore.ts` (new) — dialog open/close state.
- `src/components/layout/ExcludedEntriesDialog.tsx` (new) — the management dialog.
- `src/components/layout/AppLayout.tsx` (modify) — mount the dialog.
- `src/i18n/translations.ts` (modify) — `exclude.*` keys × 3 locales.

---

### Task 1: excluded_entries table + repository

**Files:**
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Create: `electron/main/database/excludedEntriesRepository.ts`
- Test: `electron/main/database/excludedEntriesRepository.test.ts`

**Interfaces:**
- Produces: `ExcludedEntryRow { key: string, keyType: string, name: string, excludedAt: string }`, `listExcludedEntries(db): ExcludedEntryRow[]`, `excludeEntry(db, key: string, keyType: string, name: string): void`, `restoreEntry(db, key: string): void` — Task 4 (IPC handlers) imports all four.

- [ ] **Step 1: Add the schema table**

In `electron/main/database/schema.ts`, add after the `mediaThumbnailOverrides` export (end of file):

```ts
export const excludedEntries = sqliteTable('excluded_entries', {
  key: text('key').primaryKey(), // code value, or normalizeLibraryPath(path) - see resolveGameEntryKey
  keyType: text('key_type').notNull(), // 'code' | 'path'
  name: text('name').notNull(), // ScannedEntry.name snapshot at exclude time
  excludedAt: text('excluded_at').notNull(),
})
```

- [ ] **Step 2: Add the CREATE TABLE statement**

In `electron/main/database/client.ts`, add after the `media_thumbnail_overrides` block (before `return drizzle(...)`):

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS excluded_entries (
      key TEXT PRIMARY KEY,
      key_type TEXT NOT NULL,
      name TEXT NOT NULL,
      excluded_at TEXT NOT NULL
    )
  `)
```

- [ ] **Step 3: Write the failing repository tests**

```ts
// electron/main/database/excludedEntriesRepository.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { excludeEntry, restoreEntry, listExcludedEntries } from './excludedEntriesRepository'

describe('excludedEntriesRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('listExcludedEntries returns an empty array when nothing is excluded', () => {
    expect(listExcludedEntries(db)).toEqual([])
  })

  it('excludeEntry stores a code-keyed entry', () => {
    excludeEntry(db, 'RJ01234567', 'code', 'Some Game')
    const rows = listExcludedEntries(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('RJ01234567')
    expect(rows[0].keyType).toBe('code')
    expect(rows[0].name).toBe('Some Game')
    expect(rows[0].excludedAt).toEqual(expect.any(String))
  })

  it('excludeEntry stores a path-keyed entry', () => {
    excludeEntry(db, 'd:\\games\\some-folder', 'path', 'some-folder')
    const rows = listExcludedEntries(db)
    expect(rows[0].key).toBe('d:\\games\\some-folder')
    expect(rows[0].keyType).toBe('path')
  })

  it('excludeEntry overwrites an existing entry for the same key', () => {
    excludeEntry(db, 'RJ01234567', 'code', 'Old Name')
    excludeEntry(db, 'RJ01234567', 'code', 'New Name')
    const rows = listExcludedEntries(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('New Name')
  })

  it('restoreEntry removes an existing entry', () => {
    excludeEntry(db, 'RJ01234567', 'code', 'Some Game')
    restoreEntry(db, 'RJ01234567')
    expect(listExcludedEntries(db)).toEqual([])
  })

  it('restoreEntry is a no-op when the key does not exist', () => {
    expect(() => restoreEntry(db, 'RJ99999999')).not.toThrow()
    expect(listExcludedEntries(db)).toEqual([])
  })

  it('restoreEntry does not affect a different key', () => {
    excludeEntry(db, 'RJ01234567', 'code', 'Keep Me')
    excludeEntry(db, 'RJ09999999', 'code', 'Remove Me')
    restoreEntry(db, 'RJ09999999')
    const rows = listExcludedEntries(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('RJ01234567')
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run electron/main/database/excludedEntriesRepository.test.ts`
Expected: FAIL — the repository module does not exist yet.

- [ ] **Step 5: Write the implementation**

```ts
// electron/main/database/excludedEntriesRepository.ts
import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { excludedEntries } from './schema'

export interface ExcludedEntryRow {
  key: string
  keyType: string // 'code' | 'path'
  name: string
  excludedAt: string
}

export function listExcludedEntries(db: AppDatabase): ExcludedEntryRow[] {
  return db.select().from(excludedEntries).all()
}

export function excludeEntry(db: AppDatabase, key: string, keyType: string, name: string): void {
  const excludedAt = new Date().toISOString()
  db.insert(excludedEntries)
    .values({ key, keyType, name, excludedAt })
    .onConflictDoUpdate({ target: excludedEntries.key, set: { keyType, name, excludedAt } })
    .run()
}

export function restoreEntry(db: AppDatabase, key: string): void {
  db.delete(excludedEntries).where(eq(excludedEntries.key, key)).run()
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run electron/main/database/excludedEntriesRepository.test.ts`
Expected: PASS, 7/7.

- [ ] **Step 7: Commit**

```bash
git add electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/excludedEntriesRepository.ts electron/main/database/excludedEntriesRepository.test.ts
git commit -m "$(cat <<'EOF'
feat: add excluded_entries table and repository

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: isEntryExcluded pure matching function

**Files:**
- Create: `src/lib/isEntryExcluded.ts`
- Test: `src/lib/isEntryExcluded.test.ts`

**Interfaces:**
- Consumes: `normalizeLibraryPath(path: string): string` (existing, `shared/normalizeLibraryPath.ts`).
- Produces: `isEntryExcluded(entry: Pick<ScannedEntry, 'code' | 'path'>, excludedKeys: Set<string>): boolean` — Task 5 (`useVisibleGames`) imports this.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/isEntryExcluded.test.ts
import { describe, it, expect } from 'vitest'
import { isEntryExcluded } from './isEntryExcluded'

describe('isEntryExcluded', () => {
  it('returns true for a code-linked entry whose code is in the excluded set', () => {
    const entry = { code: { type: 'RJ' as const, value: 'RJ01234567' }, path: 'd:\\games\\foo' }
    expect(isEntryExcluded(entry, new Set(['RJ01234567']))).toBe(true)
  })

  it('returns false for a code-linked entry whose code is not excluded', () => {
    const entry = { code: { type: 'RJ' as const, value: 'RJ01234567' }, path: 'd:\\games\\foo' }
    expect(isEntryExcluded(entry, new Set(['RJ09999999']))).toBe(false)
  })

  it('returns true for a code-less entry whose normalized path is in the excluded set', () => {
    const entry = { code: null, path: 'D:\\Games\\Some-Folder\\' }
    expect(isEntryExcluded(entry, new Set(['d:\\games\\some-folder']))).toBe(true)
  })

  it('returns false for a code-less entry whose normalized path is not excluded', () => {
    const entry = { code: null, path: 'd:\\games\\other-folder' }
    expect(isEntryExcluded(entry, new Set(['d:\\games\\some-folder']))).toBe(false)
  })

  it('returns false when the excluded set is empty', () => {
    const entry = { code: null, path: 'd:\\games\\foo' }
    expect(isEntryExcluded(entry, new Set())).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/isEntryExcluded.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/isEntryExcluded.ts
import { normalizeLibraryPath } from '../../shared/normalizeLibraryPath'
import type { ScannedEntry } from '../../shared/types/scanner'

// Same identity model resolveGameEntryKey uses main-process-side (code
// value when linked, else normalizeLibraryPath(path)) - kept in sync by
// importing the same shared normalization function, not a duplicated copy.
export function isEntryExcluded(
  entry: Pick<ScannedEntry, 'code' | 'path'>,
  excludedKeys: Set<string>
): boolean {
  const key = entry.code ? entry.code.value : normalizeLibraryPath(entry.path)
  return excludedKeys.has(key)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/isEntryExcluded.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/isEntryExcluded.ts src/lib/isEntryExcluded.test.ts
git commit -m "$(cat <<'EOF'
feat: add isEntryExcluded pure matching function

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Exclude/restore/list IPC

**Files:**
- Modify: `shared/types/ipc.ts`
- Create: `electron/main/ipc/excludedEntriesHandlers.ts`
- Modify: `electron/preload/index.ts`
- Modify: `electron/main/index.ts`

**Interfaces:**
- Consumes: `excludeEntry`/`restoreEntry`/`listExcludedEntries` (Task 1), `resolveGameEntryKey` (existing).
- Produces: `IPC_CHANNELS.GAME_ENTRY_EXCLUDE`, `.GAME_ENTRY_RESTORE`, `.GAME_ENTRY_LIST_EXCLUDED`, `.MENU_OPEN_EXCLUDED_ENTRIES_DIALOG` (channel constant only — its actual send/subscribe wiring is Task 6), `ExcludedEntryDto` interface, `window.api.gameEntry.exclude(code, path, name): Promise<void>`, `.restore(key): Promise<void>`, `.listExcluded(): Promise<ExcludedEntryDto[]>`, `.onOpenExcludedEntriesDialog(callback): () => void` — Task 5 uses `exclude`, Task 6 uses `restore`/`listExcluded`/`onOpenExcludedEntriesDialog`.

- [ ] **Step 1: Add IPC channels, schemas, and the DTO**

In `shared/types/ipc.ts`, add four entries to `IPC_CHANNELS` right after `MEDIA_THUMBNAIL_SET_FROM_FILE`:

```ts
  MEDIA_THUMBNAIL_SET_FROM_FILE: 'media-thumbnail:set-from-file',
  GAME_ENTRY_EXCLUDE: 'game-entry:exclude',
  GAME_ENTRY_RESTORE: 'game-entry:restore',
  GAME_ENTRY_LIST_EXCLUDED: 'game-entry:list-excluded',
  MENU_OPEN_EXCLUDED_ENTRIES_DIALOG: 'menu:open-excluded-entries-dialog',
```

Add the request schemas and DTO anywhere after `GameEntryIdentifierSchema`'s definition:

```ts
export const ExcludeEntryRequestSchema = z.object({
  identifier: GameEntryIdentifierSchema,
  name: z.string(),
})
export type ExcludeEntryRequest = z.infer<typeof ExcludeEntryRequestSchema>

export const RestoreEntryRequestSchema = z.object({
  key: z.string(),
})
export type RestoreEntryRequest = z.infer<typeof RestoreEntryRequestSchema>

export interface ExcludedEntryDto {
  key: string
  keyType: string
  name: string
  excludedAt: string
}
```

- [ ] **Step 2: Write the IPC handlers**

```ts
// electron/main/ipc/excludedEntriesHandlers.ts
import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  ExcludeEntryRequestSchema,
  RestoreEntryRequestSchema,
  type ExcludedEntryDto,
} from '../../../shared/types/ipc'
import {
  excludeEntry,
  restoreEntry,
  listExcludedEntries,
} from '../database/excludedEntriesRepository'
import { resolveGameEntryKey } from './resolveGameEntryKey'
import type { AppDatabase } from '../database/client'

export function registerExcludedEntriesHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.GAME_ENTRY_EXCLUDE, (_event, payload: unknown) => {
    const { identifier, name } = ExcludeEntryRequestSchema.parse(payload)
    const { key, keyType } = resolveGameEntryKey(identifier)
    excludeEntry(db, key, keyType, name)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_ENTRY_RESTORE, (_event, payload: unknown) => {
    const { key } = RestoreEntryRequestSchema.parse(payload)
    restoreEntry(db, key)
  })

  ipcMain.handle(IPC_CHANNELS.GAME_ENTRY_LIST_EXCLUDED, (): ExcludedEntryDto[] => {
    return listExcludedEntries(db)
  })
}
```

- [ ] **Step 3: Expose the API in the preload script**

In `electron/preload/index.ts`, add `ExcludedEntryDto` and `GameCode` (if not already imported — check first) to the type imports at the top of the file, then add a new top-level key to the `api` object, after the `gameUserData` namespace:

```ts
  gameEntry: {
    exclude: (code: GameCode | null, path: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_ENTRY_EXCLUDE, { identifier: { code, path }, name }),
    restore: (key: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_ENTRY_RESTORE, { key }),
    listExcluded: (): Promise<ExcludedEntryDto[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GAME_ENTRY_LIST_EXCLUDED),
    onOpenExcludedEntriesDialog: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(IPC_CHANNELS.MENU_OPEN_EXCLUDED_ENTRIES_DIALOG, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MENU_OPEN_EXCLUDED_ENTRIES_DIALOG, listener)
    },
  },
```

- [ ] **Step 4: Register the handlers in electron/main/index.ts**

Add the import alongside the other IPC handler imports:

```ts
import { registerExcludedEntriesHandlers } from './ipc/excludedEntriesHandlers'
```

Register it alongside the other `register*Handlers(db)` calls inside `app.whenReady().then(...)`, right after `registerMediaThumbnailHandlers(db)`:

```ts
    registerMediaThumbnailHandlers(db)
    registerExcludedEntriesHandlers(db)
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/excludedEntriesHandlers.ts electron/preload/index.ts electron/main/index.ts
git commit -m "$(cat <<'EOF'
feat: add exclude/restore/list-excluded IPC

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Renderer service hooks + useVisibleGames filter

**Files:**
- Create: `src/services/excludedEntriesService.ts`
- Modify: `src/hooks/useVisibleGames.ts`

**Interfaces:**
- Consumes: `window.api.gameEntry.exclude/restore/listExcluded` (Task 3), `isEntryExcluded` (Task 2).
- Produces: `useExcludedEntries()`, `useExcludeEntry()`, `useRestoreEntry()` — Task 5 (context menu) uses `useExcludeEntry`, Task 6 (dialog) uses `useExcludedEntries`/`useRestoreEntry`.

- [ ] **Step 1: Write the service hooks**

```ts
// src/services/excludedEntriesService.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'
import type { ExcludedEntryDto } from '../../shared/types/ipc'

export function useExcludedEntries() {
  return useQuery<ExcludedEntryDto[]>({
    queryKey: ['excluded-entries'],
    queryFn: () => window.api.gameEntry.listExcluded(),
  })
}

export function useExcludeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entry: Pick<ScannedEntry, 'code' | 'path' | 'name'>) =>
      window.api.gameEntry.exclude(entry.code, entry.path, entry.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['excluded-entries'] })
    },
  })
}

export function useRestoreEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => window.api.gameEntry.restore(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['excluded-entries'] })
    },
  })
}
```

- [ ] **Step 2: Add the filter to useVisibleGames**

Replace `src/hooks/useVisibleGames.ts` in full:

```ts
import { useGames } from '../services/useGames'
import { useLibraries } from '../services/librariesService'
import { useLibraryVisibilityStore } from '../stores/libraryVisibilityStore'
import { useExcludedEntries } from '../services/excludedEntriesService'
import { findLibraryForPath } from '../lib/findLibraryForPath'
import { isEntryExcluded } from '../lib/isEntryExcluded'
import type { ScannedEntry } from '../../shared/types/scanner'

interface UseVisibleGamesResult {
  data: ScannedEntry[] | undefined
  isLoading: boolean
  isError: boolean
}

// Wraps useGames() with two filters: excluded entries (see
// docs/superpowers/specs/2026-08-03-excluded-entries-design.md - Explorer
// and the Saves page go through useGames() directly, NOT this hook, so
// they're deliberately unaffected) and the library-visibility filter (see
// libraryVisibilityStore) - an entry that doesn't match any registered
// library (shouldn't normally happen, since games only ever come from
// registered libraries) fails open and stays visible rather than being
// unexpectedly hidden.
export function useVisibleGames(): UseVisibleGamesResult {
  const { data: games, isLoading, isError } = useGames()
  const { data: libraries } = useLibraries()
  const hiddenLibraryIds = useLibraryVisibilityStore((s) => s.hiddenLibraryIds)
  const { data: excludedEntries } = useExcludedEntries()

  const excludedKeys = new Set((excludedEntries ?? []).map((e) => e.key))

  const data =
    games === undefined
      ? games
      : games.filter((entry) => {
          if (isEntryExcluded(entry, excludedKeys)) return false
          if (hiddenLibraryIds.size === 0) return true
          const library = findLibraryForPath(entry.path, libraries ?? [])
          return !library || !hiddenLibraryIds.has(library.id)
        })

  return { data, isLoading, isError }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/excludedEntriesService.ts src/hooks/useVisibleGames.ts
git commit -m "$(cat <<'EOF'
feat: filter excluded entries out of Gallery/List/DetailList

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Context menu item, wired into Gallery/List/DetailList

**Files:**
- Modify: `src/components/game/GameEntryContextMenu.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/pages/Gallery/GalleryPage.tsx`
- Modify: `src/pages/List/ListPage.tsx`
- Modify: `src/pages/DetailList/DetailListPage.tsx`

**Interfaces:**
- Consumes: `useExcludeEntry` (Task 4).
- Produces: `GameEntryContextMenu`'s new optional `onExclude?: (entry: ScannedEntry) => void` prop.

No automated test (no component test infrastructure exists in this codebase). Manually verified at the end of this plan.

- [ ] **Step 1: Add the i18n key**

In `src/i18n/translations.ts`, add `'exclude.excludeFromView'` right after each locale block's `'explorer.markCleared'` line:

Korean block (after `'explorer.markCleared': '클리어 표시',` at line 261):
```ts
  'explorer.markCleared': '클리어 표시',
  'exclude.excludeFromView': '보기에서 제외',
```

Japanese block (after `'explorer.markCleared': 'クリア表示',` at line 550):
```ts
  'explorer.markCleared': 'クリア表示',
  'exclude.excludeFromView': 'ビューから除外',
```

English block (after `'explorer.markCleared': 'Mark Cleared',` at line 840):
```ts
  'explorer.markCleared': 'Mark Cleared',
  'exclude.excludeFromView': 'Exclude from view',
```

- [ ] **Step 2: Update GameEntryContextMenu.tsx**

Update the import line to add `ContextMenuSeparator`:

```tsx
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../ui/context-menu'
```

Update the props interface to add `onExclude`, right after `onOpenInNewTab`:

```tsx
interface GameEntryContextMenuProps {
  entry: ScannedEntry
  onOpenDetail: (entry: ScannedEntry) => void
  // Explorer-only (folders navigate via tabs there) - Gallery/List/
  // DetailList have no tab concept, so this is simply omitted for them.
  onOpenInNewTab?: (entry: ScannedEntry) => void
  // Gallery/List/DetailList-only - Explorer stays a raw, unfiltered
  // filesystem browser, so its own usage never passes this and the item
  // below never renders there.
  onExclude?: (entry: ScannedEntry) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}
```

Update the function's destructured parameters to add `onExclude`:

```tsx
export function GameEntryContextMenu({
  entry,
  onOpenDetail,
  onOpenInNewTab,
  onExclude,
  onRename,
  onMove,
  onDelete,
}: GameEntryContextMenuProps) {
```

Replace the block from the cleared-toggle item through the end of the component:

```tsx
      <ContextMenuItem
        onSelect={() => toggleCleared.mutate({ entry, isCleared: !(userData?.isCleared ?? false) })}
      >
        {userData?.isCleared ? t('explorer.unmarkCleared') : t('explorer.markCleared')}
      </ContextMenuItem>
      {onExclude && (
        <ContextMenuItem onSelect={() => onExclude(entry)}>
          {t('exclude.excludeFromView')}
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() => onOpenDetail(entry)}>{t('game.ratingMemo')}</ContextMenuItem>
      <ContextMenuItem onSelect={() => onRename(entry)}>{t('selection.rename')}</ContextMenuItem>
      <ContextMenuItem onSelect={() => onMove(entry)}>{t('selection.move')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => onDelete(entry)} className="text-destructive">
        {t('common.delete')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
```

- [ ] **Step 3: Wire onExclude into GalleryPage.tsx**

Add the import:

```tsx
import { useExcludeEntry } from '../../services/excludedEntriesService'
```

In the `GameCard` function (around line 71-93), add `onExclude` to both the destructured parameters and the type annotation:

```tsx
function GameCard({
  game,
  genres,
  cardWidth,
  duplicateCount,
  onFilterByGenre,
  onHoverChange,
  onOpenDetail,
  onExclude,
  onRename,
  onMove,
  onDelete,
}: {
  game: ScannedEntry
  genres: string[]
  cardWidth: number
  duplicateCount: number | undefined
  onFilterByGenre: (genre: string) => void
  onHoverChange: (game: ScannedEntry | null) => void
  onOpenDetail: (game: ScannedEntry) => void
  onExclude: (entry: ScannedEntry) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}) {
```

In the same function's JSX, add `onExclude` to the `<GameEntryContextMenu>` call:

```tsx
      <GameEntryContextMenu
        entry={game}
        onOpenDetail={onOpenDetail}
        onExclude={onExclude}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
      />
```

Update `GridCellProps` to add `onExclude`:

```tsx
interface GridCellProps {
  games: ScannedEntry[]
  columnCount: number
  gap: number
  cardWidth: number
  metadataByCode: Record<string, { genres: string[] }>
  duplicateGroups: Map<string, ScannedEntry[]>
  onFilterByGenre: (genre: string) => void
  onHoverChange: (game: ScannedEntry | null) => void
  onOpenDetail: (game: ScannedEntry) => void
  onExclude: (entry: ScannedEntry) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}
```

Update `GameCell`'s destructured parameters and its own `<GameCard>` call to thread `onExclude` through (add `onExclude` to both the parameter list and the JSX props, in the same position as the other callbacks).

In `GalleryPage()`, add the mutation hook call right after `const { dialogElement, openRename, openMove, openDelete } = useEntryActionDialogs()`:

```tsx
  const excludeEntry = useExcludeEntry()
```

In the `cellProps` object passed to `<Grid>` (around line 513-526), add `onExclude`:

```tsx
                      cellProps={{
                        games: visibleGames,
                        columnCount,
                        gap,
                        cardWidth,
                        metadataByCode,
                        duplicateGroups,
                        onFilterByGenre: filterByGenre,
                        onHoverChange: handleHoverChange,
                        onOpenDetail: openDetail,
                        onExclude: (entry: ScannedEntry) => excludeEntry.mutate(entry),
                        onRename: openRename,
                        onMove: openMove,
                        onDelete: openDelete,
                      }}
```

- [ ] **Step 4: Wire onExclude into ListPage.tsx**

Same pattern as Step 3, applied to this file's equivalent structures:

Add the import:

```tsx
import { useExcludeEntry } from '../../services/excludedEntriesService'
```

Add `onExclude` to `GameRow`'s destructured parameters, its type annotation, and its `<GameEntryContextMenu>` call (the function starting at line ~40-68, mirroring exactly how `onRename`/`onMove`/`onDelete` are already threaded).

Add `onExclude` to `ListRowProps` and to `Row`'s destructured parameters and its own `<GameRow>` call.

In `ListPage()`, add right after `const { dialogElement, openRename, openMove, openDelete } = useEntryActionDialogs()`:

```tsx
  const excludeEntry = useExcludeEntry()
```

In the `rowProps` object passed to `<List>` (around line 358-368), add `onExclude`:

```tsx
                      rowProps={{
                        games: visibleGames,
                        metadataByCode,
                        duplicateGroups,
                        onFilterByGenre: filterByGenre,
                        onOpenDetail: openDetail,
                        onHoverChange: handleHoverChange,
                        onExclude: (entry: ScannedEntry) => excludeEntry.mutate(entry),
                        onRename: openRename,
                        onMove: openMove,
                        onDelete: openDelete,
                      }}
```

- [ ] **Step 5: Wire onExclude into DetailListPage.tsx**

This file has one row-level component (`Row`, no separate Card/Row split). Add the import:

```tsx
import { useExcludeEntry } from '../../services/excludedEntriesService'
```

Add `onExclude` to `DetailListRowProps`:

```tsx
interface DetailListRowProps {
  entries: ScannedEntry[]
  metadataByCode: Record<string, { genres: string[] }>
  duplicateGroups: Map<string, ScannedEntry[]>
  columnWidths: ColumnWidths
  onOpenDetail: (entry: ScannedEntry) => void
  onExclude: (entry: ScannedEntry) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}
```

Add `onExclude` to `Row`'s destructured parameters and to its `<GameEntryContextMenu>` call:

```tsx
      <GameEntryContextMenu
        entry={entry}
        onOpenDetail={onOpenDetail}
        onExclude={onExclude}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
      />
```

In `DetailListPage()`, add right after its own `const { dialogElement, openRename, openMove, openDelete } = useEntryActionDialogs()`:

```tsx
  const excludeEntry = useExcludeEntry()
```

In the `rowProps` object passed to `<List>` (around line 452-461), add `onExclude`:

```tsx
                        rowProps={{
                          entries: visible,
                          metadataByCode,
                          duplicateGroups,
                          columnWidths,
                          onOpenDetail: openDetail,
                          onExclude: (entry: ScannedEntry) => excludeEntry.mutate(entry),
                          onRename: openRename,
                          onMove: openMove,
                          onDelete: openDelete,
                        }}
```

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/game/GameEntryContextMenu.tsx src/i18n/translations.ts src/pages/Gallery/GalleryPage.tsx src/pages/List/ListPage.tsx src/pages/DetailList/DetailListPage.tsx
git commit -m "$(cat <<'EOF'
feat: add exclude-from-view context menu item to Gallery/List/DetailList

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Management dialog + View menu

**Files:**
- Create: `src/stores/excludedEntriesDialogStore.ts`
- Create: `src/components/layout/ExcludedEntriesDialog.tsx`
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `electron/main/index.ts`

**Interfaces:**
- Consumes: `useExcludedEntries`/`useRestoreEntry` (Task 4), `window.api.gameEntry.onOpenExcludedEntriesDialog`/`IPC_CHANNELS.MENU_OPEN_EXCLUDED_ENTRIES_DIALOG` (Task 3).

No automated test (no component test infrastructure exists in this codebase). Manually verified at the end of this plan.

- [ ] **Step 1: Add the dialog-open Zustand store**

```ts
// src/stores/excludedEntriesDialogStore.ts
import { create } from 'zustand'

interface ExcludedEntriesDialogState {
  isOpen: boolean
  open: () => void
  close: () => void
}

// Not persisted - ephemeral dialog-open UI state, same "not a saved
// preference" precedent as libraryVisibilityStore. Lives in a store rather
// than local component state because the dialog is opened from the
// main-process View menu, which has no specific page/component context to
// hold state in.
export const useExcludedEntriesDialogStore = create<ExcludedEntriesDialogState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
```

- [ ] **Step 2: Add the i18n keys**

In `src/i18n/translations.ts`, add three more keys right after the `'exclude.excludeFromView'` line added in Task 5 (same three locations):

Korean block:
```ts
  'exclude.excludeFromView': '보기에서 제외',
  'exclude.dialogTitle': '제외된 항목 관리',
  'exclude.empty': '제외된 항목이 없습니다',
  'exclude.restore': '복원',
```

Japanese block:
```ts
  'exclude.excludeFromView': 'ビューから除外',
  'exclude.dialogTitle': '除外された項目の管理',
  'exclude.empty': '除外された項目がありません',
  'exclude.restore': '復元',
```

English block:
```ts
  'exclude.excludeFromView': 'Exclude from view',
  'exclude.dialogTitle': 'Manage Excluded Items',
  'exclude.empty': 'No excluded items',
  'exclude.restore': 'Restore',
```

- [ ] **Step 3: Write the dialog component**

```tsx
// src/components/layout/ExcludedEntriesDialog.tsx
import { useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useExcludedEntries, useRestoreEntry } from '../../services/excludedEntriesService'
import { useExcludedEntriesDialogStore } from '../../stores/excludedEntriesDialogStore'
import { useTranslation } from '../../i18n/useTranslation'

// Mounted once in AppLayout (matching MediaPlayerHost/BulkCrawlProgressBanner's
// own always-mounted-but-usually-renders-little pattern) - has no visible
// trigger of its own anywhere in the UI, only the View menu's "제외 항목
// 관리..." item opens it, via the MENU_OPEN_EXCLUDED_ENTRIES_DIALOG push
// channel below.
export function ExcludedEntriesDialog() {
  const { t } = useTranslation()
  const isOpen = useExcludedEntriesDialogStore((s) => s.isOpen)
  const open = useExcludedEntriesDialogStore((s) => s.open)
  const close = useExcludedEntriesDialogStore((s) => s.close)
  const { data: excludedEntries } = useExcludedEntries()
  const restoreEntry = useRestoreEntry()

  useEffect(() => {
    return window.api.gameEntry.onOpenExcludedEntriesDialog(() => open())
  }, [open])

  return (
    <Dialog open={isOpen} onOpenChange={(next) => (next ? open() : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('exclude.dialogTitle')}</DialogTitle>
        </DialogHeader>
        {!excludedEntries || excludedEntries.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {t('exclude.empty')}
          </div>
        ) : (
          <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {excludedEntries.map((entry) => (
              <div
                key={entry.key}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                {entry.keyType === 'code' && (
                  <span className="shrink-0 truncate text-xs text-muted-foreground">
                    {entry.key}
                  </span>
                )}
                <Button variant="outline" size="sm" onClick={() => restoreEntry.mutate(entry.key)}>
                  {t('exclude.restore')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Mount the dialog in AppLayout.tsx**

Add the import:

```tsx
import { ExcludedEntriesDialog } from './ExcludedEntriesDialog'
```

Add `<ExcludedEntriesDialog />` alongside the existing `<MediaPlayerHost />`/`<BulkCrawlProgressBanner .../>` lines:

```tsx
      <MediaPlayerHost />
      <BulkCrawlProgressBanner progress={bulkCrawlProgress} />
      <ExcludedEntriesDialog />
```

- [ ] **Step 5: Add the View menu item**

In `electron/main/index.ts`, add the import (if `IPC_CHANNELS` isn't already imported in this file — check first):

```ts
import { IPC_CHANNELS } from '../../shared/types/ipc'
```

In `buildApplicationMenu()`'s View submenu array, add a new item after `{ role: 'togglefullscreen' }`:

```ts
          { role: 'togglefullscreen' },
          { type: 'separator' },
          {
            label: '제외 항목 관리...',
            click: (_item, win) => {
              if (win instanceof BrowserWindow) {
                win.webContents.send(IPC_CHANNELS.MENU_OPEN_EXCLUDED_ENTRIES_DIALOG)
              }
            },
          },
```

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/stores/excludedEntriesDialogStore.ts src/components/layout/ExcludedEntriesDialog.tsx src/components/layout/AppLayout.tsx src/i18n/translations.ts electron/main/index.ts
git commit -m "$(cat <<'EOF'
feat: add excluded entries management dialog, reachable from the View menu

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Live Verification (controller-level, after all tasks and the final whole-branch review)

Verify each item from the spec against the real running app (`npm run dev` or the established Playwright `_electron` pattern), against an isolated test library so no real data is touched:

1. Right-click a code-linked entry in Gallery, select "보기에서 제외" — confirm it disappears immediately, with no confirmation dialog and no toast.
2. Repeat for a code-less (path-keyed) entry, and confirm both disappear from List and DetailList too (same underlying `useVisibleGames`).
3. Confirm Explorer still shows both entries — unaffected.
4. Confirm the excluded entries no longer appear in the bulk-crawl-missing trigger (no new network requests for their codes — can check via DevTools' Network tab or the existing crawl-progress banner not including them).
5. Open the View menu → "제외 항목 관리...", confirm both excluded entries appear with correct names, and the code-linked one also shows its code.
6. Click "복원" on one, confirm it disappears from the dialog and reappears in Gallery/List/DetailList without a manual refresh.
7. With the dialog showing zero entries, confirm the empty-state message renders correctly.
8. Confirm the new "삭제" separator renders correctly in the context menu, and that light/dark mode both look correct throughout.
9. Restart the app (or reload) and confirm exclusions persisted (DB-backed, not session-only).
10. Check the DevTools console for errors throughout.

Report back what was seen, and flag anything visually broken.
