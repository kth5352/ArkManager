# Explorer Folder-Tree Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a folder-tree navigation sidebar to Explorer — one root node per registered library, lazily-expandable, click-to-navigate, drag-and-drop move target, collapsible with persisted open/closed state and width.

**Architecture:** A new `ExplorerSidebar.tsx` component renders as a sibling to `TabBar`/`FolderView` inside `ExplorerPage.tsx`'s existing `DndContext` (not a second one). It is a single global panel (not per-tab), reusing `useFolderScan` for lazy per-node child fetching and `ExplorerPage.tsx`'s existing drag-and-drop handler unchanged (new droppables just produce the same `ExplorerDropData` shape existing rows/breadcrumbs already produce).

**Tech Stack:** React 19, TypeScript strict, Tailwind, `@dnd-kit/core` (`useDroppable`), TanStack Query, Zod, Zustand.

## Global Constraints

- Single global sidebar, not per-tab — clicking a node navigates whichever tab is currently active (or opens a new tab if none is open).
- Open/closed state and width persist app-wide via two new `SettingKeySchema` values (`'explorer-tree-open'`, `'explorer-tree-width'`), following the exact pattern `'sidebar-width'` already uses (generic `settings:get`/`settings:set` IPC + named preload methods + a `use<X>Query`/`useSet<X>Mutation` pair).
- `ExplorerPage.tsx`'s existing `DndContext`, `handleDragStart`, and `handleDragEnd` must not change — new tree-node droppables produce the exact same `{ type: 'folder-entry', path } satisfies ExplorerDropData` shape `FolderEntryRow`/`BreadcrumbSegmentButton` already produce.
- No new component tests (no test infra exists for Explorer's UI components — verified manually via `npm run dev`, matching this project's established Explorer-feature precedent). The one exception: `clampExplorerTreeWidth` gets a unit test mirroring `clampSidebarWidth.test.ts`'s exact structure.
- Light density: folder name + expand arrow only, no file-count badges or thumbnails.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Settings plumbing for open/closed state and width

**Files:**
- Modify: `shared/types/ipc.ts` (`SettingKeySchema`, ~line 101-107)
- Modify: `electron/main/ipc/settingsHandlers.ts` (full file, 63 lines)
- Modify: `electron/preload/index.ts` (settings namespace, ~lines 33-58)
- Modify: `src/services/settingsService.ts` (full file — append new hooks)
- Create: `src/lib/clampExplorerTreeWidth.ts`
- Create: `src/lib/clampExplorerTreeWidth.test.ts`

**Interfaces:**
- Produces: `EXPLORER_TREE_WIDTH_MIN`, `EXPLORER_TREE_WIDTH_MAX`, `EXPLORER_TREE_WIDTH_DEFAULT`, `clampExplorerTreeWidth(width: number): number` from `src/lib/clampExplorerTreeWidth.ts`.
- Produces: `window.api.settings.getExplorerTreeOpen(): Promise<boolean | null>`, `setExplorerTreeOpen(open: boolean): Promise<void>`, `getExplorerTreeWidth(): Promise<number | null>`, `setExplorerTreeWidth(width: number): Promise<void>`.
- Produces: `useExplorerTreeOpenQuery()`, `useSetExplorerTreeOpenMutation()`, `useExplorerTreeWidthQuery()`, `useSetExplorerTreeWidthMutation()` from `src/services/settingsService.ts`.

- [ ] **Step 1: Write the failing test for `clampExplorerTreeWidth`**

Create `src/lib/clampExplorerTreeWidth.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  clampExplorerTreeWidth,
  EXPLORER_TREE_WIDTH_DEFAULT,
  EXPLORER_TREE_WIDTH_MAX,
  EXPLORER_TREE_WIDTH_MIN,
} from './clampExplorerTreeWidth'

describe('clampExplorerTreeWidth', () => {
  it('returns the value unchanged when within bounds', () => {
    expect(clampExplorerTreeWidth(300)).toBe(300)
  })

  it('clamps to the minimum when below it', () => {
    expect(clampExplorerTreeWidth(50)).toBe(EXPLORER_TREE_WIDTH_MIN)
  })

  it('clamps to the maximum when above it', () => {
    expect(clampExplorerTreeWidth(900)).toBe(EXPLORER_TREE_WIDTH_MAX)
  })

  it('falls back to the default for NaN', () => {
    expect(clampExplorerTreeWidth(Number.NaN)).toBe(EXPLORER_TREE_WIDTH_DEFAULT)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/clampExplorerTreeWidth.test.ts`
Expected: FAIL — `Cannot find module './clampExplorerTreeWidth'`

- [ ] **Step 3: Implement `clampExplorerTreeWidth`**

Create `src/lib/clampExplorerTreeWidth.ts`:

```ts
export const EXPLORER_TREE_WIDTH_MIN = 180
export const EXPLORER_TREE_WIDTH_MAX = 400
export const EXPLORER_TREE_WIDTH_DEFAULT = 240

export function clampExplorerTreeWidth(width: number): number {
  if (Number.isNaN(width)) return EXPLORER_TREE_WIDTH_DEFAULT
  return Math.min(EXPLORER_TREE_WIDTH_MAX, Math.max(EXPLORER_TREE_WIDTH_MIN, width))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/clampExplorerTreeWidth.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Add the two new setting keys to `SettingKeySchema`**

In `shared/types/ipc.ts`, find:

```ts
export const SettingKeySchema = z.enum([
  'theme',
  'sidebar-width',
  'locale-emulator-path',
  'locale',
  'media-folder',
])
```

Replace with:

```ts
export const SettingKeySchema = z.enum([
  'theme',
  'sidebar-width',
  'locale-emulator-path',
  'locale',
  'media-folder',
  'explorer-tree-open',
  'explorer-tree-width',
])
```

- [ ] **Step 6: Add self-healing parsers and wire them into the main-process handler**

In `electron/main/ipc/settingsHandlers.ts`, find:

```ts
// Same self-healing principle as parseStoredTheme, for the other key that
// can actually be read back (SettingKeySchema currently only allows
// 'theme' | 'sidebar-width'). The renderer's own clampSidebarWidth already
// guards against NaN once the value reaches it, but that's an accident of
// the renderer's code, not a guarantee this IPC contract makes - a
// corrupted or manually-edited DB row (e.g. "abc") would otherwise cross
// the IPC boundary as a string that looks valid but Number()s to NaN.
// Self-heals to null here instead, exactly like theme.
function parseStoredSidebarWidth(raw: string | undefined): string | null {
  if (raw === undefined) return null
  return Number.isFinite(Number(raw)) ? raw : null
}

