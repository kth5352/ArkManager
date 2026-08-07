# Explorer Grid View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Explorer a second, per-tab-persisted view mode (grid, alongside the existing list), reusing Gallery's established `react-window` Grid pattern at Explorer's already-light info density.

**Architecture:** Task 1 adds the data model and persistence for a per-tab `viewMode: 'list' | 'grid'` field, fully independent of any UI (testable via the store's own unit tests). Task 2 adds the actual grid rendering (a new `FolderEntryCard` sibling to the existing `FolderEntryRow`, reusing the same `EntryIcon`/`SelectionCheckbox`/drag-and-drop wiring) and the toggle button that switches a tab between the two modes end-to-end.

**Tech Stack:** React 19 + TypeScript strict, `react-window` + `react-virtualized-auto-sizer` (already dependencies, already used by `GalleryPage.tsx`'s grid), Zustand, Drizzle ORM + better-sqlite3 (no drizzle-kit migration pipeline in this project — schema changes use the established `ensureColumns` backfill pattern).

## Global Constraints

- No new component/dialog tests (no test infrastructure for these exists app-wide) — grid rendering and the toggle are verified live via `npm run dev`.
- Grid view applies to normal browsing only. Explorer's recursive-search results always render as a list regardless of the active tab's view mode — confirmed with the user, a compact grid card has no room for a search result's relative-path context.
- View mode is a per-tab setting (confirmed with the user over the app-wide-default alternative) — persisted the same way each tab's own `path` already is, surviving an app restart.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Per-tab view mode — data model and persistence

**Files:**
- Modify: `electron/main/database/client.ts`
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/explorerTabsRepository.ts`
- Modify: `electron/main/database/explorerTabsRepository.test.ts`
- Modify: `shared/types/ipc.ts`
- Modify: `src/stores/explorerStore.ts`
- Modify: `src/stores/explorerStore.test.ts`
- Modify: `src/hooks/useExplorerTabsPersistence.ts`

**Interfaces:**
- Produces: `ExplorerTab.viewMode: 'list' | 'grid'` (`src/stores/explorerStore.ts`) and `useExplorerStore`'s new `setViewMode(id: string, mode: 'list' | 'grid'): void` action — both consumed by Task 2's `ExplorerPage.tsx`/`FolderView.tsx` changes.

- [ ] **Step 1: Add the `view_mode` column to the database**

Edit `electron/main/database/client.ts`. Current `explorer_tabs` block (no other table's DDL in this file changes):

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS explorer_tabs (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      path TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_active INTEGER NOT NULL
    )
  `)
```

Replace with (adds the new column to the DDL, and — since `explorer_tabs` has never had an `ensureColumns` backfill call before now — adds one right after, matching the exact pattern `game_metadata`/`game_user_data` already use directly below in this same file):

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS explorer_tabs (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      path TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_active INTEGER NOT NULL,
      view_mode TEXT NOT NULL DEFAULT 'list'
    )
  `)
  ensureColumns(sqlite, 'explorer_tabs', [
    { name: 'view_mode', ddl: "view_mode TEXT NOT NULL DEFAULT 'list'" },
  ])
```

- [ ] **Step 2: Add the column to the Drizzle schema**

Edit `electron/main/database/schema.ts`. Current:

```ts
export const explorerTabs = sqliteTable('explorer_tabs', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  path: text('path').notNull(),
  position: integer('position').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
})
```

Replace with:

```ts
export const explorerTabs = sqliteTable('explorer_tabs', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  path: text('path').notNull(),
  position: integer('position').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
  viewMode: text('view_mode').notNull().default('list'),
})
```

- [ ] **Step 3: Add `viewMode` to the repository's `PersistedExplorerTab`**

Edit `electron/main/database/explorerTabsRepository.ts`. Current:

```ts
export interface PersistedExplorerTab {
  id: string
  label: string
  path: string
  position: number
  isActive: boolean
}
```

Replace with:

```ts
export interface PersistedExplorerTab {
  id: string
  label: string
  path: string
  position: number
  isActive: boolean
  viewMode: 'list' | 'grid'
}
```

`loadExplorerTabs`/`saveExplorerTabs` need no changes — both already operate generically on the full row shape (`db.select().from(explorerTabs)` and `tx.insert(explorerTabs).values(tab)`), so the new column flows through automatically once the interface and schema above include it.

- [ ] **Step 4: Update `explorerTabsRepository.test.ts`**

Replace the full file (adds `viewMode` to every existing literal, plus one new test confirming it round-trips):

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { loadExplorerTabs, saveExplorerTabs } from './explorerTabsRepository'

describe('explorerTabsRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns an empty list when nothing was ever saved', () => {
    expect(loadExplorerTabs(db)).toEqual([])
  })

  it('saves and reloads tabs in position order', () => {
    saveExplorerTabs(db, [
      { id: 'a', label: 'A', path: 'D:\\A', position: 0, isActive: false, viewMode: 'list' },
      { id: 'b', label: 'B', path: 'D:\\B', position: 1, isActive: true, viewMode: 'grid' },
    ])

    expect(loadExplorerTabs(db)).toEqual([
      { id: 'a', label: 'A', path: 'D:\\A', position: 0, isActive: false, viewMode: 'list' },
      { id: 'b', label: 'B', path: 'D:\\B', position: 1, isActive: true, viewMode: 'grid' },
    ])
  })

  it('replaces the previous tab set entirely on each save (not additive)', () => {
    saveExplorerTabs(db, [
      { id: 'a', label: 'A', path: 'D:\\A', position: 0, isActive: true, viewMode: 'list' },
    ])
    saveExplorerTabs(db, [
      { id: 'b', label: 'B', path: 'D:\\B', position: 0, isActive: true, viewMode: 'list' },
    ])

    expect(loadExplorerTabs(db)).toEqual([
      { id: 'b', label: 'B', path: 'D:\\B', position: 0, isActive: true, viewMode: 'list' },
    ])
  })

  it('round-trips a grid-mode tab', () => {
    saveExplorerTabs(db, [
      { id: 'a', label: 'A', path: 'D:\\A', position: 0, isActive: true, viewMode: 'grid' },
    ])
    expect(loadExplorerTabs(db)[0].viewMode).toBe('grid')
  })
})
```

- [ ] **Step 5: Run the repository tests to confirm they pass**

