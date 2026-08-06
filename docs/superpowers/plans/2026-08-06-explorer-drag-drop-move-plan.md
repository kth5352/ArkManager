# Explorer Drag-and-Drop Move + Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user drag an Explorer row (or their current multi-selection) onto a folder row, breadcrumb segment, or tab to move it there, with a single-level Ctrl+Z undo that covers every move in the app, not just drag-and-drop ones.

**Architecture:** Task 1 builds the toast+undo layer independently, hooked at `useMoveEntries()`'s shared `onSuccess` — this makes it exercisable immediately against the *existing* right-click Move dialog, before any drag-and-drop code exists. Task 2 adds the actual drag-and-drop mechanics: **one** `DndContext` at `ExplorerPage` level (a deliberate correction from the design spec's "two nested contexts" — see the note at the top of Task 2), with every draggable/droppable tagged via a shared `type` field on its `data` so one `onDragEnd` can distinguish a tab being reordered from an entry being moved.

**Tech Stack:** React 19 + TypeScript strict, `@dnd-kit/core` + `@dnd-kit/sortable` (already dependencies, already used by `TabBar.tsx` for tab reordering), `sonner` (already a dependency, already mounted in `AppLayout.tsx`), Zustand, TanStack Query.

## Global Constraints

- No test infrastructure exists for this app's components/dialogs — drag/drop/toast/undo-button interaction is verified live via `npm run dev`, not with automated tests.
- The one exception: `groupMovesByOriginalParent`, a pure function, gets a real unit test.
- In-app only — no OS-boundary drag (out to the desktop, in from the OS file explorer). Confirmed with the user during brainstorming.
- Single-level undo only (the one most recent move) — no undo/redo history stack.
- `MoveDialog.tsx` and `SelectionToolbar.tsx` are not modified by this plan — the toast and undo both hang off `useMoveEntries()`'s shared mutation, not any specific UI entry point.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Toast feedback + Ctrl+Z undo for every move

**Files:**
- Create: `src/lib/groupMovesByOriginalParent.ts`
- Create: `src/lib/groupMovesByOriginalParent.test.ts`
- Create: `src/stores/lastMoveStore.ts`
- Modify: `src/services/fileOpsService.ts`
- Modify: `src/i18n/translations.ts`
- Modify: `src/components/layout/AppLayout.tsx`

**Interfaces:**
- Produces: `useLastMoveStore` (`src/stores/lastMoveStore.ts`) with `{ lastMove: {path, newPath}[] | null; setLastMove; clearLastMove }`; `groupMovesByOriginalParent(moves: {path, newPath}[]): {destDir: string, paths: string[]}[]` (`src/lib/groupMovesByOriginalParent.ts`); `performUndo(moveEntries: MoveEntriesMutation): void` and the exported `MoveEntriesMutation` type alias, both from `src/services/fileOpsService.ts` — Task 2 does not consume any of these directly (drag-and-drop calls the existing `useMoveEntries()` the same way `MoveDialog.tsx` always has), but this task's toast/undo behavior applies automatically to Task 2's drops once Task 2 lands, since both go through the same mutation.

- [ ] **Step 1: Write the failing test for `groupMovesByOriginalParent`**

Create `src/lib/groupMovesByOriginalParent.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupMovesByOriginalParent } from './groupMovesByOriginalParent'

describe('groupMovesByOriginalParent', () => {
  it('groups items that all came from the same folder into one group', () => {
    const result = groupMovesByOriginalParent([
      { path: 'D:\\games\\a.zip', newPath: 'D:\\archive\\a.zip' },
      { path: 'D:\\games\\b.zip', newPath: 'D:\\archive\\b.zip' },
    ])
    expect(result).toEqual([
      { destDir: 'D:\\games', paths: ['D:\\archive\\a.zip', 'D:\\archive\\b.zip'] },
    ])
  })

  it('splits a batch spanning different original folders into separate groups', () => {
    const result = groupMovesByOriginalParent([
      { path: 'D:\\games\\a.zip', newPath: 'D:\\archive\\a.zip' },
      { path: 'D:\\other\\b.zip', newPath: 'D:\\archive\\b.zip' },
    ])
    expect(result).toEqual([
      { destDir: 'D:\\games', paths: ['D:\\archive\\a.zip'] },
      { destDir: 'D:\\other', paths: ['D:\\archive\\b.zip'] },
    ])
  })

  it('reconstructs a drive-root parent with a trailing separator', () => {
    const result = groupMovesByOriginalParent([{ path: 'D:\\a.zip', newPath: 'D:\\sub\\a.zip' }])
    expect(result).toEqual([{ destDir: 'D:\\', paths: ['D:\\sub\\a.zip'] }])
  })

  it('returns an empty array for no moves', () => {
    expect(groupMovesByOriginalParent([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/groupMovesByOriginalParent.test.ts`
Expected: FAIL — `Cannot find module './groupMovesByOriginalParent'`.

- [ ] **Step 3: Implement `groupMovesByOriginalParent`**

Create `src/lib/groupMovesByOriginalParent.ts`:

```ts
export interface MovedPathPair {
  path: string
  newPath: string
}

export interface GroupedUndoMove {
  destDir: string
  paths: string[]
}

// Mirrors breadcrumb.ts's own drive-root handling (a bare "C:" is not the
// same location as its root "C:\\" to Windows filesystem APIs) - both
// normalize to forward slashes first so a mix of \ and / in the input never
// silently breaks the split.
function getParentPath(path: string): string {
  const parts = path
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
  parts.pop()
  if (parts.length === 1 && /^[A-Za-z]:$/.test(parts[0])) return `${parts[0]}\\`
  return parts.join('\\')
}

// Groups moved items by the parent directory they originally came from, so
// undo can move each group back to its own original location - usually a
// single group (drag-and-drop, and most dialog moves, all originate from
// one currently-open folder), occasionally more than one (a batch move
// built from recursive search results, where selected items can span
// different subfolders). Each group's `paths` are the items' CURRENT
// (post-move) locations - what undo actually needs to move, back to
// `destDir`, their shared original parent.
export function groupMovesByOriginalParent(moves: MovedPathPair[]): GroupedUndoMove[] {
  const byParent = new Map<string, string[]>()

  for (const move of moves) {
    const parent = getParentPath(move.path)
    const list = byParent.get(parent)
    if (list) list.push(move.newPath)
    else byParent.set(parent, [move.newPath])
  }

  return Array.from(byParent, ([destDir, paths]) => ({ destDir, paths }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/groupMovesByOriginalParent.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Create `lastMoveStore.ts`**

Create `src/stores/lastMoveStore.ts`:

```ts
import { create } from 'zustand'

export interface LastMove {
  path: string
  newPath: string
}

interface LastMoveState {
  lastMove: LastMove[] | null
  setLastMove: (moves: LastMove[]) => void
  clearLastMove: () => void
}

// Not persisted (like selectionStore) - a per-session record of the single
// most recent successful move, not a saved preference. Holds only one level
// of undo, per design - setLastMove unconditionally replaces whatever was
// recorded before, including when the "move" is itself an undo (which is
// exactly what makes pressing Ctrl+Z twice undo-the-undo/redo, for free).
export const useLastMoveStore = create<LastMoveState>((set) => ({
  lastMove: null,
  setLastMove: (moves) => set({ lastMove: moves }),
  clearLastMove: () => set({ lastMove: null }),
}))
```

- [ ] **Step 6: Add the new translation keys (ko/ja/en)**

Edit `src/i18n/translations.ts`. Insert immediately after the existing `'fileOps.move'` line in each locale block:

**`ko`** (after line 195):
```ts
  'fileOps.movedToast': '{count}개 항목 이동됨',
  'fileOps.moveFailedToast': '{count}개 항목 이동 실패',
  'fileOps.undo': '실행취소',
```

**`ja`** (after line 495):
```ts
  'fileOps.movedToast': '{count}件を移動しました',
  'fileOps.moveFailedToast': '{count}件の移動に失敗しました',
  'fileOps.undo': '元に戻す',
```

**`en`** (after line 793):
```ts
  'fileOps.movedToast': '{count} items moved',
  'fileOps.moveFailedToast': 'Failed to move {count} items',
  'fileOps.undo': 'Undo',
```

Also insert immediately after the existing `'explorer.cannotAccessFolder'` line in each locale block (this key is consumed by Task 2's drag overlay, added now since this is where the plan touches `translations.ts`):

**`ko`** (after line 273):
```ts
  'explorer.dragCount': '{count}개 항목',
```

**`ja`** (after line 570):
```ts
  'explorer.dragCount': '{count}件',
```

**`en`** (after line 868):
```ts
  'explorer.dragCount': '{count} items',
```

- [ ] **Step 7: Replace `fileOpsService.ts`**

Current file:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DeleteResultDto, MoveResultDto, RenameResultDto } from '../../shared/types/ipc'

// Explorer's own folder listing (useFolderScan/useFolderScanRecursive in
// scannerService.ts, queried by ['folder-scan', path]/['folder-scan-recursive',
// path]) is a separate cache from ['games'] (Gallery/List's aggregate view) -
// invalidating only ['games'] left Explorer showing already-renamed/deleted/
// moved entries for as long as useFolderScan's 5-minute staleTime allowed.
// invalidateQueries matches by key PREFIX by default (no `exact: true`), so
// omitting the path segment here invalidates every currently-cached folder,
// not just whichever one happens to be the active Explorer tab right now -
// necessary since a move can affect two folders (source and destination) at
// once, and any other open tab showing either one is just as stale.
function invalidateFolderScans(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: ['folder-scan'] })
  queryClient.invalidateQueries({ queryKey: ['folder-scan-recursive'] })
}

export function useRenameEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (renames: { path: string; newName: string }[]): Promise<RenameResultDto[]> =>
      window.api.fileOps.renameEntries(renames),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      invalidateFolderScans(queryClient)
    },
  })
}

export function useDeleteEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (paths: string[]): Promise<DeleteResultDto[]> =>
      window.api.fileOps.deleteEntries(paths),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      invalidateFolderScans(queryClient)
    },
  })
}

export function usePickMoveDestination() {
  return useMutation({
    mutationFn: (): Promise<string | null> => window.api.fileOps.pickMoveDestination(),
  })
}

export function useMoveEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      paths,
      destDir,
    }: {
      paths: string[]
      destDir: string
    }): Promise<MoveResultDto[]> => window.api.fileOps.moveEntries(paths, destDir),
    onSuccess: () => {
      // Paths changed (and possibly a code link / favorite-rating-memo-
      // playtime row moved with them) - the same invalidation rename/delete
      // already do is enough here too.
      queryClient.invalidateQueries({ queryKey: ['games'] })
      queryClient.invalidateQueries({ queryKey: ['game-user-data'] })
      invalidateFolderScans(queryClient)
    },
  })
}
```