export function registerSettingsHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, payload: unknown) => {
    const { key } = GetSettingRequestSchema.parse(payload)
    if (key === 'theme') return parseStoredTheme(getSetting(db, key))
    if (key === 'sidebar-width') return parseStoredSidebarWidth(getSetting(db, key))
    if (key === 'locale') return parseStoredLocale(getSetting(db, key))
    return getSetting(db, key) ?? null
  })
```

Replace with:

```ts
// Same self-healing principle as parseStoredSidebarWidth, for the other key that
// can actually be read back (SettingKeySchema currently only allows
// 'theme' | 'sidebar-width'). The renderer's own clampSidebarWidth already
// guards against NaN once the value reaches it, but that's an accident of
// the renderer's code, not a guarantee this IPC contract makes - a
// corrupted or manually-edited DB row (e.g. "abc") would otherwise cross
// the IPC boundary as a string that looks valid but Number()s to NaN.
// Self-heals to null here instead, exactly like theme.
function parseStoredSidebarWidth(raw: string | undefined): string | null {
  if (raw === undefined) return null
  return Number.isFinite(Number(raw)) ? raw : null
}

// Same self-healing principle as parseStoredSidebarWidth, for the explorer
// sidebar's persisted width.
function parseStoredExplorerTreeWidth(raw: string | undefined): string | null {
  if (raw === undefined) return null
  return Number.isFinite(Number(raw)) ? raw : null
}

// Same self-healing principle as parseStoredTheme, for the explorer
// sidebar's open/closed flag - a corrupted DB row falls back to null
// (treated as "no persisted value") instead of an invalid string reaching
// the renderer as if it were a valid boolean flag.
function parseStoredExplorerTreeOpen(raw: string | undefined): string | null {
  if (raw === undefined) return null
  return raw === 'true' || raw === 'false' ? raw : null
}

export function registerSettingsHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, payload: unknown) => {
    const { key } = GetSettingRequestSchema.parse(payload)
    if (key === 'theme') return parseStoredTheme(getSetting(db, key))
    if (key === 'sidebar-width') return parseStoredSidebarWidth(getSetting(db, key))
    if (key === 'locale') return parseStoredLocale(getSetting(db, key))
    if (key === 'explorer-tree-width') return parseStoredExplorerTreeWidth(getSetting(db, key))
    if (key === 'explorer-tree-open') return parseStoredExplorerTreeOpen(getSetting(db, key))
    return getSetting(db, key) ?? null
  })
```

- [ ] **Step 7: Add preload methods**

In `electron/preload/index.ts`, find:

```ts
    getSidebarWidth: (): Promise<number | null> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'sidebar-width' })
        .then((value: string | null) => (value === null ? null : Number(value))),
    setSidebarWidth: (width: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'sidebar-width', value: String(width) }),
    getLocaleEmulatorPath: (): Promise<string | null> =>
```

Replace with:

```ts
    getSidebarWidth: (): Promise<number | null> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'sidebar-width' })
        .then((value: string | null) => (value === null ? null : Number(value))),
    setSidebarWidth: (width: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'sidebar-width', value: String(width) }),
    getExplorerTreeOpen: (): Promise<boolean | null> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'explorer-tree-open' })
        .then((value: string | null) => (value === null ? null : value === 'true')),
    setExplorerTreeOpen: (open: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, {
        key: 'explorer-tree-open',
        value: String(open),
      }),
    getExplorerTreeWidth: (): Promise<number | null> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'explorer-tree-width' })
        .then((value: string | null) => (value === null ? null : Number(value))),
    setExplorerTreeWidth: (width: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, {
        key: 'explorer-tree-width',
        value: String(width),
      }),
    getLocaleEmulatorPath: (): Promise<string | null> =>
```

- [ ] **Step 8: Add the renderer-side hooks**

In `src/services/settingsService.ts`, find the import line:

```ts
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Locale, Theme } from '../../shared/types/ipc'
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from '../lib/clampSidebarWidth'
import { DEFAULT_LOCALE } from '../i18n/translations'
```

Replace with:

```ts
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Locale, Theme } from '../../shared/types/ipc'
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from '../lib/clampSidebarWidth'
import { clampExplorerTreeWidth, EXPLORER_TREE_WIDTH_DEFAULT } from '../lib/clampExplorerTreeWidth'
import { DEFAULT_LOCALE } from '../i18n/translations'
```

Then, at the end of the file, append:

```ts

export const EXPLORER_TREE_OPEN_QUERY_KEY = ['settings', 'explorer-tree-open'] as const

// Defaults to open (true) when nothing is persisted yet - matches the
// sidebar being a discoverable, expected-visible piece of Explorer's chrome
// rather than an opt-in feature a first-time user would have no reason to
// go looking for.
export function useExplorerTreeOpenQuery() {
  return useQuery({
    queryKey: EXPLORER_TREE_OPEN_QUERY_KEY,
    queryFn: async (): Promise<boolean> => {
      const value = await window.api.settings.getExplorerTreeOpen()
      return value ?? true
    },
  })
}

export function useSetExplorerTreeOpenMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (open: boolean) => window.api.settings.setExplorerTreeOpen(open),
    onSuccess: (_data, open) => {
      queryClient.setQueryData(EXPLORER_TREE_OPEN_QUERY_KEY, open)
    },
  })
}

export const EXPLORER_TREE_WIDTH_QUERY_KEY = ['settings', 'explorer-tree-width'] as const