Run: `npx vitest run electron/main/database/explorerTabsRepository.test.ts`
Expected: PASS (4/4). This also exercises Steps 1-3 end-to-end (the in-memory DB is created fresh via `createDbClient`, so the new column's DDL/`ensureColumns` call both run for real here).

- [ ] **Step 6: Add `viewMode` to the shared IPC schema**

Edit `shared/types/ipc.ts`. Current:

```ts
export const PersistedExplorerTabSchema = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
  position: z.number(),
  isActive: z.boolean(),
})
export type PersistedExplorerTab = z.infer<typeof PersistedExplorerTabSchema>
```

Replace with:

```ts
export const PersistedExplorerTabSchema = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
  position: z.number(),
  isActive: z.boolean(),
  viewMode: z.enum(['list', 'grid']),
})
export type PersistedExplorerTab = z.infer<typeof PersistedExplorerTabSchema>
```

`SaveExplorerTabsRequestSchema` (`z.object({ tabs: z.array(PersistedExplorerTabSchema) })`, directly below) needs no change — it already references `PersistedExplorerTabSchema`, so the new field flows through automatically.

- [ ] **Step 7: Add `viewMode` to the store's `ExplorerTab` and a new `setViewMode` action**

Edit `src/stores/explorerStore.ts`. Current:

```ts
import { create } from 'zustand'

export interface ExplorerTab {
  id: string
  label: string
  path: string
}

interface ExplorerState {
  tabs: ExplorerTab[]
  activeTabId: string
  addTab: (tab: Omit<ExplorerTab, 'id'>) => void
  closeTab: (id: string) => void
  closeOtherTabs: (id: string) => void
  duplicateTab: (id: string) => void
  reorderTabs: (fromId: string, toId: string) => void
  setActiveTab: (id: string) => void
  navigateTab: (id: string, path: string) => void
}

function createTabId(): string {
  return crypto.randomUUID()
}

// No hardcoded default tabs - every machine has a different library layout,
// so guessing a path here (e.g. a developer's own drive letters) would just
// point most users at a folder that doesn't exist. First run starts empty;
// ExplorerPage shows an empty-state message until a tab is opened, and tabs
// are persisted from then on (see useExplorerTabsPersistence).
const initialTabs: ExplorerTab[] = []

export const useExplorerStore = create<ExplorerState>((set) => ({
  tabs: initialTabs,
  activeTabId: '',

  addTab: (tab) =>
    set((state) => {
      const id = createTabId()
      return { tabs: [...state.tabs, { ...tab, id }], activeTabId: id }
    }),

  closeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      const activeTabId = state.activeTabId === id ? (tabs[0]?.id ?? '') : state.activeTabId
      return { tabs, activeTabId }
    }),

  closeOtherTabs: (id) =>
    set((state) => ({ tabs: state.tabs.filter((tab) => tab.id === id), activeTabId: id })),

  duplicateTab: (id) =>
    set((state) => {
      const source = state.tabs.find((tab) => tab.id === id)
      if (!source) return state
      const newTab = { ...source, id: createTabId() }
      const index = state.tabs.findIndex((tab) => tab.id === id)
      const tabs = [...state.tabs]
      tabs.splice(index + 1, 0, newTab)
      return { tabs, activeTabId: newTab.id }
    }),

  reorderTabs: (fromId, toId) =>
    set((state) => {
      const fromIndex = state.tabs.findIndex((tab) => tab.id === fromId)
      const toIndex = state.tabs.findIndex((tab) => tab.id === toId)
      if (fromIndex === -1 || toIndex === -1) return state
      const tabs = [...state.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { tabs }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  navigateTab: (id, path) =>
    set((state) => ({ tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, path } : tab)) })),
}))
```

Replace with (adds `viewMode` to `ExplorerTab`, keeps `addTab`'s external signature unchanged by excluding `viewMode` from what callers must supply — it defaults to `'list'` internally, so `TabBar.tsx`'s and `FolderView.tsx`'s existing `addTab({ label, path })` call sites need no changes — and adds `setViewMode`, matching `navigateTab`'s exact map-and-conditionally-spread pattern):

```ts
import { create } from 'zustand'

export interface ExplorerTab {
  id: string
  label: string
  path: string
  viewMode: 'list' | 'grid'
}

interface ExplorerState {
  tabs: ExplorerTab[]
  activeTabId: string
  addTab: (tab: Omit<ExplorerTab, 'id' | 'viewMode'>) => void
  closeTab: (id: string) => void
  closeOtherTabs: (id: string) => void
  duplicateTab: (id: string) => void
  reorderTabs: (fromId: string, toId: string) => void
  setActiveTab: (id: string) => void
  navigateTab: (id: string, path: string) => void
  setViewMode: (id: string, mode: ExplorerTab['viewMode']) => void
}

function createTabId(): string {
  return crypto.randomUUID()
}

// No hardcoded default tabs - every machine has a different library layout,
// so guessing a path here (e.g. a developer's own drive letters) would just
// point most users at a folder that doesn't exist. First run starts empty;
// ExplorerPage shows an empty-state message until a tab is opened, and tabs
// are persisted from then on (see useExplorerTabsPersistence).
const initialTabs: ExplorerTab[] = []

export const useExplorerStore = create<ExplorerState>((set) => ({
  tabs: initialTabs,
  activeTabId: '',

  addTab: (tab) =>
    set((state) => {
      const id = createTabId()
      return { tabs: [...state.tabs, { ...tab, id, viewMode: 'list' }], activeTabId: id }
    }),

  closeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      const activeTabId = state.activeTabId === id ? (tabs[0]?.id ?? '') : state.activeTabId
      return { tabs, activeTabId }
    }),

  closeOtherTabs: (id) =>
    set((state) => ({ tabs: state.tabs.filter((tab) => tab.id === id), activeTabId: id })),

  duplicateTab: (id) =>
    set((state) => {
      const source = state.tabs.find((tab) => tab.id === id)
      if (!source) return state
      const newTab = { ...source, id: createTabId() }
      const index = state.tabs.findIndex((tab) => tab.id === id)
      const tabs = [...state.tabs]
      tabs.splice(index + 1, 0, newTab)
      return { tabs, activeTabId: newTab.id }
    }),

  reorderTabs: (fromId, toId) =>
    set((state) => {
      const fromIndex = state.tabs.findIndex((tab) => tab.id === fromId)
      const toIndex = state.tabs.findIndex((tab) => tab.id === toId)
      if (fromIndex === -1 || toIndex === -1) return state
      const tabs = [...state.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { tabs }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  navigateTab: (id, path) =>
    set((state) => ({ tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, path } : tab)) })),

  setViewMode: (id, mode) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, viewMode: mode } : tab)),
    })),
}))
```

- [ ] **Step 8: Update `explorerStore.test.ts`**

Replace the full file (adds `viewMode: 'list'` to the `beforeEach` fixture's tabs, since `ExplorerTab` now requires it, plus one new test for `setViewMode`):

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useExplorerStore } from './explorerStore'

describe('useExplorerStore', () => {
  beforeEach(() => {
    useExplorerStore.setState({
      tabs: [
        { id: 'a', label: 'A', path: '/a', viewMode: 'list' },
        { id: 'b', label: 'B', path: '/b', viewMode: 'list' },
        { id: 'c', label: 'C', path: '/c', viewMode: 'list' },
      ],
      activeTabId: 'a',
    })
  })

  it('reorders tabs by moving one before another', () => {
    useExplorerStore.getState().reorderTabs('c', 'a')
    expect(useExplorerStore.getState().tabs.map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })

  it('closes a tab and activates the first remaining tab if it was active', () => {
    useExplorerStore.getState().closeTab('a')
    const state = useExplorerStore.getState()
    expect(state.tabs.map((t) => t.id)).toEqual(['b', 'c'])
    expect(state.activeTabId).toBe('b')
  })

  it('keeps the active tab unchanged when closing a non-active tab', () => {
    useExplorerStore.getState().closeTab('b')
    expect(useExplorerStore.getState().activeTabId).toBe('a')
  })

  it('duplicates a tab right after the original', () => {
    useExplorerStore.getState().duplicateTab('a')
    const tabs = useExplorerStore.getState().tabs
    expect(tabs[0].id).toBe('a')
    expect(tabs[1].path).toBe('/a')
    expect(tabs[1].id).not.toBe('a')
  })

  it('closeOtherTabs leaves only the target tab', () => {
    useExplorerStore.getState().closeOtherTabs('b')
    expect(useExplorerStore.getState().tabs.map((t) => t.id)).toEqual(['b'])
  })

  it('navigateTab updates only the target tab path', () => {
    useExplorerStore.getState().navigateTab('a', '/a/sub')
    const tabs = useExplorerStore.getState().tabs
    expect(tabs.find((t) => t.id === 'a')?.path).toBe('/a/sub')
    expect(tabs.find((t) => t.id === 'b')?.path).toBe('/b')
  })

  it('setViewMode updates only the target tab', () => {
    useExplorerStore.getState().setViewMode('a', 'grid')
    const tabs = useExplorerStore.getState().tabs
    expect(tabs.find((t) => t.id === 'a')?.viewMode).toBe('grid')
    expect(tabs.find((t) => t.id === 'b')?.viewMode).toBe('list')
  })
})
```

- [ ] **Step 9: Run the store tests to confirm they pass**

Run: `npx vitest run src/stores/explorerStore.test.ts`
Expected: PASS (7/7).

- [ ] **Step 10: Thread `viewMode` through the persistence hook's load mapping**

Edit `src/hooks/useExplorerTabsPersistence.ts`. Current load-mapping line (inside the `loadExplorerTabs().then(...)` callback):

```ts
        const tabs = [...persisted]
          .sort((a, b) => a.position - b.position)
          .map(({ id, label, path }) => ({ id, label, path }))
```

Replace with:

```ts
        const tabs = [...persisted]
          .sort((a, b) => a.position - b.position)
          .map(({ id, label, path, viewMode }) => ({ id, label, path, viewMode }))
```

The save-mapping side (`const payload = state.tabs.map((tab, index) => ({ ...tab, position: index, isActive: ... }))`) needs no change — it already spreads the full `tab` object, which now includes `viewMode` automatically once Step 7 lands.

- [ ] **Step 11: Typecheck**

Run: `npm run typecheck`
Expected: no new errors. This step specifically catches any remaining caller that still constructs an `ExplorerTab`/`PersistedExplorerTab` literal without `viewMode`.

- [ ] **Step 12: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions (467 → 472, five new tests: 1 repository round-trip test + 1 store `setViewMode` test, plus the 3 existing repository tests' literals updated in place rather than added).

- [ ] **Step 13: Commit**

```bash
git add electron/main/database/client.ts electron/main/database/schema.ts electron/main/database/explorerTabsRepository.ts electron/main/database/explorerTabsRepository.test.ts shared/types/ipc.ts src/stores/explorerStore.ts src/stores/explorerStore.test.ts src/hooks/useExplorerTabsPersistence.ts
git commit -m "$(cat <<'EOF'
feat: add a per-tab, persisted view mode to Explorer's data model

A new view_mode column on explorer_tabs (backfilled via this
project's established ensureColumns pattern, since there's no
drizzle-kit migration pipeline) threaded through the repository, the
shared IPC schema, useExplorerStore's ExplorerTab, and the tabs
persistence hook's load/save mapping. Per-tab, not app-wide, per the
user's explicit choice - tab A can be in grid view while tab B stays
list, surviving a restart exactly like each tab's own path already
does. No UI yet - this lands the data model on its own, testable via
the store and repository's own unit tests.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Grid rendering and the toggle button

**Files:**
- Modify: `src/components/layout/PageToolbar.tsx`
- Modify: `src/pages/Explorer/ExplorerPage.tsx`
- Modify: `src/pages/Explorer/FolderView.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `ExplorerTab.viewMode` and `useExplorerStore`'s `setViewMode(id, mode)` (Task 1, `src/stores/explorerStore.ts`).
- Produces: nothing consumed by anything outside this task — it's the plan's final task.

- [ ] **Step 1: Add the toggle button to `PageToolbar.tsx`**

Current file:

```tsx
import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react'
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
}

export function PageToolbar({
  sortField,
  sortDirection,
  onSortChange,
  zoom,
  onZoomChange,
}: PageToolbarProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 items-center gap-2">
      <Select
        value={sortField}
        onValueChange={(value) => onSortChange(value as SortField, sortDirection)}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">{t('pageToolbar.name')}</SelectItem>
          <SelectItem value="mtime">{t('pageToolbar.mtime')}</SelectItem>
          <SelectItem value="extension">{t('pageToolbar.extension')}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('pageToolbar.toggleSortDirection')}
        onClick={() => onSortChange(sortField, sortDirection === 'asc' ? 'desc' : 'asc')}
      >
        {sortDirection === 'asc' ? (
          <ArrowUpAZ className="h-4 w-4" />
        ) : (
          <ArrowDownAZ className="h-4 w-4" />
        )}
      </Button>
      {zoom !== undefined && onZoomChange && (
        <Slider
          className="ml-auto w-40"
          value={[zoom]}
          min={0.6}
          max={1.8}
          step={0.05}
          onValueChange={([value]) => onZoomChange(value)}
        />
      )}
    </div>
  )
}
```

Replace with (adds `viewMode`/`onViewModeChange` optional props, following the exact `zoom`/`onZoomChange` optional-pair pattern already established, and a toggle button between the sort-direction button and the zoom slider — the existing zoom conditional itself is untouched; whether zoom shows at all is still entirely up to whether the CALLER passes it, which Task 2's `FolderView.tsx` change will only do while in grid mode):

```tsx
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
        value={sortField}
        onValueChange={(value) => onSortChange(value as SortField, sortDirection)}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">{t('pageToolbar.name')}</SelectItem>
          <SelectItem value="mtime">{t('pageToolbar.mtime')}</SelectItem>
          <SelectItem value="extension">{t('pageToolbar.extension')}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('pageToolbar.toggleSortDirection')}
        onClick={() => onSortChange(sortField, sortDirection === 'asc' ? 'desc' : 'asc')}
      >
        {sortDirection === 'asc' ? (
          <ArrowUpAZ className="h-4 w-4" />
        ) : (
          <ArrowDownAZ className="h-4 w-4" />
        )}
      </Button>
      {viewMode !== undefined && onViewModeChange && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('pageToolbar.toggleViewMode')}
          onClick={() => onViewModeChange(viewMode === 'list' ? 'grid' : 'list')}
        >
          {viewMode === 'list' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
        </Button>
      )}
      {zoom !== undefined && onZoomChange && (
        <Slider
          className="ml-auto w-40"
          value={[zoom]}
          min={0.6}
          max={1.8}
          step={0.05}
          onValueChange={([value]) => onZoomChange(value)}
        />
      )}
    </div>
  )
}
```

(The icon shown is the mode you'd switch *to*, matching how a real toggle button reads — `LayoutGrid` while in list mode invites switching to grid, `List` while in grid mode invites switching back.)

- [ ] **Step 2: Add the two new translation keys (ko/ja/en)**

Edit `src/i18n/translations.ts`. Insert immediately after the existing `'pageToolbar.toggleSortDirection'` line in each locale block:

**`ko`** (after line 99):
```ts
  'pageToolbar.toggleViewMode': '보기 방식 전환',