Replace with (adds `toast`/`useTranslation`/`groupMovesByOriginalParent`/`useLastMoveStore` imports, a `MoveEntriesMutation` type alias, an exported `performUndo`, and rewrites `useMoveEntries()`'s `onSuccess` — every other export is byte-for-byte unchanged):

```ts
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from '../i18n/useTranslation'
import { groupMovesByOriginalParent } from '../lib/groupMovesByOriginalParent'
import { useLastMoveStore } from '../stores/lastMoveStore'
import type { DeleteResultDto, MoveResultDto, RenameResultDto } from '../../shared/types/ipc'

// Explorer's own folder listing (useFolderScan/useFolderScanRecursive in
// scannerService.ts, queried by ['folder-scan', path]/['folder-scan-recursive',
// path]) is a separate cache from ['games'] (Gallery/List's aggregate view) -
// invalidating only ['games'] left Explorer showing already-renamed/deleted/
// moved entries for as long as useFolderScan's 5-minute staleTime allowed.
// invalidateQueries matches by key PREFIX by default (no `exact: true`), so
// omitting the path segment here invalidates every currently-cached folder,
// not just whichever one happens to be the active Explorer tab right now -
// necessary since a move can affect two folders (source and destination) at
// once, and any other open tab showing either one is just as stale.
function invalidateFolderScans(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: ['folder-scan'] })
  queryClient.invalidateQueries({ queryKey: ['folder-scan-recursive'] })
}

export function useRenameEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (renames: { path: string; newName: string }[]): Promise<RenameResultDto[]> =>
      window.api.fileOps.renameEntries(renames),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      invalidateFolderScans(queryClient)
    },
  })
}

export function useDeleteEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (paths: string[]): Promise<DeleteResultDto[]> =>
      window.api.fileOps.deleteEntries(paths),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      invalidateFolderScans(queryClient)
    },
  })
}

export function usePickMoveDestination() {
  return useMutation({
    mutationFn: (): Promise<string | null> => window.api.fileOps.pickMoveDestination(),
  })
}

export type MoveEntriesMutation = UseMutationResult<
  MoveResultDto[],
  Error,
  { paths: string[]; destDir: string }
>

// Exported so AppLayout.tsx's global Ctrl+Z listener can trigger the same
// undo the success toast's own action button does - both need a live
// `moveEntries` mutation instance to actually perform the reverse move
// through, since undo is itself just another move. Reads the store at call
// time (not from a captured closure) so it always undoes whatever the most
// recent move actually was, regardless of which toast/listener triggers it.
export function performUndo(moveEntries: MoveEntriesMutation): void {
  const lastMove = useLastMoveStore.getState().lastMove
  if (!lastMove) return
  for (const group of groupMovesByOriginalParent(lastMove)) {
    moveEntries.mutate({ paths: group.paths, destDir: group.destDir })
  }
}

export function useMoveEntries(): MoveEntriesMutation {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const mutation: MoveEntriesMutation = useMutation({
    mutationFn: ({
      paths,
      destDir,
    }: {
      paths: string[]
      destDir: string
    }): Promise<MoveResultDto[]> => window.api.fileOps.moveEntries(paths, destDir),
    onSuccess: (results) => {
      // Paths changed (and possibly a code link / favorite-rating-memo-
      // playtime row moved with them) - the same invalidation rename/delete
      // already do is enough here too.
      queryClient.invalidateQueries({ queryKey: ['games'] })
      queryClient.invalidateQueries({ queryKey: ['game-user-data'] })
      invalidateFolderScans(queryClient)

      // Fires for every successful move regardless of entry point - drag-
      // and-drop, the right-click Move dialog, or the multi-select
      // toolbar's batch move - since this hook's onSuccess is the one place
      // all three funnel through. MoveDialog's own per-item results screen
      // is unchanged and still shown for that entry point; this toast is an
      // additional, lighter-weight confirmation that also carries the undo
      // affordance.
      const moved = results.flatMap((r) =>
        r.success && r.newPath ? [{ path: r.path, newPath: r.newPath }] : []
      )
      if (moved.length > 0) {
        useLastMoveStore.getState().setLastMove(moved)
        toast.success(t('fileOps.movedToast', { count: moved.length }), {
          action: { label: t('fileOps.undo'), onClick: () => performUndo(mutation) },
        })
      }

      const failedCount = results.filter((r) => !r.success).length
      if (failedCount > 0) {
        toast.error(t('fileOps.moveFailedToast', { count: failedCount }))
      }
    },
  })
  return mutation
}
```

(`mutation` is referenced inside its own `onSuccess` closure before the `const mutation = ...` statement completes - this is safe: `onSuccess` is only ever *invoked* later, asynchronously, by which point the assignment has long finished. This is a standard, safe self-referential-closure pattern, not a temporal-dead-zone bug.)

- [ ] **Step 8: Add the global Ctrl+Z listener to `AppLayout.tsx`**

Current file:

```tsx
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouterState } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { Sidebar } from './Sidebar'
import { BulkCrawlProgressBanner } from './BulkCrawlProgressBanner'
import { useBulkCrawlProgress } from '../../hooks/useBulkCrawlMissingMetadata'
import { MediaPlayerHost } from '../media/MediaPlayerHost'
import { useMediaPlayerSync } from '../../hooks/useMediaPlayerSync'
import { ExcludedEntriesDialog } from './ExcludedEntriesDialog'
import { useTheme } from '../../hooks/useTheme'

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const bulkCrawlProgress = useBulkCrawlProgress()
  const { theme } = useTheme()
  useMediaPlayerSync()

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              className="h-full"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MediaPlayerHost />
      <BulkCrawlProgressBanner progress={bulkCrawlProgress} />
      <ExcludedEntriesDialog />
      {/* position="top-right" avoids overlapping BulkCrawlProgressBanner's
          own fixed bottom-4 right-4 position. richColors gives success/error
          toasts distinct color treatment without this app hand-rolling
          variant styling. */}
      <Toaster theme={theme} position="top-right" richColors />
    </div>
  )
}
```

Replace with (adds `useEffect`/`useRef` to the `react` import, a `useMoveEntries`/`performUndo` import, and the new global Ctrl+Z effect — every other line unchanged):

```tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouterState } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { Sidebar } from './Sidebar'
import { BulkCrawlProgressBanner } from './BulkCrawlProgressBanner'
import { useBulkCrawlProgress } from '../../hooks/useBulkCrawlMissingMetadata'
import { MediaPlayerHost } from '../media/MediaPlayerHost'
import { useMediaPlayerSync } from '../../hooks/useMediaPlayerSync'
import { ExcludedEntriesDialog } from './ExcludedEntriesDialog'
import { useTheme } from '../../hooks/useTheme'
import { useMoveEntries, performUndo } from '../../services/fileOpsService'

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const bulkCrawlProgress = useBulkCrawlProgress()
  const { theme } = useTheme()
  useMediaPlayerSync()

  // Global (not scoped to Explorer's TabBar, unlike its own Ctrl+W handler)
  // since a move - and therefore something to undo - can originate from
  // Gallery/List/DetailList's own right-click Move dialog too, not just
  // Explorer. A ref (updated every render, read inside a mount-once effect)
  // avoids re-subscribing the listener on every mutation-object identity
  // change, which useMutation's return value isn't guaranteed to keep
  // stable across renders.
  const moveEntries = useMoveEntries()
  const moveEntriesRef = useRef(moveEntries)
  moveEntriesRef.current = moveEntries

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey && event.key === 'z')) return
      // Same isEditingElsewhere guard TabBar.tsx's own Ctrl+W handler
      // already uses - Ctrl+Z must not hijack a text field's own native
      // undo (e.g. while typing in the rename dialog or the search box).
      const active = document.activeElement
      const isEditingElsewhere =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (isEditingElsewhere) return

      event.preventDefault()
      performUndo(moveEntriesRef.current)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              className="h-full"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MediaPlayerHost />
      <BulkCrawlProgressBanner progress={bulkCrawlProgress} />
      <ExcludedEntriesDialog />
      {/* position="top-right" avoids overlapping BulkCrawlProgressBanner's
          own fixed bottom-4 right-4 position. richColors gives success/error
          toasts distinct color treatment without this app hand-rolling
          variant styling. */}
      <Toaster theme={theme} position="top-right" richColors />
    </div>
  )
}
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 10: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions (includes the 4 new `groupMovesByOriginalParent` tests).

- [ ] **Step 11: Live-verify against the EXISTING Move dialog (no drag-and-drop needed yet)**

Run: `npm run dev`. Using the existing right-click "이동" (Move) flow (from Gallery, List, or Explorer's context menu - whichever is convenient) on an entry:
- Confirm a success toast appears (in addition to the existing results dialog), showing "N개 항목 이동됨", with an "실행취소" button.
- Click the toast's "실행취소" button - confirm the item moves back to its original folder (check via the OS file explorer or by browsing back to the original location in this app), and a second toast confirms that reverse move.
- Repeat a move, then instead of clicking the toast button, press Ctrl+Z - confirm the same undo happens.
- Press Ctrl+Z again immediately after that undo - confirm it undoes the undo (i.e. the item moves forward again) - this is the "emergent redo" the design calls out.
- With no move having just happened (fresh app start, or after enough time/other actions that you're confident nothing is pending), press Ctrl+Z - confirm nothing happens (no error, no console warning).
- Click into a text field (e.g. Explorer's search box, or a rename dialog's input) and press Ctrl+Z there - confirm the app's own move-undo does NOT fire (the field's native undo, or nothing, happens instead - not an app-level move).
- No console errors in any of the above.

- [ ] **Step 12: Commit**

```bash
git add src/lib/groupMovesByOriginalParent.ts src/lib/groupMovesByOriginalParent.test.ts src/stores/lastMoveStore.ts src/services/fileOpsService.ts src/i18n/translations.ts src/components/layout/AppLayout.tsx
git commit -m "$(cat <<'EOF'
feat: toast feedback and Ctrl+Z undo for every move

Wired at useMoveEntries()'s shared onSuccess rather than any specific
UI entry point, so this applies immediately to the existing right-
click Move dialog and toolbar batch move - and will apply to Task 2's
drag-and-drop moves for free once that lands, since it calls the same
mutation. Undo is single-level, grouped by each item's original parent
directory so a batch spanning multiple source folders still undoes
correctly in one action.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Drag-and-drop move mechanics

**Correction to the design spec's stated architecture:** the spec describes a new `DndContext` at `ExplorerPage` level, "separate from `TabBar`'s existing tab-reorder `DndContext`." Two *nested* `DndContext` instances cannot actually share drag state - `@dnd-kit`'s `useDraggable`/`useDroppable` always bind to the *nearest* enclosing `DndContext`, so a droppable registered from inside `TabBar`'s own (inner) context would never be visible to a drag that started in the outer one, and a tab could never receive a file dropped on it. The correct implementation merges into **one** `DndContext` at `ExplorerPage` level; `TabBar`'s existing `SortableContext` (not a drag-detection root, just a strategy/measurement provider - safe to nest inside any single `DndContext`) stays where it is. Every draggable/droppable is tagged with a `type` field via `data`, and the single `onDragEnd` branches on `active`'s tag to run either the existing tab-reorder logic or the new move logic. This is what this task implements.

**Files:**
- Create: `src/pages/Explorer/dragTypes.ts`
- Modify: `src/pages/Explorer/ExplorerPage.tsx`
- Modify: `src/pages/Explorer/TabBar.tsx`
- Modify: `src/pages/Explorer/FolderView.tsx`

**Interfaces:**
- Consumes: `useMoveEntries()`, `MoveEntriesMutation` (Task 1, `src/services/fileOpsService.ts`) - `ExplorerPage.tsx`'s `handleDragEnd` calls `moveEntries.mutate({ paths, destDir })` exactly as `MoveDialog.tsx` already does. `useSelectionStore` (existing, unchanged) - read imperatively via `.getState()` to resolve "is the dragged row part of the current selection" without subscribing the drag handler to re-renders.
- Produces: `ExplorerDragData` (`{ type: 'entry'; entry: ScannedEntry } | { type: 'tab'; path: string }`) and `ExplorerDropData` (`{ type: 'folder-entry' | 'breadcrumb' | 'tab'; path: string }`), both from the new `src/pages/Explorer/dragTypes.ts` - nothing outside this plan consumes them.

- [ ] **Step 1: Create `dragTypes.ts`**

Create `src/pages/Explorer/dragTypes.ts`:

```ts
import type { ScannedEntry } from '../../../shared/types/scanner'

// Tagged onto every draggable/droppable's `data` option so the single
// shared DndContext's onDragEnd (ExplorerPage.tsx) can tell what kind of
// drag just happened - a tab being reordered vs. an entry being moved -
// and droppables can tell what destination path a drop resolves to.
export type ExplorerDragData =
  | { type: 'entry'; entry: ScannedEntry }
  | { type: 'tab'; path: string }

export type ExplorerDropData =
  | { type: 'folder-entry'; path: string }
  | { type: 'breadcrumb'; path: string }
  | { type: 'tab'; path: string }
```

- [ ] **Step 2: Replace `TabBar.tsx`**

Current file:

```tsx
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { FolderOpen, Plus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../components/ui/context-menu'
import { useExplorerStore, type ExplorerTab } from '../../stores/explorerStore'
import { useLibraries } from '../../services/librariesService'
import { deriveNameFromPath } from '../../lib/deriveNameFromPath'
import { useShowItemInFolder } from '../../services/shellService'
import { useTranslation } from '../../i18n/useTranslation'

function SortableTab({ tab }: { tab: ExplorerTab }) {
  const { t } = useTranslation()
  const activeTabId = useExplorerStore((s) => s.activeTabId)
  const setActiveTab = useExplorerStore((s) => s.setActiveTab)
  const closeTab = useExplorerStore((s) => s.closeTab)
  const closeOtherTabs = useExplorerStore((s) => s.closeOtherTabs)
  const duplicateTab = useExplorerStore((s) => s.duplicateTab)
  const showItemInFolder = useShowItemInFolder()
  const queryClient = useQueryClient()

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tab.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={() => setActiveTab(tab.id)}
          onAuxClick={(e) => {
            if (e.button === 1) closeTab(tab.id) // 마우스 휠클릭(가운데 버튼)으로 탭 닫기
          }}
          className={`group flex shrink-0 items-center gap-1 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors ${
            tab.id === activeTabId
              ? 'border-primary bg-card font-medium'
              : 'border-transparent hover:bg-accent'
          }`}
        >
          <span>{tab.label}</span>
          <button
            aria-label={t('tabBar.closeTab')}
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
            className="rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => closeTab(tab.id)}>{t('tabBar.closeTab')}</ContextMenuItem>
        <ContextMenuItem onSelect={() => closeOtherTabs(tab.id)}>
          {t('tabBar.closeOtherTabs')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => duplicateTab(tab.id)}>
          {t('tabBar.duplicateTab')}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            queryClient.invalidateQueries({ queryKey: ['folder-scan', tab.path] })
            queryClient.invalidateQueries({ queryKey: ['folder-scan-recursive', tab.path] })
          }}
        >
          {t('tabBar.refreshFolder')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => showItemInFolder.mutate(tab.path)}>
          {t('tabBar.openInOsExplorer')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function TabBar() {
  const { t } = useTranslation()
  const tabs = useExplorerStore((s) => s.tabs)
  const activeTabId = useExplorerStore((s) => s.activeTabId)
  const reorderTabs = useExplorerStore((s) => s.reorderTabs)
  const addTab = useExplorerStore((s) => s.addTab)
  const closeTab = useExplorerStore((s) => s.closeTab)
  const { data: libraries } = useLibraries()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key === 'w') {
        // Ctrl+W is global (window-level) so it can fire while an input,
        // textarea, or contentEditable elsewhere in the app (e.g. the
        // RatingMemoDialog memo field) is focused - don't destroy in-progress
        // typing by unmounting the active tab out from under it.
        const active = document.activeElement
        const isEditingElsewhere =
          active instanceof HTMLElement &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
        if (isEditingElsewhere) return

        event.preventDefault()
        const activeTabId = useExplorerStore.getState().activeTabId
        if (activeTabId) closeTab(activeTabId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeTab])

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderTabs(String(active.id), String(over.id))
  }

  const hasLibraries = (libraries?.length ?? 0) > 0

  const handleAddTab = (): void => {
    // Only reachable when a library is registered (button is disabled
    // otherwise) - without this guard a new tab would get path: '', and
    // FolderView's isError branch would show a generic "cannot access this
    // folder" message that's misleading for "no library registered yet".
    if (!hasLibraries) return
    // Inherit the currently active tab's path (like a real browser's "new
    // tab" staying in context) rather than always jumping back to whichever
    // library happens to be first in the registration list - only falls
    // back to that when there's no active tab yet (e.g. the very first tab).
    const activeTab = tabs.find((tab) => tab.id === activeTabId)
    addTab({ label: t('tabBar.newTab'), path: activeTab?.path ?? libraries?.[0]?.path ?? '' })
  }

  const handleOpenFolder = async (): Promise<void> => {
    const path = await window.api.libraries.pickFolder()
    if (!path) return
    addTab({ label: deriveNameFromPath(path), path })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex items-center border-b border-border">
          <AnimatePresence mode="popLayout">
            {tabs.map((tab) => (
              <motion.div
                key={tab.id}
                layout
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
              >
                <SortableTab tab={tab} />
              </motion.div>
            ))}
          </AnimatePresence>
          <button
            onClick={handleAddTab}
            disabled={!hasLibraries}
            aria-label={t('tabBar.addTab')}
            title={hasLibraries ? t('tabBar.addTab') : t('tabBar.registerLibraryFirst')}
            className="flex shrink-0 items-center justify-center rounded-t-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={handleOpenFolder}
            aria-label={t('tabBar.openFolder')}
            title={t('tabBar.openFolder')}
            className="flex shrink-0 items-center justify-center rounded-t-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
      </SortableContext>
    </DndContext>
  )
}
```

Replace with (removes the `DndContext`/sensors/`handleDragEnd` - they move to `ExplorerPage.tsx`, which now wraps `TabBar` in the single shared context - tags `useSortable`'s `data` so a tab can also act as a file-drop target, and adds an `isOver`-gated highlight for that case via `useDndContext()`):

```tsx
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { useDndContext } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { FolderOpen, Plus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../components/ui/context-menu'
import { useExplorerStore, type ExplorerTab } from '../../stores/explorerStore'
import { useLibraries } from '../../services/librariesService'
import { deriveNameFromPath } from '../../lib/deriveNameFromPath'
import { useShowItemInFolder } from '../../services/shellService'
import { useTranslation } from '../../i18n/useTranslation'
import type { ExplorerDragData } from './dragTypes'

function SortableTab({ tab }: { tab: ExplorerTab }) {
  const { t } = useTranslation()
  const activeTabId = useExplorerStore((s) => s.activeTabId)
  const setActiveTab = useExplorerStore((s) => s.setActiveTab)
  const closeTab = useExplorerStore((s) => s.closeTab)
  const closeOtherTabs = useExplorerStore((s) => s.closeOtherTabs)
  const duplicateTab = useExplorerStore((s) => s.duplicateTab)
  const showItemInFolder = useShowItemInFolder()
  const queryClient = useQueryClient()

  const { attributes, listeners, setNodeRef, transform, transition, isOver } = useSortable({
    id: tab.id,
    data: { type: 'tab', path: tab.path } satisfies ExplorerDragData,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  // isOver fires for ANY overlapping drag - another tab being reordered
  // onto this one, or a file entry being dropped onto this one as a move
  // target. Only the second case should show a "drop a file here"
  // highlight, so it's additionally gated on the currently-dragged item's
  // own data type, read via useDndContext() (this app's existing DndContext
  // instance, not a new one) rather than prop-drilled down from ExplorerPage.
  const { active } = useDndContext()
  const isFileDropTarget =
    isOver && (active?.data.current as ExplorerDragData | undefined)?.type === 'entry'

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={() => setActiveTab(tab.id)}
          onAuxClick={(e) => {
            if (e.button === 1) closeTab(tab.id) // 마우스 휠클릭(가운데 버튼)으로 탭 닫기
          }}
          className={`group flex shrink-0 items-center gap-1 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors ${
            tab.id === activeTabId
              ? 'border-primary bg-card font-medium'
              : 'border-transparent hover:bg-accent'
          } ${isFileDropTarget ? 'bg-accent ring-1 ring-inset ring-primary' : ''}`}
        >
          <span>{tab.label}</span>
          <button
            aria-label={t('tabBar.closeTab')}
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
            className="rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => closeTab(tab.id)}>{t('tabBar.closeTab')}</ContextMenuItem>
        <ContextMenuItem onSelect={() => closeOtherTabs(tab.id)}>
          {t('tabBar.closeOtherTabs')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => duplicateTab(tab.id)}>
          {t('tabBar.duplicateTab')}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            queryClient.invalidateQueries({ queryKey: ['folder-scan', tab.path] })
            queryClient.invalidateQueries({ queryKey: ['folder-scan-recursive', tab.path] })
          }}
        >
          {t('tabBar.refreshFolder')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => showItemInFolder.mutate(tab.path)}>
          {t('tabBar.openInOsExplorer')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function TabBar() {
  const { t } = useTranslation()
  const tabs = useExplorerStore((s) => s.tabs)
  const activeTabId = useExplorerStore((s) => s.activeTabId)
  const addTab = useExplorerStore((s) => s.addTab)
  const closeTab = useExplorerStore((s) => s.closeTab)
  const { data: libraries } = useLibraries()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key === 'w') {
        // Ctrl+W is global (window-level) so it can fire while an input,
        // textarea, or contentEditable elsewhere in the app (e.g. the
        // RatingMemoDialog memo field) is focused - don't destroy in-progress
        // typing by unmounting the active tab out from under it.
        const active = document.activeElement
        const isEditingElsewhere =
          active instanceof HTMLElement &&
          (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
        if (isEditingElsewhere) return

        event.preventDefault()
        const activeTabId = useExplorerStore.getState().activeTabId
        if (activeTabId) closeTab(activeTabId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeTab])

  const hasLibraries = (libraries?.length ?? 0) > 0

  const handleAddTab = (): void => {
    // Only reachable when a library is registered (button is disabled
    // otherwise) - without this guard a new tab would get path: '', and
    // FolderView's isError branch would show a generic "cannot access this
    // folder" message that's misleading for "no library registered yet".
    if (!hasLibraries) return
    // Inherit the currently active tab's path (like a real browser's "new
    // tab" staying in context) rather than always jumping back to whichever
    // library happens to be first in the registration list - only falls
    // back to that when there's no active tab yet (e.g. the very first tab).
    const activeTab = tabs.find((tab) => tab.id === activeTabId)
    addTab({ label: t('tabBar.newTab'), path: activeTab?.path ?? libraries?.[0]?.path ?? '' })
  }

  const handleOpenFolder = async (): Promise<void> => {
    const path = await window.api.libraries.pickFolder()
    if (!path) return
    addTab({ label: deriveNameFromPath(path), path })
  }

  return (
    <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
      <div className="flex items-center border-b border-border">
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => (
            <motion.div
              key={tab.id}
              layout
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
            >
              <SortableTab tab={tab} />
            </motion.div>
          ))}
        </AnimatePresence>
        <button
          onClick={handleAddTab}
          disabled={!hasLibraries}
          aria-label={t('tabBar.addTab')}
          title={hasLibraries ? t('tabBar.addTab') : t('tabBar.registerLibraryFirst')}
          className="flex shrink-0 items-center justify-center rounded-t-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={handleOpenFolder}
          aria-label={t('tabBar.openFolder')}
          title={t('tabBar.openFolder')}
          className="flex shrink-0 items-center justify-center rounded-t-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <FolderOpen className="h-4 w-4" />
        </button>
      </div>
    </SortableContext>
  )
}
```

- [ ] **Step 3: Replace `ExplorerPage.tsx`**

Current file:

```tsx
import { TabBar } from './TabBar'
import { FolderView } from './FolderView'
import { useExplorerStore } from '../../stores/explorerStore'
import { useExplorerTabsPersistence } from '../../hooks/useExplorerTabsPersistence'
import { useTranslation } from '../../i18n/useTranslation'

export function ExplorerPage() {
  const { t } = useTranslation()
  useExplorerTabsPersistence()
  const activeTab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const navigateTab = useExplorerStore((s) => s.navigateTab)

  return (
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
  )
}
```

Replace with (adds the single shared `DndContext` wrapping both `TabBar` and `FolderView`, its `onDragStart`/`onDragEnd`/`onDragCancel` handlers, and a `DragOverlay` showing the currently-dragged entry's name or selection count):

```tsx
import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
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
      // A no-op drop: the target is the folder this tab is already showing
      // (dropped onto its own breadcrumb tail, or the tab itself).
      if (destDir === activeTab?.path) return

      const selectedPaths = useSelectionStore.getState().selectedPaths
      const draggedPaths = selectedPaths.has(activeData.entry.path)
        ? Array.from(selectedPaths)
        : [activeData.entry.path]
      // Dragging a multi-selection that happens to include the drop target
      // itself (e.g. selecting two folders and dropping one onto the
      // other) - the active.id === over.id guard above only catches the
      // exact dragged row, not other selected items.
      if (draggedPaths.includes(destDir)) return

      moveEntries.mutate({ paths: draggedPaths, destDir })
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
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

- [ ] **Step 4: Replace `FolderView.tsx`**

Current file (as left by the visual-polish sub-project plus this session's live fixes - full content):

```tsx
import { useEffect, useState } from 'react'
import { Music } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { ContextMenu, ContextMenuTrigger } from '../../components/ui/context-menu'
import { pathToBreadcrumbSegments } from './breadcrumb'
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          {...longPressHandlers}
          className="flex h-10 shrink-0 cursor-pointer items-center gap-3 px-4 text-sm transition-colors hover:bg-accent"
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

  return (
    <li
      {...longPressHandlers}
      className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
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
            <button
              className="hover:text-foreground hover:underline"
              onClick={() => onNavigate(segment.path)}
            >
              {segment.label}
            </button>
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

Replace with (adds `useDraggable`/`useDroppable` imports and the `dragTypes` import; `FolderEntryRow` and `SearchResultRow` each become a drag source, and additionally a drop target when `entry.kind === 'folder'`; a new `BreadcrumbSegmentButton` component replaces the inline breadcrumb `<button>` so each segment is a drop target too - every other line, including all existing comments, is unchanged):

```tsx
import { useEffect, useState } from 'react'
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
  const { attributes, listeners, setNodeRef: setDraggableNodeRef } = useDraggable({
    id: entry.path,
    data: { type: 'entry', entry } satisfies ExplorerDragData,
  })
  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
    id: entry.path,
    disabled: entry.kind !== 'folder',
    data: { type: 'folder-entry', path: entry.path } satisfies ExplorerDropData,
  })
  const setNodeRef = (node: HTMLElement | null): void => {
    setDraggableNodeRef(node)
    setDroppableNodeRef(node)
  }
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
  const { setNodeRef, isOver } = useDroppable({
    id: segment.path,
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

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 7: Live-verify drag-and-drop**

Run: `npm run dev`. In Explorer, with a folder containing at least 2 plain subfolders, 1 plain file, and 2+ open tabs (one showing a different folder than the other):

- Drag a single file onto a subfolder row - confirm the subfolder highlights while hovering, the file disappears from the current list on drop, a success toast appears, and browsing into that subfolder shows the file now there.
- Drag a plain file directly (no long-press first) - confirm this works with no need to enter selection mode first.
- Select 2+ items via the toolbar or long-press, then drag one of the selected rows onto a different subfolder - confirm the drag overlay shows "N개 항목" (not just the one row's name), and all N items move together.
- Drag a file onto a breadcrumb segment (an ancestor folder) - confirm it highlights on hover and the move succeeds to that ancestor.
- Drag a file onto a different, non-active tab - confirm that tab highlights (and does NOT reorder itself against other tabs, since this is a file drop not a tab-reorder), and the move succeeds to whatever folder that tab shows.
- Try dragging a row onto a FILE row (not a folder) - confirm it does not highlight and dropping there does nothing.
- Try dragging a folder row and dropping it back onto the folder it's already in (e.g. onto the current tab, or the last breadcrumb segment) - confirm this is a no-op (no move call, no toast).
- Confirm tab drag-to-reorder still works exactly as before (unaffected by any of the above).
- Long-press a row to enter selection mode - confirm it still works exactly as it did before this task (unaffected by the new draggable wiring sharing the same `onPointerDown`).
- No console errors in any of the above.
- Confirm the toast + Ctrl+Z undo from Task 1 also works for a move that just happened via drag-and-drop (not just the dialog-based moves Task 1 verified).

- [ ] **Step 8: Commit**

```bash
git add src/pages/Explorer/dragTypes.ts src/pages/Explorer/ExplorerPage.tsx src/pages/Explorer/TabBar.tsx src/pages/Explorer/FolderView.tsx
git commit -m "$(cat <<'EOF'
feat: drag-and-drop move in Explorer

Drag a row (or the current multi-selection) onto a folder row,
breadcrumb segment, or tab to move it there. One shared DndContext at
ExplorerPage level (not two nested ones, as the design spec originally
proposed - dnd-kit's hooks always bind to the nearest enclosing
context, so a droppable registered inside TabBar's own inner context
would never be visible to a drag that started in an outer one) with
every draggable/droppable tagged via a `type` field so a single
onDragEnd can distinguish a tab reorder from an entry move. Drag
activation reuses TabBar's existing distance-based PointerSensor
threshold, which composes cleanly with the existing long-press-to-
select gesture since they're gated on different triggers (distance vs.
duration).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