export function useExplorerTreeWidthQuery() {
  return useQuery({
    queryKey: EXPLORER_TREE_WIDTH_QUERY_KEY,
    queryFn: async (): Promise<number> => {
      const value = await window.api.settings.getExplorerTreeWidth()
      return value === null ? EXPLORER_TREE_WIDTH_DEFAULT : clampExplorerTreeWidth(value)
    },
  })
}

export function useSetExplorerTreeWidthMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (width: number) =>
      window.api.settings.setExplorerTreeWidth(clampExplorerTreeWidth(width)),
    onSuccess: (_data, width) => {
      queryClient.setQueryData(EXPLORER_TREE_WIDTH_QUERY_KEY, clampExplorerTreeWidth(width))
    },
  })
}
```

- [ ] **Step 9: Typecheck and run the full test suite**

Run: `npm run typecheck`
Expected: exits 0, no errors.

Run: `npx vitest run`
Expected: all tests pass, including the 4 new `clampExplorerTreeWidth` tests.

- [ ] **Step 10: Manual smoke check**

Run: `npm run dev`. Open devtools console and run:

```js
await window.api.settings.setExplorerTreeWidth(300)
await window.api.settings.getExplorerTreeWidth() // expect 300
await window.api.settings.setExplorerTreeOpen(false)
await window.api.settings.getExplorerTreeOpen() // expect false
```

No UI reads these yet (Task 2 wires that up) — this only confirms the IPC round-trip persists correctly. Stop the dev server after.

- [ ] **Step 11: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/settingsHandlers.ts electron/preload/index.ts src/services/settingsService.ts src/lib/clampExplorerTreeWidth.ts src/lib/clampExplorerTreeWidth.test.ts
git commit -m "$(cat <<'EOF'
feat: add settings plumbing for Explorer sidebar open state and width

Two new SettingKeySchema values (explorer-tree-open, explorer-tree-width)
following the exact pattern sidebar-width already established. No UI
consumes these yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: ExplorerSidebar component — tree, navigation, drag-and-drop, toggle

**Files:**
- Create: `src/pages/Explorer/ExplorerSidebar.tsx`
- Modify: `src/services/scannerService.ts` (add `enabled` option to `useFolderScan`)
- Modify: `src/components/layout/PageToolbar.tsx` (new `sidebarOpen`/`onSidebarOpenChange` props)
- Modify: `src/pages/Explorer/FolderView.tsx` (thread new props to `PageToolbar`)
- Modify: `src/pages/Explorer/ExplorerPage.tsx` (render `ExplorerSidebar`, wire settings hooks)
- Modify: `src/i18n/translations.ts` (new `pageToolbar.toggleSidebar` and `explorer.sidebarNoLibraries` strings, all 3 locales)

**Interfaces:**
- Consumes: `EXPLORER_TREE_WIDTH_DEFAULT`, `clampExplorerTreeWidth` from Task 1's `src/lib/clampExplorerTreeWidth.ts`; `useExplorerTreeWidthQuery`, `useSetExplorerTreeWidthMutation`, `useExplorerTreeOpenQuery`, `useSetExplorerTreeOpenMutation` from Task 1's `src/services/settingsService.ts`.
- Produces: `ExplorerSidebar({ onNavigate: (path: string) => void })` from `src/pages/Explorer/ExplorerSidebar.tsx` — Task 3 will add an `activePath?: string` prop to this component.
- Produces: `useFolderScan(path: string, options?: { enabled?: boolean })` — the existing call site in `FolderView.tsx` (`useFolderScan(path)`) is unaffected since `enabled` defaults to `true`.

- [ ] **Step 1: Add an `enabled` option to `useFolderScan`**

In `src/services/scannerService.ts`, find:

```ts
export function useFolderScan(path: string) {
  return useQuery<ScannedEntry[]>({
    queryKey: ['folder-scan', path],
    queryFn: () => window.api.scanner.scanShallow(path),
    // Same mitigation as useGames - without this, staleTime: 0's default
    // refetch-on-mount/refocus re-runs a filesystem scan every time a tab
    // is revisited or the window regains focus.
    staleTime: 5 * 60_000,
  })
}
```

Replace with:

```ts
export function useFolderScan(path: string, options?: { enabled?: boolean }) {
  return useQuery<ScannedEntry[]>({
    queryKey: ['folder-scan', path],
    queryFn: () => window.api.scanner.scanShallow(path),
    // ExplorerSidebar.tsx passes enabled: false for a collapsed tree node -
    // no reason to scan a folder nobody has expanded yet. Defaults to true
    // so FolderView.tsx's existing unconditional useFolderScan(path) call
    // (which always wants the active tab's folder scanned) is unaffected.
    enabled: options?.enabled ?? true,
    // Same mitigation as useGames - without this, staleTime: 0's default
    // refetch-on-mount/refocus re-runs a filesystem scan every time a tab
    // is revisited or the window regains focus.
    staleTime: 5 * 60_000,
  })
}
```

- [ ] **Step 2: Add the new i18n strings**

In `src/i18n/translations.ts`, find (Korean block, ~line 100):

```ts
  'pageToolbar.toggleSortDirection': '정렬 방향 전환',
  'pageToolbar.toggleViewMode': '보기 방식 전환',
```

Replace with:

```ts
  'pageToolbar.toggleSortDirection': '정렬 방향 전환',
  'pageToolbar.toggleViewMode': '보기 방식 전환',
  'pageToolbar.toggleSidebar': '사이드바 전환',
```

Find (Korean block, `explorer.*`, ~line 278):

```ts
  'explorer.cannotAccessFolder': '이 폴더에 접근할 수 없습니다.',
  'explorer.dragCount': '{count}개 항목',
```

Replace with:

```ts
  'explorer.cannotAccessFolder': '이 폴더에 접근할 수 없습니다.',
  'explorer.dragCount': '{count}개 항목',
  'explorer.sidebarNoLibraries': '등록된 라이브러리가 없습니다.',