```

**`ja`** (after line 402):
```ts
  'pageToolbar.toggleViewMode': '表示方式を切り替え',
```

**`en`** (after line 704):
```ts
  'pageToolbar.toggleViewMode': 'Toggle view mode',
```

- [ ] **Step 3: Pass `viewMode`/`onViewModeChange` down from `ExplorerPage.tsx`**

Current file (as left by the drag-and-drop-move sub-project — full content):

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

interface ActiveDrag {
  data: ExplorerDragData
  count: number
}

export function ExplorerPage() {
  const { t } = useTranslation()
  useExplorerTabsPersistence()
  const activeTab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const navigateTab = useExplorerStore((s) => s.navigateTab)
  const reorderTabs = useExplorerStore((s) => s.reorderTabs)
  const moveEntries = useMoveEntries()
  const { data: libraries } = useLibraries()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)

  const handleDragStart = (event: DragStartEvent): void => {
    const data = event.active.data.current as ExplorerDragData | undefined
    if (!data) return
    const selectedPaths = useSelectionStore.getState().selectedPaths
    const count =
      data.type === 'entry' && selectedPaths.has(data.entry.path) ? selectedPaths.size : 1
    setActiveDrag({ data, count })
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveDrag(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeData = active.data.current as ExplorerDragData | undefined

    if (activeData?.type === 'tab') {
      reorderTabs(String(active.id), String(over.id))
      return
    }

    if (activeData?.type === 'entry') {
      const overData = over.data.current as ExplorerDropData | undefined
      if (!overData) return
      const destDir = overData.path
      // Hard safety net: never move to a destination outside every
      // registered library. The backend intentionally leaves destDir
      // unrestricted (see explorerHandlers.ts's own comment) because the
      // existing native-folder-picker Move dialog legitimately supports
      // moving to arbitrary non-library locations (e.g. a backup drive) -
      // but that's a deliberate multi-step flow, unlike a single easily
      // mis-clicked drag-and-drop gesture whose undo also can't reach
      // outside a library. This check applies regardless of how the drop
      // target's own droppable/disabled state was computed, so it still
      // catches any future drop-target type that doesn't yet gate itself.
      if (!findLibraryForPath(destDir, libraries ?? [])) return

      const selectedPaths = useSelectionStore.getState().selectedPaths
      const draggedPaths = selectedPaths.has(activeData.entry.path)
        ? Array.from(selectedPaths)
        : [activeData.entry.path]
      // Per-item, not "destDir === activeTab?.path": in search mode a
      // dragged entry's own parent can differ from the tab's own path (it's
      // a recursive-search result from a subfolder), so that blanket check
      // silently discarded legitimate "move it up here" drops with no
      // feedback at all. Filtering by each item's real current parent
      // subsumes the old check's correct behavior for normal-mode rows too
      // (whose parent always equals activeTab.path anyway). Normalized the
      // same way findLibraryForPath just normalized destDir above - a
      // draggable's own path always comes from the scanner (native
      // backslashes), but destDir can come from a tab's path, which isn't
      // guaranteed to use the same separator/casing (e.g. a persisted tab
      // path with forward slashes) - an un-normalized comparison here could
      // then treat "drop it back into its own folder" as a real move.
      const normalizePath = (p: string): string => p.toLowerCase().replace(/\\/g, '/')
      const pathsToMove = draggedPaths.filter(
        (p) => normalizePath(getParentPath(p)) !== normalizePath(destDir)
      )
      if (pathsToMove.length === 0) return
      // Dragging a multi-selection that happens to include the drop target
      // itself (e.g. selecting two folders and dropping one onto the
      // other) - the active.id === over.id guard above only catches the
      // exact dragged row, not other selected items. Normalized for the
      // same reason as the filter above.
      if (pathsToMove.some((p) => normalizePath(p) === normalizePath(destDir))) return

      moveEntries.mutate(
        { paths: pathsToMove, destDir },
        // Matches every other batch action (SelectionToolbar.tsx's
        // closeDialog after rename/move/delete) - without this the
        // toolbar keeps reporting the old selection count after a
        // drag-drop move, even though the moved paths no longer exist at
        // their old location. Safe as a plain call-site callback since
        // ExplorerPage doesn't unmount as a result of this mutation.
        { onSuccess: () => useSelectionStore.getState().deactivate() }
      )
    }
  }

  return (
    <DndContext
      sensors={sensors}
      // Not closestCenter/closestCorners - both would resolve a drop to the
      // nearest droppable even when the pointer isn't over it, silently
      // relocating a file dropped on a disabled (file-kind) row into
      // whichever folder row happens to be geometrically nearest. Only
      // pointerWithin requires the pointer to actually be inside the target
      // droppable's rect, which is the right semantic for a destructive
      // move - don't swap this back for tab-reorder's sake, TabBar's own
      // SortableContext still reorders correctly under it.
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className="flex h-full flex-col">
        <TabBar />
        {activeTab ? (
          <FolderView
            key={activeTab.id}
            tabId={activeTab.id}
            path={activeTab.path}
            onNavigate={(path) => navigateTab(activeTab.id, path)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t('explorer.noOpenTabs')}
          </div>
        )}
      </div>
      <DragOverlay>
        {activeDrag?.data.type === 'entry' && (
          <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-lg">
            {activeDrag.count > 1
              ? t('explorer.dragCount', { count: activeDrag.count })
              : activeDrag.data.entry.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
```

Apply this one targeted change (everything else in the file is unchanged) — add a `setViewMode` selector, and pass `viewMode`/`onViewModeChange` to `<FolderView>`:

```tsx
  const navigateTab = useExplorerStore((s) => s.navigateTab)
  const reorderTabs = useExplorerStore((s) => s.reorderTabs)
  const setViewMode = useExplorerStore((s) => s.setViewMode)
```

(add `setViewMode` right after the existing `reorderTabs` line), and:

```tsx
          <FolderView
            key={activeTab.id}
            tabId={activeTab.id}
            path={activeTab.path}
            viewMode={activeTab.viewMode}
            onNavigate={(path) => navigateTab(activeTab.id, path)}
            onViewModeChange={(mode) => setViewMode(activeTab.id, mode)}
          />
```

(replacing the current `<FolderView key={...} tabId={...} path={...} onNavigate={...} />` block).

- [ ] **Step 4: Replace `FolderView.tsx`**

Current file (as left by the drag-and-drop-move sub-project — full content):

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Music } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ContextMenu, ContextMenuTrigger } from '../../components/ui/context-menu'
import { pathToBreadcrumbSegments, type BreadcrumbSegment } from './breadcrumb'
import { useExplorerStore } from '../../stores/explorerStore'
import { GameThumbnail } from '../../components/game/GameThumbnail'
import { FileKindIcon } from '../../components/game/FileKindIcon'
import { GameEntryContextMenu } from '../../components/game/GameEntryContextMenu'
import { useFolderScan, useFolderScanRecursive } from '../../services/scannerService'
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
import { useEntryActionDialogs } from '../../hooks/useEntryActionDialogs'
import { useScanProgress } from '../../hooks/useScanProgress'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { isMediaFile } from '../../../shared/isMediaFile'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { ScanProgressIndicator } from '../../components/layout/ScanProgressIndicator'
import { Skeleton } from '../../components/ui/skeleton'
import { filterEntries } from '../../lib/filterEntries'
import { useGameMetadataMany } from '../../services/metadataService'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { relativePath } from './relativePath'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'
import { SelectionCheckbox } from '../../components/game/SelectionCheckbox'
import { SelectionToolbar } from '../../components/layout/SelectionToolbar'
import { useLongPress } from '../../hooks/useLongPress'
import { useSelectionStore } from '../../stores/selectionStore'
import { useLibraries } from '../../services/librariesService'
import { findLibraryForPath } from '../../lib/findLibraryForPath'
import type { ExplorerDragData, ExplorerDropData } from './dragTypes'

interface FolderViewProps {
  tabId: string
  path: string
  onNavigate: (path: string) => void
}

// Every row gets exactly one icon now, where before only coded/media entries
// did: a code-linked entry shows its game thumbnail with the folder/
// archive/file kind as a small badge (matching GameRow's badge treatment in
// ListPage.tsx exactly), a media file with no code shows a Music icon so it
// still reads as "playable", and everything else - the majority of what
// Explorer actually browses - falls back to FileKindIcon instead of no icon
// at all.
function EntryIcon({ entry }: { entry: ScannedEntry }) {
  if (entry.code) {
    return (
      <motion.div
        whileHover={{ scale: 1.08 }}
        transition={{ duration: 0.15 }}
        className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-muted"
      >
        <GameThumbnail entry={entry} />
        <div className="absolute bottom-0.5 right-0.5 rounded-full bg-background/70 p-0.5 text-muted-foreground">
          <FileKindIcon kind={entry.kind} name={entry.name} className="h-3 w-3" />
        </div>
      </motion.div>
    )
  }
  if (entry.kind === 'file' && isMediaFile(entry.name)) {
    return (
      <motion.div whileHover={{ scale: 1.08 }} transition={{ duration: 0.15 }} className="shrink-0">
        <Music className="h-4 w-4 text-muted-foreground" />
      </motion.div>
    )
  }
  return (
    <motion.div whileHover={{ scale: 1.08 }} transition={{ duration: 0.15 }} className="shrink-0">
      <FileKindIcon
        kind={entry.kind}
        name={entry.name}
        className={`h-4 w-4 ${entry.kind === 'folder' ? 'text-yellow-500' : 'text-muted-foreground'}`}
      />
    </motion.div>
  )
}

// Every row is a drag source (files and folders alike can be moved), but
// only a folder is a valid drop target - useDroppable is still always
// called (hooks can't be conditional) with `disabled` doing the actual
// gating, matching dnd-kit's own documented pattern for this. The
// draggable and droppable registrations share the same `id` (entry.path) -
// safe, since dnd-kit keeps them in separate registries - which is what
// makes "dropped a folder onto itself" fall out of ExplorerPage.tsx's
// existing `active.id === over.id` guard for free, no extra check needed.
function useEntryDragAndDrop(entry: ScannedEntry) {
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableNodeRef,
  } = useDraggable({
    id: entry.path,
    data: { type: 'entry', entry } satisfies ExplorerDragData,
  })
  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
    id: entry.path,
    disabled: entry.kind !== 'folder',
    data: { type: 'folder-entry', path: entry.path } satisfies ExplorerDropData,
  })
  const setNodeRef = useCallback(
    (node: HTMLElement | null): void => {
      setDraggableNodeRef(node)
      setDroppableNodeRef(node)
    },
    [setDraggableNodeRef, setDroppableNodeRef]
  )
  return { attributes, listeners, setNodeRef, isOver }
}

function FolderEntryRow({
  entry,
  onOpenInNewTab,
  onEntryClick,
  onOpenDetail,
  onRename,
  onMove,
  onDelete,
}: {
  entry: ScannedEntry
  onOpenInNewTab: (entry: ScannedEntry) => void
  onEntryClick: (entry: ScannedEntry) => void
  onOpenDetail: (entry: ScannedEntry) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}) {
  const activateSelection = useSelectionStore((s) => s.activate)
  const { handlers: longPressHandlers, consumeLongPressClick } = useLongPress(() =>
    activateSelection(entry.path)
  )
  const { attributes, listeners, setNodeRef, isOver } = useEntryDragAndDrop(entry)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          ref={setNodeRef}
          {...attributes}
          {...longPressHandlers}
          onPointerDown={(event) => {
            // Composed manually, not via a second {...listeners} spread -
            // dnd-kit's PointerSensor listener is ALSO onPointerDown, and a
            // later spread would silently replace useLongPress's handler
            // instead of both firing. PointerSensor itself only ever binds
            // onPointerDown (confirmed against its own type defs) - it
            // tracks move/up via its own document-level listeners once
            // pointerdown fires, so no other handler needs composing here.
            longPressHandlers.onPointerDown(event)
            listeners?.onPointerDown?.(event)
          }}
          className={`flex h-10 shrink-0 cursor-pointer items-center gap-3 px-4 text-sm transition-colors hover:bg-accent ${
            isOver ? 'bg-accent ring-1 ring-inset ring-primary' : ''
          }`}
          onClick={() => {
            if (consumeLongPressClick()) return
            onEntryClick(entry)
          }}
        >
          <SelectionCheckbox path={entry.path} className="h-4 w-4 shrink-0 rounded-sm" />
          <EntryIcon entry={entry} />
          <span className="truncate">{entry.name}</span>
        </li>
      </ContextMenuTrigger>
      <GameEntryContextMenu
        entry={entry}
        onOpenDetail={onOpenDetail}
        onOpenInNewTab={onOpenInNewTab}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
      />
    </ContextMenu>
  )
}