```

Find (Japanese block, ~line 404):

```ts
  'pageToolbar.toggleSortDirection': '並べ替え方向を切り替え',
  'pageToolbar.toggleViewMode': '表示方式を切り替え',
```

Replace with:

```ts
  'pageToolbar.toggleSortDirection': '並べ替え方向を切り替え',
  'pageToolbar.toggleViewMode': '表示方式を切り替え',
  'pageToolbar.toggleSidebar': 'サイドバーを切り替え',
```

Find (Japanese block, `explorer.*`, ~line 580):

```ts
  'explorer.cannotAccessFolder': 'このフォルダにアクセスできません。',
  'explorer.dragCount': '{count}件',
```

Replace with:

```ts
  'explorer.cannotAccessFolder': 'このフォルダにアクセスできません。',
  'explorer.dragCount': '{count}件',
  'explorer.sidebarNoLibraries': 'ライブラリが登録されていません。',
```

Find (English block, ~line 707):

```ts
  'pageToolbar.toggleSortDirection': 'Toggle sort direction',
  'pageToolbar.toggleViewMode': 'Toggle view mode',
```

Replace with:

```ts
  'pageToolbar.toggleSortDirection': 'Toggle sort direction',
  'pageToolbar.toggleViewMode': 'Toggle view mode',
  'pageToolbar.toggleSidebar': 'Toggle sidebar',
```

Find (English block, `explorer.*`, ~line 883):

```ts
  'explorer.cannotAccessFolder': 'This folder cannot be accessed.',
  'explorer.dragCount': '{count} items',
```

Replace with:

```ts
  'explorer.cannotAccessFolder': 'This folder cannot be accessed.',
  'explorer.dragCount': '{count} items',
  'explorer.sidebarNoLibraries': 'No libraries registered.',
```

- [ ] **Step 3: Create `ExplorerSidebar.tsx`**

Create `src/pages/Explorer/ExplorerSidebar.tsx`:

```tsx
import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { useLibraries } from '../../services/librariesService'
import { useFolderScan } from '../../services/scannerService'
import {
  useExplorerTreeWidthQuery,
  useSetExplorerTreeWidthMutation,
} from '../../services/settingsService'
import { clampExplorerTreeWidth, EXPLORER_TREE_WIDTH_DEFAULT } from '../../lib/clampExplorerTreeWidth'
import { useTranslation } from '../../i18n/useTranslation'
import type { ExplorerDropData } from './dragTypes'

interface ExplorerSidebarProps {
  onNavigate: (path: string) => void
}

// Set membership is normalized (lowercase, forward-slash) rather than exact
// string match - the same path can reach this set two different ways (a
// real ScannedEntry.path from a scan, or a reconstructed path from
// pathToBreadcrumbSegments in Task 3's auto-sync), and those two sources
// aren't guaranteed to agree on casing/separator for the same real folder.
// Matches the normalization findLibraryForPath.ts and ExplorerPage.tsx's
// handleDragEnd already use for the identical reason.
function normalizePath(path: string): string {
  return path.toLowerCase().replace(/\\/g, '/')
}

interface TreeNodeProps {
  path: string
  label: string
  depth: number
  disabled?: boolean
  onNavigate: (path: string) => void
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
}