function SearchResultRow({
  entry,
  onOpenDetail,
  path,
}: {
  entry: ScannedEntry
  onOpenDetail: (entry: ScannedEntry) => void
  path: string
}) {
  const activateSelection = useSelectionStore((s) => s.activate)
  const { handlers: longPressHandlers, consumeLongPressClick } = useLongPress(() =>
    activateSelection(entry.path)
  )
  const { attributes, listeners, setNodeRef, isOver } = useEntryDragAndDrop(entry)

  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...longPressHandlers}
      onPointerDown={(event) => {
        longPressHandlers.onPointerDown(event)
        listeners?.onPointerDown?.(event)
      }}
      className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent ${
        isOver ? 'bg-accent ring-1 ring-inset ring-primary' : ''
      }`}
      onClick={() => {
        if (consumeLongPressClick()) return
        onOpenDetail(entry)
      }}
    >
      <SelectionCheckbox path={entry.path} className="h-4 w-4 shrink-0 rounded-sm" />
      <EntryIcon entry={entry} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate">{entry.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {relativePath(path, entry.path)}
        </span>
      </div>
    </li>
  )
}

function BreadcrumbSegmentButton({
  segment,
  onNavigate,
}: {
  segment: BreadcrumbSegment
  onNavigate: (path: string) => void
}) {
  const { data: libraries } = useLibraries()
  const { setNodeRef, isOver } = useDroppable({
    id: segment.path,
    disabled: !findLibraryForPath(segment.path, libraries ?? []),
    data: { type: 'breadcrumb', path: segment.path } satisfies ExplorerDropData,
  })
  return (
    <button
      ref={setNodeRef}
      className={`rounded px-1 hover:text-foreground hover:underline ${
        isOver ? 'bg-accent text-foreground' : ''
      }`}
      onClick={() => onNavigate(segment.path)}
    >
      {segment.label}
    </button>
  )
}

export function FolderView({ tabId, path, onNavigate }: FolderViewProps) {
  const { t } = useTranslation()
  const addTab = useExplorerStore((s) => s.addTab)
  const breadcrumbs = pathToBreadcrumbSegments(path)

  // useFolderScan's queryKey includes `path`, so React Query automatically
  // re-fetches when it changes - ExplorerPage keys FolderView only on the
  // active tab's id, not its path, so navigating into a subfolder (or via
  // breadcrumb) updates `path` without unmounting this component.
  const [searchQuery, setSearchQuery] = useState('')
  const [includedGenres, setIncludedGenres] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const isSearching = searchQuery !== ''

  // Root is wherever the user is currently browsing within this tab (the
  // breadcrumb position), not the tab's original opening path - matches the
  // "search from here down" expectation.
  const { data: shallowEntries = [], isError } = useFolderScan(path)
  const {
    data: recursiveEntries = [],
    isLoading: isSearchLoading,
    isError: isSearchError,
  } = useFolderScanRecursive(path, { enabled: isSearching })
  const scanProgress = useScanProgress(isSearching && isSearchLoading)

  const { openDetail, detailOverlayElement } = useGameDetailOverlay([
    ...shallowEntries,
    ...recursiveEntries,
  ])
  const { dialogElement, openRename, openMove, openDelete } = useEntryActionDialogs()

  const codes = recursiveEntries.flatMap((e) => (e.code ? [e.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

  const searchResults = isSearching
    ? filterEntries(recursiveEntries, metadataByCode, searchQuery, includedGenres, excludedGenres)
    : []

  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('explorer')

  const sortedSearchResults = sortEntries(searchResults, sortField, sortDirection)

  // useSelectionStore is a single global store shared with Gallery/List/
  // DetailList (see its own comment) - Explorer is the only one of those
  // that navigates between different entry sets while staying mounted
  // (breadcrumb clicks and drilling into subfolders change `path` without
  // unmounting FolderView, same as the comment above on useFolderScan).
  // Without this, a selection made in one folder would still report as
  // "N selected" in SelectionToolbar after navigating to a completely
  // different folder, with no visible checked rows to explain it - the same
  // externally-visible state-leak shape as the rename dialog bug fixed
  // earlier (component-external state not scoped to what's on screen).
  // This is a plain useEffect, not the render-time compare-and-setState
  // pattern used elsewhere in this app for resetting a component's OWN
  // React state (e.g. DetailSidebar.tsx's syncedGamePath) - deactivate()
  // here calls an external Zustand store, not this component's own
  // setState, which is exactly the side-effect-on-a-dependency-change case
  // useEffect exists for. It runs on every path change AND on mount (i.e.
  // every tab switch, since FolderView remounts via its own key in
  // ExplorerPage.tsx), covering both ways a user can end up looking at a
  // different set of entries than the one they selected from.
  useEffect(() => {
    useSelectionStore.getState().deactivate()
  }, [path])

  const selectionTargets = isSearching ? sortedSearchResults : shallowEntries

  const openInNewTab = (entry: ScannedEntry): void => {
    addTab({ label: entry.name, path: entry.path })
  }

  const playNow = useMediaPlayerStore((s) => s.playNow)

  // A video/audio file plays instead, regardless of whether it happens to
  // have a code - there's no useful DLsite detail for a media file, and
  // every other media file currently listed in this same folder becomes the
  // playlist (in on-screen order) so next/prev walk through them.
  // Folders always navigate into them on click, whether or not they carry a
  // recognized code - a coded folder (e.g. a DLsite RJ folder) is still a
  // folder a user needs to browse into (saves, screenshots, manually
  // launching something inside), and detail info remains one right-click
  // away via GameEntryContextMenu's own onOpenDetail item. Only non-folder
  // entries (files) open the detail overlay, and only when they're not a
  // media file (which plays instead).
  const handleEntryClick = (entry: ScannedEntry): void => {
    if (entry.kind === 'file' && isMediaFile(entry.name)) {
      const siblings = shallowEntries
        .filter((e) => e.kind === 'file' && isMediaFile(e.name))
        .map((e) => ({ path: e.path, name: e.name }))
      playNow({ path: entry.path, name: entry.name }, siblings)
      return
    }
    if (entry.kind === 'folder') {
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
            <BreadcrumbSegmentButton segment={segment} onNavigate={onNavigate} />
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <SearchHeader
          query={searchQuery}
          onQueryChange={setSearchQuery}
          includedGenres={includedGenres}
          excludedGenres={excludedGenres}
          onGenreFiltersChange={(nextIncluded, nextExcluded) => {
            setIncludedGenres(nextIncluded)
            setExcludedGenres(nextExcluded)
          }}
        />
        <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
        <SelectionToolbar allEntries={selectionTargets} />
      </div>
      {isSearching ? (
        isSearchLoading ? (
          <div className="flex flex-1 flex-col">
            <div className="flex flex-col gap-1 overflow-auto p-4">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
            <ScanProgressIndicator scanned={scanProgress} />
          </div>
        ) : isSearchError ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t('dlsiteSearch.searchError')}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.ul
              key={path}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 divide-y divide-border overflow-auto"
            >
              {sortedSearchResults.map((entry) => (
                <SearchResultRow
                  key={entry.path}
                  entry={entry}
                  onOpenDetail={openDetail}
                  path={path}
                />
              ))}
              {sortedSearchResults.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t('dlsiteSearch.noResults')}
                </li>
              )}
            </motion.ul>
          </AnimatePresence>
        )
      ) : isError ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t('explorer.cannotAccessFolder')}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.ul
            key={path}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex-1 divide-y divide-border overflow-auto"
          >
            {sortEntries(shallowEntries, sortField, sortDirection).map((entry) => (
              <FolderEntryRow
                key={entry.path}
                entry={entry}
                onOpenInNewTab={openInNewTab}
                onEntryClick={handleEntryClick}
                onOpenDetail={openDetail}
                onRename={openRename}
                onMove={openMove}
                onDelete={openDelete}
              />
            ))}
          </motion.ul>
        </AnimatePresence>
      )}
      {detailOverlayElement}
      {dialogElement}
    </div>
  )
}
```

Replace with (adds `viewMode`/`onViewModeChange` props, a `FolderEntryCard` grid-card component reusing `EntryIcon`/`SelectionCheckbox`/`useEntryDragAndDrop` exactly as `FolderEntryRow` does, `react-window` `Grid`+`AutoSizer` imports mirroring `GalleryPage.tsx`'s own usage, and branches the normal-browsing (non-search, non-error) render between the existing list `<ul>` and a new grid — every other line, including all existing comments, `EntryIcon`, `useEntryDragAndDrop`, `FolderEntryRow`, `SearchResultRow`, `BreadcrumbSegmentButton`, and the search/error branches, is unchanged):

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Music } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Grid, type CellComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { ContextMenu, ContextMenuTrigger } from '../../components/ui/context-menu'
import { pathToBreadcrumbSegments, type BreadcrumbSegment } from './breadcrumb'
import { useExplorerStore } from '../../stores/explorerStore'
import { GameThumbnail } from '../../components/game/GameThumbnail'
import { FileKindIcon } from '../../components/game/FileKindIcon'
import { GameEntryContextMenu } from '../../components/game/GameEntryContextMenu'
import { useFolderScan, useFolderScanRecursive } from '../../services/scannerService'
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
import { useEntryActionDialogs } from '../../hooks/useEntryActionDialogs'
import { useScanProgress } from '../../hooks/useScanProgress'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { isMediaFile } from '../../../shared/isMediaFile'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { ScanProgressIndicator } from '../../components/layout/ScanProgressIndicator'
import { Skeleton } from '../../components/ui/skeleton'
import { filterEntries } from '../../lib/filterEntries'
import { useGameMetadataMany } from '../../services/metadataService'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { relativePath } from './relativePath'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'
import { SelectionCheckbox } from '../../components/game/SelectionCheckbox'
import { SelectionToolbar } from '../../components/layout/SelectionToolbar'
import { useLongPress } from '../../hooks/useLongPress'
import { useSelectionStore } from '../../stores/selectionStore'
import { useLibraries } from '../../services/librariesService'
import { findLibraryForPath } from '../../lib/findLibraryForPath'
import type { ExplorerDragData, ExplorerDropData } from './dragTypes'

interface FolderViewProps {
  tabId: string
  path: string
  viewMode: 'list' | 'grid'
  onNavigate: (path: string) => void
  onViewModeChange: (mode: 'list' | 'grid') => void
}

// Every row gets exactly one icon now, where before only coded/media entries
// did: a code-linked entry shows its game thumbnail with the folder/
// archive/file kind as a small badge (matching GameRow's badge treatment in
// ListPage.tsx exactly), a media file with no code shows a Music icon so it
// still reads as "playable", and everything else - the majority of what
// Explorer actually browses - falls back to FileKindIcon instead of no icon
// at all.
function EntryIcon({ entry }: { entry: ScannedEntry }) {
  if (entry.code) {
    return (
      <motion.div
        whileHover={{ scale: 1.08 }}
        transition={{ duration: 0.15 }}
        className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-muted"
      >
        <GameThumbnail entry={entry} />
        <div className="absolute bottom-0.5 right-0.5 rounded-full bg-background/70 p-0.5 text-muted-foreground">
          <FileKindIcon kind={entry.kind} name={entry.name} className="h-3 w-3" />
        </div>
      </motion.div>
    )
  }
  if (entry.kind === 'file' && isMediaFile(entry.name)) {
    return (
      <motion.div whileHover={{ scale: 1.08 }} transition={{ duration: 0.15 }} className="shrink-0">
        <Music className="h-4 w-4 text-muted-foreground" />
      </motion.div>
    )
  }
  return (
    <motion.div whileHover={{ scale: 1.08 }} transition={{ duration: 0.15 }} className="shrink-0">
      <FileKindIcon
        kind={entry.kind}
        name={entry.name}
        className={`h-4 w-4 ${entry.kind === 'folder' ? 'text-yellow-500' : 'text-muted-foreground'}`}
      />
    </motion.div>
  )
}

// Every row is a drag source (files and folders alike can be moved), but
// only a folder is a valid drop target - useDroppable is still always
// called (hooks can't be conditional) with `disabled` doing the actual
// gating, matching dnd-kit's own documented pattern for this. The
// draggable and droppable registrations share the same `id` (entry.path) -
// safe, since dnd-kit keeps them in separate registries - which is what
// makes "dropped a folder onto itself" fall out of ExplorerPage.tsx's
// existing `active.id === over.id` guard for free, no extra check needed.
function useEntryDragAndDrop(entry: ScannedEntry) {
  const { attributes, listeners, setNodeRef: setDraggableNodeRef } = useDraggable({
    id: entry.path,
    data: { type: 'entry', entry } satisfies ExplorerDragData,
  })
  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
    id: entry.path,
    disabled: entry.kind !== 'folder',
    data: { type: 'folder-entry', path: entry.path } satisfies ExplorerDropData,
  })
  const setNodeRef = useCallback(
    (node: HTMLElement | null): void => {
      setDraggableNodeRef(node)
      setDroppableNodeRef(node)
    },
    [setDraggableNodeRef, setDroppableNodeRef]
  )
  return { attributes, listeners, setNodeRef, isOver }
}

function FolderEntryRow({
  entry,
  onOpenInNewTab,
  onEntryClick,
  onOpenDetail,
  onRename,
  onMove,
  onDelete,
}: {
  entry: ScannedEntry
  onOpenInNewTab: (entry: ScannedEntry) => void
  onEntryClick: (entry: ScannedEntry) => void
  onOpenDetail: (entry: ScannedEntry) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}) {
  const activateSelection = useSelectionStore((s) => s.activate)
  const { handlers: longPressHandlers, consumeLongPressClick } = useLongPress(() =>
    activateSelection(entry.path)
  )
  const { attributes, listeners, setNodeRef, isOver } = useEntryDragAndDrop(entry)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          ref={setNodeRef}
          {...attributes}
          {...longPressHandlers}
          onPointerDown={(event) => {
            // Composed manually, not via a second {...listeners} spread -
            // dnd-kit's PointerSensor listener is ALSO onPointerDown, and a
            // later spread would silently replace useLongPress's handler
            // instead of both firing. PointerSensor itself only ever binds
            // onPointerDown (confirmed against its own type defs) - it
            // tracks move/up via its own document-level listeners once
            // pointerdown fires, so no other handler needs composing here.
            longPressHandlers.onPointerDown(event)
            listeners?.onPointerDown?.(event)
          }}
          className={`flex h-10 shrink-0 cursor-pointer items-center gap-3 px-4 text-sm transition-colors hover:bg-accent ${
            isOver ? 'bg-accent ring-1 ring-inset ring-primary' : ''
          }`}
          onClick={() => {
            if (consumeLongPressClick()) return
            onEntryClick(entry)
          }}
        >
          <SelectionCheckbox path={entry.path} className="h-4 w-4 shrink-0 rounded-sm" />
          <EntryIcon entry={entry} />
          <span className="truncate">{entry.name}</span>
        </li>
      </ContextMenuTrigger>
      <GameEntryContextMenu
        entry={entry}
        onOpenDetail={onOpenDetail}
        onOpenInNewTab={onOpenInNewTab}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
      />
    </ContextMenu>
  )
}