function TreeNode({
  path,
  label,
  depth,
  disabled,
  onNavigate,
  expandedPaths,
  onToggleExpand,
}: TreeNodeProps) {
  const { t } = useTranslation()
  const isExpanded = expandedPaths.has(normalizePath(path))
  const { data: entries = [], isError } = useFolderScan(path, {
    enabled: isExpanded && !disabled,
  })
  const folders = entries.filter((entry) => entry.kind === 'folder')
  const { setNodeRef, isOver } = useDroppable({
    id: path,
    disabled,
    data: { type: 'folder-entry', path } satisfies ExplorerDropData,
  })

  return (
    <div>
      <div
        ref={setNodeRef}
        style={{ paddingLeft: depth * 16 }}
        className={`flex h-8 items-center gap-1 rounded px-1 text-sm ${
          disabled ? 'text-muted-foreground/50' : 'hover:bg-accent'
        } ${isOver ? 'bg-accent ring-1 ring-inset ring-primary' : ''}`}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation()
            onToggleExpand(path)
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-0"
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onNavigate(path)}
          className="truncate text-left disabled:cursor-default"
        >
          {label}
        </button>
      </div>
      {isExpanded && !disabled && (
        <div>
          {isError ? (
            <p
              style={{ paddingLeft: (depth + 1) * 16 + 4 }}
              className="truncate text-xs text-muted-foreground"
            >
              {t('explorer.cannotAccessFolder')}
            </p>
          ) : (
            folders.map((entry) => (
              <TreeNode
                key={entry.path}
                path={entry.path}
                label={entry.name}
                depth={depth + 1}
                onNavigate={onNavigate}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function ExplorerSidebar({ onNavigate }: ExplorerSidebarProps) {
  const { t } = useTranslation()
  const { data: libraries = [] } = useLibraries()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const { data: persistedWidth } = useExplorerTreeWidthQuery()
  const setWidthMutation = useSetExplorerTreeWidthMutation()
  const [width, setWidth] = useState(persistedWidth ?? EXPLORER_TREE_WIDTH_DEFAULT)
  const [syncedWidth, setSyncedWidth] = useState(persistedWidth)

  // Render-time sync, not a useEffect - same pattern DetailSidebar.tsx uses
  // for its own persisted-width sync, so the width doesn't visibly snap
  // one frame late after the query resolves.
  if (persistedWidth !== syncedWidth) {
    setSyncedWidth(persistedWidth)
    if (persistedWidth !== undefined) setWidth(persistedWidth)
  }

  const toggleExpand = (path: string): void => {
    const normalized = normalizePath(path)
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(normalized)) next.delete(normalized)
      else next.add(normalized)
      return next
    })
  }

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = width
    let latestWidth = startWidth

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      // Sidebar sits on the LEFT edge of the content area (opposite
      // DetailSidebar, which sits on the right) - dragging right (positive
      // delta) should widen it, the opposite sign from DetailSidebar's own
      // startX - moveEvent.clientX.
      latestWidth = clampExplorerTreeWidth(startWidth + (moveEvent.clientX - startX))
      setWidth(latestWidth)
    }
    const finishDrag = (): void => {
      target.removeEventListener('pointermove', handlePointerMove)
      target.removeEventListener('pointerup', finishDrag)
      target.removeEventListener('pointercancel', finishDrag)
      setWidthMutation.mutate(latestWidth)
    }

    target.addEventListener('pointermove', handlePointerMove)
    target.addEventListener('pointerup', finishDrag)
    target.addEventListener('pointercancel', finishDrag)
  }

  return (
    <div
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col overflow-y-auto border-r border-border bg-card"
    >
      <div
        onPointerDown={handleResizePointerDown}
        className="absolute right-0 top-0 z-20 h-full w-1 cursor-col-resize hover:bg-primary/40"
      />
      <div className="flex flex-col gap-0.5 p-2">
        {libraries.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {t('explorer.sidebarNoLibraries')}
          </p>
        )}
        {libraries.map((library) => (
          <TreeNode
            key={library.id}
            path={library.path}
            label={library.name}
            depth={0}
            disabled={!library.exists}
            onNavigate={onNavigate}
            expandedPaths={expandedPaths}
            onToggleExpand={toggleExpand}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add `sidebarOpen`/`onSidebarOpenChange` to `PageToolbar`**

In `src/components/layout/PageToolbar.tsx`, find:

```ts
import { ArrowDownAZ, ArrowUpAZ, LayoutGrid, List } from 'lucide-react'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Slider } from '../ui/slider'
import { useTranslation } from '../../i18n/useTranslation'
import type { SortDirection, SortField } from '../../../shared/types/ipc'

interface PageToolbarProps {
  sortField: SortField
  sortDirection: SortDirection
  onSortChange: (field: SortField, direction: SortDirection) => void
  zoom?: number
  onZoomChange?: (zoom: number) => void
  viewMode?: 'list' | 'grid'
  onViewModeChange?: (mode: 'list' | 'grid') => void
}

export function PageToolbar({
  sortField,
  sortDirection,
  onSortChange,
  zoom,
  onZoomChange,
  viewMode,
  onViewModeChange,
}: PageToolbarProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 items-center gap-2">
      <Select
```

Replace with:

```ts
import { ArrowDownAZ, ArrowUpAZ, LayoutGrid, List, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Slider } from '../ui/slider'
import { useTranslation } from '../../i18n/useTranslation'
import type { SortDirection, SortField } from '../../../shared/types/ipc'

interface PageToolbarProps {
  sortField: SortField
  sortDirection: SortDirection
  onSortChange: (field: SortField, direction: SortDirection) => void
  zoom?: number
  onZoomChange?: (zoom: number) => void
  viewMode?: 'list' | 'grid'
  onViewModeChange?: (mode: 'list' | 'grid') => void
  sidebarOpen?: boolean
  onSidebarOpenChange?: (open: boolean) => void
}

export function PageToolbar({
  sortField,
  sortDirection,
  onSortChange,
  zoom,
  onZoomChange,
  viewMode,
  onViewModeChange,
  sidebarOpen,
  onSidebarOpenChange,
}: PageToolbarProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 items-center gap-2">
      {sidebarOpen !== undefined && onSidebarOpenChange && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('pageToolbar.toggleSidebar')}
          onClick={() => onSidebarOpenChange(!sidebarOpen)}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </Button>
      )}
      <Select
```

- [ ] **Step 5: Thread the new props through `FolderView.tsx`**

In `src/pages/Explorer/FolderView.tsx`, find:

```ts
interface FolderViewProps {
  tabId: string
  path: string
  viewMode: 'list' | 'grid'
  onNavigate: (path: string) => void
  onViewModeChange: (mode: 'list' | 'grid') => void
}
```

Replace with:

```ts
interface FolderViewProps {
  tabId: string
  path: string
  viewMode: 'list' | 'grid'
  onNavigate: (path: string) => void
  onViewModeChange: (mode: 'list' | 'grid') => void
  sidebarOpen: boolean
  onSidebarOpenChange: (open: boolean) => void
}
```

Find:

```ts
export function FolderView({ tabId, path, viewMode, onNavigate, onViewModeChange }: FolderViewProps) {
```

Replace with:

```ts
export function FolderView({
  tabId,
  path,
  viewMode,
  onNavigate,
  onViewModeChange,
  sidebarOpen,
  onSidebarOpenChange,
}: FolderViewProps) {
```

Find:

```tsx
        <PageToolbar
          sortField={sortField}
          sortDirection={sortDirection}
          onSortChange={setSort}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          // Zoom only makes sense in grid mode (matching GalleryPage's own
          // "zoom only shown for a grid" precedent) - undefined here hides
          // PageToolbar's zoom slider entirely, its existing conditional
          // already handles that, unchanged.
          zoom={viewMode === 'grid' ? zoom : undefined}
          onZoomChange={viewMode === 'grid' ? setZoom : undefined}
        />
```

Replace with:

```tsx
        <PageToolbar
          sortField={sortField}
          sortDirection={sortDirection}
          onSortChange={setSort}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          // Zoom only makes sense in grid mode (matching GalleryPage's own
          // "zoom only shown for a grid" precedent) - undefined here hides
          // PageToolbar's zoom slider entirely, its existing conditional
          // already handles that, unchanged.
          zoom={viewMode === 'grid' ? zoom : undefined}
          onZoomChange={viewMode === 'grid' ? setZoom : undefined}
          sidebarOpen={sidebarOpen}
          onSidebarOpenChange={onSidebarOpenChange}
        />
```

- [ ] **Step 6: Wire `ExplorerSidebar` into `ExplorerPage.tsx`**

In `src/pages/Explorer/ExplorerPage.tsx`, find:

```tsx
import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { TabBar } from './TabBar'
import { FolderView } from './FolderView'
import { useExplorerStore } from '../../stores/explorerStore'
import { useSelectionStore } from '../../stores/selectionStore'
import { useMoveEntries } from '../../services/fileOpsService'
import { useLibraries } from '../../services/librariesService'
import { findLibraryForPath } from '../../lib/findLibraryForPath'
import { getParentPath } from '../../lib/groupMovesByOriginalParent'
import { useExplorerTabsPersistence } from '../../hooks/useExplorerTabsPersistence'
import { useTranslation } from '../../i18n/useTranslation'
import type { ExplorerDragData, ExplorerDropData } from './dragTypes'
```

Replace with:

```tsx
import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { TabBar } from './TabBar'
import { FolderView } from './FolderView'
import { ExplorerSidebar } from './ExplorerSidebar'
import { useExplorerStore } from '../../stores/explorerStore'
import { useSelectionStore } from '../../stores/selectionStore'
import { useMoveEntries } from '../../services/fileOpsService'
import { useLibraries } from '../../services/librariesService'
import { findLibraryForPath } from '../../lib/findLibraryForPath'
import { getParentPath } from '../../lib/groupMovesByOriginalParent'
import { deriveNameFromPath } from '../../lib/deriveNameFromPath'
import { useExplorerTabsPersistence } from '../../hooks/useExplorerTabsPersistence'
import { useExplorerTreeOpenQuery, useSetExplorerTreeOpenMutation } from '../../services/settingsService'
import { useTranslation } from '../../i18n/useTranslation'
import type { ExplorerDragData, ExplorerDropData } from './dragTypes'
```

Find:

```tsx
export function ExplorerPage() {
  const { t } = useTranslation()
  useExplorerTabsPersistence()
  const activeTab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const navigateTab = useExplorerStore((s) => s.navigateTab)
  const reorderTabs = useExplorerStore((s) => s.reorderTabs)
  const setViewMode = useExplorerStore((s) => s.setViewMode)
  const moveEntries = useMoveEntries()
  const { data: libraries } = useLibraries()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)
```

Replace with:

```tsx
export function ExplorerPage() {
  const { t } = useTranslation()
  useExplorerTabsPersistence()
  const activeTab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const navigateTab = useExplorerStore((s) => s.navigateTab)
  const reorderTabs = useExplorerStore((s) => s.reorderTabs)
  const setViewMode = useExplorerStore((s) => s.setViewMode)
  const addTab = useExplorerStore((s) => s.addTab)
  const moveEntries = useMoveEntries()
  const { data: libraries } = useLibraries()
  const { data: sidebarOpenSetting } = useExplorerTreeOpenQuery()
  const setSidebarOpenMutation = useSetExplorerTreeOpenMutation()
  const sidebarOpen = sidebarOpenSetting ?? true
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)

  // Sidebar clicks navigate whichever tab is active - but if none is open
  // yet (first run, or the last tab was just closed), there's nothing to
  // navigate, so open a new one instead. Matches TabBar.tsx's own
  // handleOpenFolder (native folder picker) exactly for how a new tab's
  // label is derived.
  const handleSidebarNavigate = (path: string): void => {
    if (activeTab) {
      navigateTab(activeTab.id, path)
    } else {
      addTab({ label: deriveNameFromPath(path), path })
    }
  }
```

Find:

```tsx
      <div className="flex h-full flex-col">
        <TabBar />
        {activeTab ? (
          <FolderView
            key={activeTab.id}
            tabId={activeTab.id}
            path={activeTab.path}
            viewMode={activeTab.viewMode}
            onNavigate={(path) => navigateTab(activeTab.id, path)}
            onViewModeChange={(mode) => setViewMode(activeTab.id, mode)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t('explorer.noOpenTabs')}
          </div>
        )}
      </div>
```

Replace with:

```tsx
      <div className="flex h-full">
        {sidebarOpen && <ExplorerSidebar onNavigate={handleSidebarNavigate} />}
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <TabBar />
          {activeTab ? (
            <FolderView
              key={activeTab.id}
              tabId={activeTab.id}
              path={activeTab.path}
              viewMode={activeTab.viewMode}
              onNavigate={(path) => navigateTab(activeTab.id, path)}
              onViewModeChange={(mode) => setViewMode(activeTab.id, mode)}
              sidebarOpen={sidebarOpen}
              onSidebarOpenChange={(open) => setSidebarOpenMutation.mutate(open)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t('explorer.noOpenTabs')}
            </div>
          )}
        </div>
      </div>
```

`DndContext`'s own props (`sensors`, `collisionDetection`, `onDragStart`, `onDragEnd`, `onDragCancel`) and `handleDragEnd`'s body are unchanged by this step — confirm this after editing by diffing: only the JSX inside `<DndContext>` changes, not the `<DndContext ...>` opening tag or `handleDragEnd`/`handleDragStart` function bodies above it.

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck`
Expected: exits 0, no errors.

Run: `npm run lint`
Expected: no new problems vs. the pre-task baseline (2 pre-existing: `react-hooks/refs` in `AppLayout.tsx`, `react-refresh` warning in `button.tsx`).

- [ ] **Step 8: Manual verification via `npm run dev`**

Run: `npm run dev`. In the running app, navigate to Explorer and verify:

1. Sidebar renders on the left, one row per registered library.
2. Clicking a library's chevron expands it, showing its immediate subfolders (only folders, no files).
3. Clicking deeper chevrons continues to lazy-expand.
4. Clicking a folder's name (not the chevron) navigates the active tab there — the main pane updates, breadcrumbs update.
5. With no tabs open, clicking a sidebar folder opens a new tab there.
6. Dragging a file/folder from the main pane onto a sidebar tree node moves it there (same as dropping on a breadcrumb segment today).
7. The toolbar's new toggle button (leftmost icon) hides/shows the sidebar; the icon flips between the two states.
8. Dragging the sidebar's right-edge resize handle changes its width smoothly.
9. Restart the app (`Ctrl+C` and `npm run dev` again, or fully quit and relaunch) — the sidebar's open/closed state and width both persisted.
10. No console errors throughout.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Explorer/ExplorerSidebar.tsx src/services/scannerService.ts src/components/layout/PageToolbar.tsx src/pages/Explorer/FolderView.tsx src/pages/Explorer/ExplorerPage.tsx src/i18n/translations.ts
git commit -m "$(cat <<'EOF'
feat: add Explorer folder-tree sidebar

One root node per registered library, lazy per-node expansion, click
to navigate, drag-and-drop move target (reuses ExplorerPage's existing
DndContext/handleDragEnd unchanged), collapsible with persisted
open/closed state and width.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Auto-sync sidebar to the active tab's path

**Files:**
- Modify: `src/pages/Explorer/ExplorerSidebar.tsx`
- Modify: `src/pages/Explorer/ExplorerPage.tsx`

**Interfaces:**
- Consumes: `pathToBreadcrumbSegments(path: string): BreadcrumbSegment[]` from `src/pages/Explorer/breadcrumb.ts` (existing, unchanged); `findLibraryForPath` from `src/lib/findLibraryForPath.ts` (existing, unchanged).
- Produces: `ExplorerSidebar` now accepts an additional optional prop `activePath?: string`.

- [ ] **Step 1: Add `activePath` handling to `ExplorerSidebar.tsx`**

In `src/pages/Explorer/ExplorerSidebar.tsx`, find:

```tsx
import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { useLibraries } from '../../services/librariesService'
import { useFolderScan } from '../../services/scannerService'
import {
  useExplorerTreeWidthQuery,
  useSetExplorerTreeWidthMutation,
} from '../../services/settingsService'
import { clampExplorerTreeWidth, EXPLORER_TREE_WIDTH_DEFAULT } from '../../lib/clampExplorerTreeWidth'
import { useTranslation } from '../../i18n/useTranslation'
import type { ExplorerDropData } from './dragTypes'

interface ExplorerSidebarProps {
  onNavigate: (path: string) => void
}
```

Replace with:

```tsx
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { useLibraries } from '../../services/librariesService'
import { useFolderScan } from '../../services/scannerService'
import {
  useExplorerTreeWidthQuery,
  useSetExplorerTreeWidthMutation,
} from '../../services/settingsService'
import { clampExplorerTreeWidth, EXPLORER_TREE_WIDTH_DEFAULT } from '../../lib/clampExplorerTreeWidth'
import { useTranslation } from '../../i18n/useTranslation'
import { pathToBreadcrumbSegments } from './breadcrumb'
import { findLibraryForPath } from '../../lib/findLibraryForPath'
import type { ExplorerDropData } from './dragTypes'
import type { LibraryWithStatus } from '../../../shared/types/ipc'

interface ExplorerSidebarProps {
  onNavigate: (path: string) => void
  activePath?: string
}
```

- [ ] **Step 2: Highlight the active node**

Find:

```tsx
interface TreeNodeProps {
  path: string
  label: string
  depth: number
  disabled?: boolean
  onNavigate: (path: string) => void
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
}

function TreeNode({
  path,
  label,
  depth,
  disabled,
  onNavigate,
  expandedPaths,
  onToggleExpand,
}: TreeNodeProps) {
  const { t } = useTranslation()
  const isExpanded = expandedPaths.has(normalizePath(path))
  const { data: entries = [], isError } = useFolderScan(path, {
    enabled: isExpanded && !disabled,
  })
  const folders = entries.filter((entry) => entry.kind === 'folder')
  const { setNodeRef, isOver } = useDroppable({
    id: path,
    disabled,
    data: { type: 'folder-entry', path } satisfies ExplorerDropData,
  })

  return (
    <div>
      <div
        ref={setNodeRef}
        style={{ paddingLeft: depth * 16 }}
        className={`flex h-8 items-center gap-1 rounded px-1 text-sm ${
          disabled ? 'text-muted-foreground/50' : 'hover:bg-accent'
        } ${isOver ? 'bg-accent ring-1 ring-inset ring-primary' : ''}`}
      >
```

Replace with:

```tsx
interface TreeNodeProps {
  path: string
  label: string
  depth: number
  disabled?: boolean
  onNavigate: (path: string) => void
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  activePath?: string
}

function TreeNode({
  path,
  label,
  depth,
  disabled,
  onNavigate,
  expandedPaths,
  onToggleExpand,
  activePath,
}: TreeNodeProps) {
  const { t } = useTranslation()
  const isExpanded = expandedPaths.has(normalizePath(path))
  const isActive = activePath !== undefined && normalizePath(path) === normalizePath(activePath)
  const { data: entries = [], isError } = useFolderScan(path, {
    enabled: isExpanded && !disabled,
  })
  const folders = entries.filter((entry) => entry.kind === 'folder')
  const { setNodeRef, isOver } = useDroppable({
    id: path,
    disabled,
    data: { type: 'folder-entry', path } satisfies ExplorerDropData,
  })

  return (
    <div>
      <div
        ref={setNodeRef}
        style={{ paddingLeft: depth * 16 }}
        className={`flex h-8 items-center gap-1 rounded px-1 text-sm ${
          disabled ? 'text-muted-foreground/50' : 'hover:bg-accent'
        } ${isActive ? 'bg-accent font-medium' : ''} ${
          isOver ? 'bg-accent ring-1 ring-inset ring-primary' : ''
        }`}
      >
```

- [ ] **Step 3: Pass `activePath` down through the recursive children**

Find:

```tsx
          ) : (
            folders.map((entry) => (
              <TreeNode
                key={entry.path}
                path={entry.path}
                label={entry.name}
                depth={depth + 1}
                onNavigate={onNavigate}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
              />
            ))
          )}
```

Replace with:

```tsx
          ) : (
            folders.map((entry) => (
              <TreeNode
                key={entry.path}
                path={entry.path}
                label={entry.name}
                depth={depth + 1}
                onNavigate={onNavigate}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
                activePath={activePath}
              />
            ))
          )}
```

- [ ] **Step 4: Auto-expand ancestors of `activePath` and thread it down from the root**

Find:

```tsx
export function ExplorerSidebar({ onNavigate }: ExplorerSidebarProps) {
  const { t } = useTranslation()
  const { data: libraries = [] } = useLibraries()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
```

Replace with:

```tsx
export function ExplorerSidebar({ onNavigate, activePath }: ExplorerSidebarProps) {
  const { t } = useTranslation()
  const { data: libraries = [] } = useLibraries()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  // Reveals activePath in the tree whenever the active tab's path changes
  // (tab switch, breadcrumb click, drilling into a subfolder) - expands
  // every ancestor folder between the matching library's root and
  // activePath, inclusive of activePath itself (so its own children are
  // fetched too, matching normal file-tree "navigate into" behavior).
  // pathToBreadcrumbSegments reconstructs the full drive-letter-to-leaf
  // chain; findLibraryForPath identifies which registered library (if any)
  // activePath falls under, and the segments are filtered down to just the
  // ones at or below that library's root.
  useEffect(() => {
    if (!activePath) return
    const library = findLibraryForPath<LibraryWithStatus>(activePath, libraries)
    if (!library) return
    const normalizedRoot = normalizePath(library.path)
    const ancestorPaths = pathToBreadcrumbSegments(activePath)
      .map((segment) => segment.path)
      .filter((segmentPath) => {
        const normalized = normalizePath(segmentPath)
        return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)
      })
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      for (const ancestorPath of ancestorPaths) next.add(normalizePath(ancestorPath))
      return next
    })
  }, [activePath, libraries])
```

- [ ] **Step 5: Pass `activePath` to the root-level `TreeNode`s**

Find:

```tsx
        {libraries.map((library) => (
          <TreeNode
            key={library.id}
            path={library.path}
            label={library.name}
            depth={0}
            disabled={!library.exists}
            onNavigate={onNavigate}
            expandedPaths={expandedPaths}
            onToggleExpand={toggleExpand}
          />
        ))}
```

Replace with:

```tsx
        {libraries.map((library) => (
          <TreeNode
            key={library.id}
            path={library.path}
            label={library.name}
            depth={0}
            disabled={!library.exists}
            onNavigate={onNavigate}
            expandedPaths={expandedPaths}
            onToggleExpand={toggleExpand}
            activePath={activePath}
          />
        ))}
```

- [ ] **Step 6: Pass the active tab's path from `ExplorerPage.tsx`**

In `src/pages/Explorer/ExplorerPage.tsx`, find:

```tsx
        {sidebarOpen && <ExplorerSidebar onNavigate={handleSidebarNavigate} />}
```

Replace with:

```tsx
        {sidebarOpen && (
          <ExplorerSidebar onNavigate={handleSidebarNavigate} activePath={activeTab?.path} />
        )}
```

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck`
Expected: exits 0, no errors.

Run: `npm run lint`
Expected: no new problems vs. the pre-task baseline (2 pre-existing, unrelated).

- [ ] **Step 8: Manual verification via `npm run dev`**

Run: `npm run dev`. In the running app:

1. Open a tab and drill into a nested subfolder via the main pane (not the sidebar) — the sidebar should auto-expand to reveal and highlight that folder, without any manual chevron clicks.
2. Click a breadcrumb segment to jump back up — the sidebar's highlight moves to match.
3. Open a second tab at a different library/folder, switch between the two tabs — the sidebar's highlight follows whichever tab is active.
4. Manually collapse an ancestor of the currently-highlighted node, then navigate elsewhere and back to that same path — it re-expands correctly (the effect re-runs on `activePath` change).
5. No console errors throughout.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Explorer/ExplorerSidebar.tsx src/pages/Explorer/ExplorerPage.tsx
git commit -m "$(cat <<'EOF'
feat: auto-sync Explorer sidebar to the active tab's path

Expands ancestor folders and highlights the active tab's current path
whenever it changes (tab switch, breadcrumb click, drilling into a
subfolder), reusing pathToBreadcrumbSegments and findLibraryForPath.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** Single global tree (Task 2's `ExplorerSidebar` is rendered once in `ExplorerPage.tsx`, not per-tab) ✓. Lazy expansion reusing `useFolderScan` ✓ (Task 2 Step 1/3). Click-to-navigate with new-tab fallback ✓ (Task 2 Step 6). Auto-sync/highlight ✓ (Task 3). Collapsible + persisted open/width ✓ (Task 1 + Task 2 Steps 4/6). Drag-and-drop move target reusing the existing `DndContext`/`handleDragEnd` unchanged ✓ (Task 2 Step 3's `useDroppable` producing the same `ExplorerDropData` shape; Task 2 Step 6 explicitly calls out that `handleDragEnd`'s body is untouched). Light density (name + chevron only) ✓. Library `exists: false` dimmed/non-expandable/non-droppable ✓ (Task 2 Step 3's `disabled` prop gates the chevron, click, and `useDroppable`'s own `disabled` option together). Error state on a failed node expansion ✓ (Task 2 Step 3's `isError` branch, reusing `explorer.cannotAccessFolder`). Out-of-scope items (per-tab sidebars, persisted expand-state, file-count badges, tree context-menu actions, search integration) are not implemented by any task.
- **Placeholder scan:** No TBD/TODO; every step contains complete, literal code.
- **Type consistency:** `ExplorerSidebarProps`/`TreeNodeProps` gain `activePath` in Task 3 without changing any name introduced in Task 2 (`onNavigate`, `expandedPaths`, `onToggleExpand`, `disabled` all stay the same). `useFolderScan`'s new `options?: { enabled?: boolean }` parameter (Task 2 Step 1) matches `useFolderScanRecursive`'s existing `options: { enabled: boolean }` shape in the same file. `clampExplorerTreeWidth`/`EXPLORER_TREE_WIDTH_*` names from Task 1 are used identically in Task 2's `ExplorerSidebar.tsx` and `settingsService.ts`.