// The grid's card equivalent of FolderEntryRow - same selection/drag/click
// wiring (this app's established Row/Card duplication convention, see
// ListPage.tsx's GameRow vs GalleryPage.tsx's GameCard: two structurally
// parallel components, not one shared hook), different layout. Kept at
// Explorer's established "light" density (no favorite/rating/playtime/
// genre badges, unlike GalleryPage's own GameCard) - just a large icon,
// the name, and a code line if one exists.
function FolderEntryCard({
  entry,
  cardWidth,
  onOpenInNewTab,
  onEntryClick,
  onOpenDetail,
  onRename,
  onMove,
  onDelete,
}: {
  entry: ScannedEntry
  cardWidth: number
  onOpenInNewTab: (entry: ScannedEntry) => void
  onEntryClick: (entry: ScannedEntry) => void
  onOpenDetail: (entry: ScannedEntry) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}) {
  const activateSelection = useSelectionStore((s) => s.activate)
  const { handlers: longPressHandlers, consumeLongPressClick } = useLongPress(() =>
    activateSelection(entry.path)
  )
  const { attributes, listeners, setNodeRef, isOver } = useEntryDragAndDrop(entry)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          ref={setNodeRef}
          {...attributes}
          {...longPressHandlers}
          onPointerDown={(event) => {
            longPressHandlers.onPointerDown(event)
            listeners?.onPointerDown?.(event)
          }}
          whileHover={{ scale: 1.03 }}
          transition={{ duration: 0.15 }}
          style={{ width: cardWidth }}
          className={`relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-md border border-border bg-card ${
            isOver ? 'ring-1 ring-inset ring-primary' : ''
          }`}
          onClick={() => {
            if (consumeLongPressClick()) return
            onEntryClick(entry)
          }}
        >
          <SelectionCheckbox
            path={entry.path}
            className="absolute left-2 top-2 z-10 h-4 w-4 rounded-sm"
          />
          <div className="flex aspect-[3/4] w-full items-center justify-center bg-muted">
            {entry.code ? (
              <GameThumbnail entry={entry} />
            ) : entry.kind === 'file' && isMediaFile(entry.name) ? (
              <Music className="h-10 w-10 text-muted-foreground" />
            ) : (
              <FileKindIcon
                kind={entry.kind}
                name={entry.name}
                className={`h-10 w-10 ${entry.kind === 'folder' ? 'text-yellow-500' : 'text-muted-foreground'}`}
              />
            )}
          </div>
          <div className="flex flex-col gap-0.5 p-2">
            <p className="line-clamp-2 break-words text-sm font-medium">{entry.name}</p>
            {entry.code && (
              <p className="truncate text-xs text-muted-foreground">{entry.code.value}</p>
            )}
          </div>
        </motion.div>
      </ContextMenuTrigger>
      <GameEntryContextMenu
        entry={entry}
        onOpenDetail={onOpenDetail}
        onOpenInNewTab={onOpenInNewTab}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
      />
    </ContextMenu>
  )
}

function SearchResultRow({
  entry,
  onOpenDetail,
  path,
}: {
  entry: ScannedEntry
  onOpenDetail: (entry: ScannedEntry) => void
  path: string
}) {
  const activateSelection = useSelectionStore((s) => s.activate)
  const { handlers: longPressHandlers, consumeLongPressClick } = useLongPress(() =>
    activateSelection(entry.path)
  )
  const { attributes, listeners, setNodeRef, isOver } = useEntryDragAndDrop(entry)

  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...longPressHandlers}
      onPointerDown={(event) => {
        longPressHandlers.onPointerDown(event)
        listeners?.onPointerDown?.(event)
      }}
      className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent ${
        isOver ? 'bg-accent ring-1 ring-inset ring-primary' : ''
      }`}
      onClick={() => {
        if (consumeLongPressClick()) return
        onOpenDetail(entry)
      }}
    >
      <SelectionCheckbox path={entry.path} className="h-4 w-4 shrink-0 rounded-sm" />
      <EntryIcon entry={entry} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate">{entry.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {relativePath(path, entry.path)}
        </span>
      </div>
    </li>
  )
}

function BreadcrumbSegmentButton({
  segment,
  onNavigate,
}: {
  segment: BreadcrumbSegment
  onNavigate: (path: string) => void
}) {
  const { data: libraries } = useLibraries()
  const { setNodeRef, isOver } = useDroppable({
    id: segment.path,
    disabled: !findLibraryForPath(segment.path, libraries ?? []),
    data: { type: 'breadcrumb', path: segment.path } satisfies ExplorerDropData,
  })
  return (
    <button
      ref={setNodeRef}
      className={`rounded px-1 hover:text-foreground hover:underline ${
        isOver ? 'bg-accent text-foreground' : ''
      }`}
      onClick={() => onNavigate(segment.path)}
    >
      {segment.label}
    </button>
  )
}

const CARD_WIDTH = 180
const GAP = 16
const SCROLLBAR_GUTTER = 17
// Just a 2-line name + a single code line, no genre/rating/playtime rows
// like GalleryPage's own card - matches Explorer's established "light"
// density (the visual-polish sub-project's EntryIcon decision).
const CARD_TEXT_BLOCK_HEIGHT = 16 + 36 + 4 + 16 // p-2 top/bottom + 2-line name + gap + code line

function computeCardHeight(cardWidth: number): number {
  return cardWidth * (4 / 3) + CARD_TEXT_BLOCK_HEIGHT
}

const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.8

interface GridCellProps {
  entries: ScannedEntry[]
  columnCount: number
  gap: number
  cardWidth: number
  onOpenInNewTab: (entry: ScannedEntry) => void
  onEntryClick: (entry: ScannedEntry) => void
  onOpenDetail: (entry: ScannedEntry) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}

function FolderEntryCell({
  columnIndex,
  rowIndex,
  style,
  entries,
  columnCount,
  gap,
  cardWidth,
  onOpenInNewTab,
  onEntryClick,
  onOpenDetail,
  onRename,
  onMove,
  onDelete,
}: CellComponentProps<GridCellProps>) {
  const index = rowIndex * columnCount + columnIndex
  const entry = entries[index]
  if (!entry) return null
  return (
    <div style={{ ...style, padding: gap / 2, display: 'flex', justifyContent: 'center' }}>
      <FolderEntryCard
        entry={entry}
        cardWidth={cardWidth}
        onOpenInNewTab={onOpenInNewTab}
        onEntryClick={onEntryClick}
        onOpenDetail={onOpenDetail}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
      />
    </div>
  )
}

export function FolderView({ tabId, path, viewMode, onNavigate, onViewModeChange }: FolderViewProps) {
  const { t } = useTranslation()
  const addTab = useExplorerStore((s) => s.addTab)
  const breadcrumbs = pathToBreadcrumbSegments(path)
  const [zoom, setZoom] = useState(1)

  // useFolderScan's queryKey includes `path`, so React Query automatically
  // re-fetches when it changes - ExplorerPage keys FolderView only on the
  // active tab's id, not its path, so navigating into a subfolder (or via
  // breadcrumb) updates `path` without unmounting this component.
  const [searchQuery, setSearchQuery] = useState('')
  const [includedGenres, setIncludedGenres] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const isSearching = searchQuery !== ''

  // Root is wherever the user is currently browsing within this tab (the
  // breadcrumb position), not the tab's original opening path - matches the
  // "search from here down" expectation.
  const { data: shallowEntries = [], isError } = useFolderScan(path)
  const {
    data: recursiveEntries = [],
    isLoading: isSearchLoading,
    isError: isSearchError,
  } = useFolderScanRecursive(path, { enabled: isSearching })
  const scanProgress = useScanProgress(isSearching && isSearchLoading)

  const { openDetail, detailOverlayElement } = useGameDetailOverlay([
    ...shallowEntries,
    ...recursiveEntries,
  ])
  const { dialogElement, openRename, openMove, openDelete } = useEntryActionDialogs()

  const codes = recursiveEntries.flatMap((e) => (e.code ? [e.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

  const searchResults = isSearching
    ? filterEntries(recursiveEntries, metadataByCode, searchQuery, includedGenres, excludedGenres)
    : []

  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('explorer')

  const sortedSearchResults = sortEntries(searchResults, sortField, sortDirection)

  // useSelectionStore is a single global store shared with Gallery/List/
  // DetailList (see its own comment) - Explorer is the only one of those
  // that navigates between different entry sets while staying mounted
  // (breadcrumb clicks and drilling into subfolders change `path` without
  // unmounting FolderView, same as the comment above on useFolderScan).
  // Without this, a selection made in one folder would still report as
  // "N selected" in SelectionToolbar after navigating to a completely
  // different folder, with no visible checked rows to explain it - the same
  // externally-visible state-leak shape as the rename dialog bug fixed
  // earlier (component-external state not scoped to what's on screen).
  // This is a plain useEffect, not the render-time compare-and-setState
  // pattern used elsewhere in this app for resetting a component's OWN
  // React state (e.g. DetailSidebar.tsx's syncedGamePath) - deactivate()
  // here calls an external Zustand store, not this component's own
  // setState, which is exactly the side-effect-on-a-dependency-change case
  // useEffect exists for. It runs on every path change AND on mount (i.e.
  // every tab switch, since FolderView remounts via its own key in
  // ExplorerPage.tsx), covering both ways a user can end up looking at a
  // different set of entries than the one they selected from.
  useEffect(() => {
    useSelectionStore.getState().deactivate()
  }, [path])

  const selectionTargets = isSearching ? sortedSearchResults : shallowEntries

  const openInNewTab = (entry: ScannedEntry): void => {
    addTab({ label: entry.name, path: entry.path })
  }

  const playNow = useMediaPlayerStore((s) => s.playNow)

  // A video/audio file plays instead, regardless of whether it happens to
  // have a code - there's no useful DLsite detail for a media file, and
  // every other media file currently listed in this same folder becomes the
  // playlist (in on-screen order) so next/prev walk through them.
  // Folders always navigate into them on click, whether or not they carry a
  // recognized code - a coded folder (e.g. a DLsite RJ folder) is still a
  // folder a user needs to browse into (saves, screenshots, manually
  // launching something inside), and detail info remains one right-click
  // away via GameEntryContextMenu's own onOpenDetail item. Only non-folder
  // entries (files) open the detail overlay, and only when they're not a
  // media file (which plays instead).
  const handleEntryClick = (entry: ScannedEntry): void => {
    if (entry.kind === 'file' && isMediaFile(entry.name)) {
      const siblings = shallowEntries
        .filter((e) => e.kind === 'file' && isMediaFile(e.name))
        .map((e) => ({ path: e.path, name: e.name }))
      playNow({ path: entry.path, name: entry.name }, siblings)
      return
    }
    if (entry.kind === 'folder') {
      onNavigate(entry.path)
    } else {
      openDetail(entry)
    }
  }

  const sortedShallowEntries = sortEntries(shallowEntries, sortField, sortDirection)

  return (
    <div className="flex h-full flex-col" data-tab-id={tabId}>
      <div className="flex items-center gap-1 border-b border-border px-4 py-2 text-sm text-muted-foreground">
        {breadcrumbs.map((segment, index) => (
          <span key={segment.path} className="flex items-center gap-1">
            {index > 0 && <span>/</span>}
            <BreadcrumbSegmentButton segment={segment} onNavigate={onNavigate} />
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <SearchHeader
          query={searchQuery}
          onQueryChange={setSearchQuery}
          includedGenres={includedGenres}
          excludedGenres={excludedGenres}
          onGenreFiltersChange={(nextIncluded, nextExcluded) => {
            setIncludedGenres(nextIncluded)
            setExcludedGenres(nextExcluded)
          }}
        />
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
        <SelectionToolbar allEntries={selectionTargets} />
      </div>
      {isSearching ? (
        isSearchLoading ? (
          <div className="flex flex-1 flex-col">
            <div className="flex flex-col gap-1 overflow-auto p-4">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
            <ScanProgressIndicator scanned={scanProgress} />
          </div>
        ) : isSearchError ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {t('dlsiteSearch.searchError')}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.ul
              key={path}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 divide-y divide-border overflow-auto"
            >
              {sortedSearchResults.map((entry) => (
                <SearchResultRow
                  key={entry.path}
                  entry={entry}
                  onOpenDetail={openDetail}
                  path={path}
                />
              ))}
              {sortedSearchResults.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t('dlsiteSearch.noResults')}
                </li>
              )}
            </motion.ul>
          </AnimatePresence>
        )
      ) : isError ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t('explorer.cannotAccessFolder')}
        </div>
      ) : viewMode === 'grid' ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={path}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="min-h-0 flex-1 p-4"
          >
            <AutoSizer
              style={{ height: '100%', width: '100%' }}
              renderProp={({ height, width }) => {
                if (height === undefined || width === undefined) return null
                const cardWidth = CARD_WIDTH * zoom
                const cardHeight = computeCardHeight(cardWidth)
                const gap = GAP * zoom
                // No scroll-anchor preservation across a columnCount change
                // here, unlike GalleryPage's own grid - that logic exists
                // there specifically to compensate for its resizable detail
                // SIDEBAR changing the grid's own width; Explorer's detail
                // view is an OVERLAY (useGameDetailOverlay), which never
                // changes FolderView's own width, so the one remaining
                // trigger (a plain window resize) is rare enough to accept
                // a lost scroll position on, matching Explorer's
                // established "light"/simpler-than-Gallery scope.
                const availableWidth = Math.max(0, width - SCROLLBAR_GUTTER)
                const columnCount = Math.max(1, Math.floor(availableWidth / (cardWidth + gap)))
                const usedWidth = columnCount * (cardWidth + gap)
                const extraPerColumn =
                  columnCount > 0 ? (availableWidth - usedWidth) / columnCount : 0
                const effectiveColumnWidth = cardWidth + gap + extraPerColumn
                const rowCount = Math.ceil(sortedShallowEntries.length / columnCount)

                return (
                  <Grid
                    cellComponent={FolderEntryCell}
                    cellProps={{
                      entries: sortedShallowEntries,
                      columnCount,
                      gap,
                      cardWidth,
                      onOpenInNewTab: openInNewTab,
                      onEntryClick: handleEntryClick,
                      onOpenDetail: openDetail,
                      onRename: openRename,
                      onMove: openMove,
                      onDelete: openDelete,
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
          </motion.div>
        </AnimatePresence>
      ) : (
        <AnimatePresence mode="wait">
          <motion.ul
            key={path}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex-1 divide-y divide-border overflow-auto"
          >
            {sortedShallowEntries.map((entry) => (
              <FolderEntryRow
                key={entry.path}
                entry={entry}
                onOpenInNewTab={openInNewTab}
                onEntryClick={handleEntryClick}
                onOpenDetail={openDetail}
                onRename={openRename}
                onMove={openMove}
                onDelete={openDelete}
              />
            ))}
          </motion.ul>
        </AnimatePresence>
      )}
      {detailOverlayElement}
      {dialogElement}
    </div>
  )
}
```

(`sortEntries(shallowEntries, sortField, sortDirection)` was previously computed inline at each of the two render sites where it was used - now factored into a single `sortedShallowEntries` local so both the new grid branch and the existing list branch use the exact same sorted array, rather than recomputing it twice.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no new errors. This step specifically catches any leftover call site still constructing a `<FolderView>` without the two new required props (there is only one call site, `ExplorerPage.tsx`, updated in Step 3).

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions (same count as after Task 1 — this task adds no new automated tests, per this plan's Global Constraints).

- [ ] **Step 7: Live-verify the grid end-to-end**

Run: `npm run dev`. In Explorer, with a folder containing a mix of plain subfolders, plain files, at least one code-linked entry, and a media file:

- Click the new toggle button in the toolbar - confirm the view switches from list to a grid of cards, and the icon flips (list icon while in grid, grid icon while in list).
- Confirm each card shows the right visual: a plain folder gets a large yellow folder icon, a plain file a large file icon, an archive a large archive icon, a code-linked entry its real cover thumbnail, a media file a large Music icon - and confirm the name (and code, if any) below each card is readable and correctly truncated/clamped.
- Confirm the zoom slider appears only in grid mode (not in list mode) and actually resizes the cards when dragged.
- Confirm multi-select still works in grid mode exactly as in list mode: the toolbar's "선택" button and long-press both enter selection mode with checkboxes appearing on each card; select 2+ cards and run a batch rename/move/delete.
- Confirm drag-and-drop still works in grid mode: drag a card onto a folder card, a breadcrumb segment, and a different tab - each should still highlight and accept the drop exactly as list-mode rows do.
- Open a second Explorer tab, switch ONE of the two tabs to grid while leaving the other on list - confirm they're genuinely independent (switching tabs shows each one's own remembered mode), then restart the app (`npm run dev` again) and confirm both tabs still remember their own view mode after the restart.
- Run a search (any query that matches something) while in grid mode - confirm the results still render as a LIST, not a grid (per this task's explicit scope decision), and confirm exiting the search returns to whichever view mode the tab was actually in beforehand.
- No console errors in any of the above.

- [ ] **Step 8: Commit**

```bash
git add src/components/layout/PageToolbar.tsx src/i18n/translations.ts src/pages/Explorer/ExplorerPage.tsx src/pages/Explorer/FolderView.tsx
git commit -m "$(cat <<'EOF'
feat: add a grid view to Explorer

A per-tab toggle (list/grid) in the toolbar, reusing GalleryPage's
react-window Grid + AutoSizer pattern for the grid itself and a new
FolderEntryCard that shares the exact same EntryIcon/SelectionCheckbox/
drag-and-drop wiring FolderEntryRow already uses, so nothing a user
could do in list mode stops working after switching to grid. Kept at
Explorer's established light density (icon + name + code only, no
favorite/rating/playtime/genre badges GalleryPage's own card has).
Search results always stay list, regardless of the tab's view mode -
a compact grid card has no room for a search result's relative-path
context.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
