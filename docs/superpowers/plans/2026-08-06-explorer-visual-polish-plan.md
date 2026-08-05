# Explorer Visual Polish + Multi-Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Explorer row a real icon (folder/archive/file/game-thumbnail), wire in the multi-select + batch rename/move/delete pipeline Gallery/List already have, and add three targeted animations (row hover, folder/tab-switch fade, tab add/remove).

**Architecture:** Task 1 reworks `FolderEntryRow` and the search-results row in `FolderView.tsx` to render an icon for every entry via a new shared `EntryIcon` helper, mirroring `ListPage.tsx`'s `GameRow` icon/badge treatment exactly. Task 2 wires the existing global selection pipeline (`useSelectionStore`, `SelectionCheckbox`, `useLongPress`, `SelectionToolbar`) into both of `FolderView.tsx`'s row types, and adds a `useEffect`-based selection reset keyed on `path` so a selection made in one folder doesn't linger — invisibly "selected" — after navigating to another. Task 3 adds framer-motion animations to `FolderView.tsx`'s entry list and `TabBar.tsx`'s tab list. No new files; no new dependencies (framer-motion, `@dnd-kit/*`, and every reused component already exist in this codebase).

**Tech Stack:** React 19 + TypeScript strict, Zustand (`useSelectionStore`, `useExplorerStore`), TanStack Query, framer-motion (already a dependency, used elsewhere for `GalleryPage.tsx`'s card hover and `AppLayout.tsx`'s route fade), `@dnd-kit/core`+`@dnd-kit/sortable` (already used by `TabBar.tsx`).

## Global Constraints

- No test infrastructure exists for this app's components/dialogs — this plan ships with zero new automated tests, verified live via `npm run dev` per task. `npx vitest run` must still pass in full after every task (no regressions to existing tests).
- Reused components (`FileKindIcon`, `SelectionCheckbox`, `SelectionToolbar`, `useSelectionStore`, `useLongPress`, `RenameDialog`/`MoveDialog`/`DeleteConfirmDialog`, `GameThumbnail`) are consumed as-is — none of them are modified by this plan.
- Out of scope: drag-and-drop file moves, grid/sidebar view modes (the next two Explorer sub-projects), any change to Gallery/List/DetailList, any info density beyond name + icon + code (no favorite/rating/playtime/genre badges in Explorer rows).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Row visual rework — icons for every entry

**Files:**
- Modify: `src/pages/Explorer/FolderView.tsx`

**Interfaces:**
- Produces: a new `EntryIcon({ entry: ScannedEntry })` component (module-local, not exported — both the main list and the search-results list in this same file use it directly; Tasks 2 and 3 modify the same file but never need to import `EntryIcon` from elsewhere).

- [ ] **Step 1: Replace `FolderView.tsx`**

Current file:

```tsx
import { useState } from 'react'
import { Music } from 'lucide-react'
import { ContextMenu, ContextMenuTrigger } from '../../components/ui/context-menu'
import { pathToBreadcrumbSegments } from './breadcrumb'
import { useExplorerStore } from '../../stores/explorerStore'
import { GameThumbnail } from '../../components/game/GameThumbnail'
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

interface FolderViewProps {
  tabId: string
  path: string
  onNavigate: (path: string) => void
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
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
          onClick={() => onEntryClick(entry)}
        >
          {entry.code && (
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
              <GameThumbnail entry={entry} />
            </div>
          )}
          {entry.kind === 'file' && isMediaFile(entry.name) && (
            <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
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

  const openInNewTab = (entry: ScannedEntry): void => {
    addTab({ label: entry.name, path: entry.path })
  }

  const playNow = useMediaPlayerStore((s) => s.playNow)

  // Coded entries (file or folder) and code-less files open the detail
  // overlay. Code-less folders still navigate into them - clicking through
  // folders to find a game is Explorer's core browsing model, and a
  // code-less folder is exactly what a user browses through on their way to
  // linking a code (via the right-click "코드 연동" item above, not a click).
  // A video/audio file plays instead, regardless of whether it happens to
  // have a code - there's no useful DLsite detail for a media file, and
  // every other media file currently listed in this same folder becomes the
  // playlist (in on-screen order) so next/prev walk through them.
  const handleEntryClick = (entry: ScannedEntry): void => {
    if (entry.kind === 'file' && isMediaFile(entry.name)) {
      const siblings = shallowEntries
        .filter((e) => e.kind === 'file' && isMediaFile(e.name))
        .map((e) => ({ path: e.path, name: e.name }))
      playNow({ path: entry.path, name: entry.name }, siblings)
      return
    }
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
          <ul className="flex-1 divide-y divide-border overflow-auto">
            {sortedSearchResults.map((entry) => (
              <li
                key={entry.path}
                className="flex cursor-pointer flex-col gap-0.5 px-4 py-2 text-sm transition-colors hover:bg-accent"
                onClick={() => openDetail(entry)}
              >
                <span className="truncate">{entry.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {relativePath(path, entry.path)}
                </span>
              </li>
            ))}
            {sortedSearchResults.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('dlsiteSearch.noResults')}
              </li>
            )}
          </ul>
        )
      ) : isError ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t('explorer.cannotAccessFolder')}
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-auto">
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
        </ul>
      )}
      {detailOverlayElement}
      {dialogElement}
    </div>
  )
}
```

Replace with (adds the `FileKindIcon` import, a new `EntryIcon` helper, fixed-height rows with a real icon for every entry in `FolderEntryRow`, and the same icon treatment on the search-results `<li>` — every other line, including all existing comments, is unchanged):

```tsx
import { useState } from 'react'
import { Music } from 'lucide-react'
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
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
        <GameThumbnail entry={entry} />
        <div className="absolute bottom-0.5 right-0.5 rounded-full bg-background/70 p-0.5 text-muted-foreground">
          <FileKindIcon kind={entry.kind} name={entry.name} className="h-3 w-3" />
        </div>
      </div>
    )
  }
  if (entry.kind === 'file' && isMediaFile(entry.name)) {
    return <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
  }
  return (
    <FileKindIcon
      kind={entry.kind}
      name={entry.name}
      className="h-4 w-4 shrink-0 text-muted-foreground"
    />
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
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          className="flex h-10 shrink-0 cursor-pointer items-center gap-3 px-4 text-sm transition-colors hover:bg-accent"
          onClick={() => onEntryClick(entry)}
        >
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

  const openInNewTab = (entry: ScannedEntry): void => {
    addTab({ label: entry.name, path: entry.path })
  }

  const playNow = useMediaPlayerStore((s) => s.playNow)

  // Coded entries (file or folder) and code-less files open the detail
  // overlay. Code-less folders still navigate into them - clicking through
  // folders to find a game is Explorer's core browsing model, and a
  // code-less folder is exactly what a user browses through on their way to
  // linking a code (via the right-click "코드 연동" item above, not a click).
  // A video/audio file plays instead, regardless of whether it happens to
  // have a code - there's no useful DLsite detail for a media file, and
  // every other media file currently listed in this same folder becomes the
  // playlist (in on-screen order) so next/prev walk through them.
  const handleEntryClick = (entry: ScannedEntry): void => {
    if (entry.kind === 'file' && isMediaFile(entry.name)) {
      const siblings = shallowEntries
        .filter((e) => e.kind === 'file' && isMediaFile(e.name))
        .map((e) => ({ path: e.path, name: e.name }))
      playNow({ path: entry.path, name: entry.name }, siblings)
      return
    }
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
          <ul className="flex-1 divide-y divide-border overflow-auto">
            {sortedSearchResults.map((entry) => (
              <li
                key={entry.path}
                className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
                onClick={() => openDetail(entry)}
              >
                <EntryIcon entry={entry} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate">{entry.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {relativePath(path, entry.path)}
                  </span>
                </div>
              </li>
            ))}
            {sortedSearchResults.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('dlsiteSearch.noResults')}
              </li>
            )}
          </ul>
        )
      ) : isError ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t('explorer.cannotAccessFolder')}
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-auto">
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
        </ul>
      )}
      {detailOverlayElement}
      {dialogElement}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions. This step touches no logic covered by `breadcrumb.test.ts` or `relativePath.test.ts` (both are pure path-string helpers, untouched by this task).

- [ ] **Step 4: Live-verify icons render correctly for every entry kind**

Run: `npm run dev`, open Explorer, navigate to a folder containing (or temporarily create, in a scratch test folder, one of each): a plain subfolder with no code, a plain loose file (e.g. `readme.txt`), an archive file (e.g. `test.zip`), a code-linked folder/file (e.g. `RJ01234567`), and a media file (e.g. `test.mp3`). Confirm:
- Plain folder → folder icon.
- Plain file → generic file icon.
- Archive file → archive icon (distinct from the generic file icon).
- Code-linked entry → its thumbnail, with a small kind-icon badge in the bottom-right corner of the thumbnail.
- Media file → the `Music` icon (unchanged from before).
- All rows are the same fixed height, evenly spaced, no layout jitter.
- Run a search (any query that matches at least one of the above) and confirm the search-results list shows the same icon treatment next to each result, alongside the existing two-line name/relative-path text.
- No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Explorer/FolderView.tsx
git commit -m "$(cat <<'EOF'
feat: give every Explorer row a real icon

FolderEntryRow only ever showed an icon for coded or media entries -
every plain folder/file (the majority of what Explorer actually
browses) rendered as bare text. Reuses FileKindIcon and the
thumbnail+badge treatment ListPage's GameRow already established,
rather than inventing a separate visual system for Explorer.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Multi-select + batch rename/move/delete

**Files:**
- Modify: `src/pages/Explorer/FolderView.tsx`

**Interfaces:**
- Consumes: `useSelectionStore` (`src/stores/selectionStore.ts` — `isActive`, `selectedPaths: Set<string>`, `activate(initialPath?: string)`, `deactivate()`, exact same store Gallery/List already use), `SelectionCheckbox` (`src/components/game/SelectionCheckbox.tsx` — props `{ path: string; className?: string }`), `SelectionToolbar` (`src/components/layout/SelectionToolbar.tsx` — props `{ allEntries: ScannedEntry[] }`, internally renders its own `RenameDialog`/`MoveDialog`/`DeleteConfirmDialog` using `selectedPaths` resolved against `allEntries`), `useLongPress` (`src/hooks/useLongPress.ts` — signature `useLongPress(onLongPress: () => void, options?: { thresholdMs?: number }): { handlers, consumeLongPressClick }`).
- Produces: nothing new consumed by Task 3 (Task 3 only adds animation wrappers around this task's JSX structure, not new data/functions).

- [ ] **Step 1: Modify `FolderView.tsx`**

Start from `FolderView.tsx` exactly as Task 1 left it (the full file is in Task 1's Step 1 "Replace with" block above — that is this step's starting point; nothing about it has changed since Task 1's commit). Apply these five concrete edits to that file, in order:

**1. Add four imports**, alongside the existing ones:

```tsx
import { SelectionCheckbox } from '../../components/game/SelectionCheckbox'
import { SelectionToolbar } from '../../components/layout/SelectionToolbar'
import { useLongPress } from '../../hooks/useLongPress'
import { useSelectionStore } from '../../stores/selectionStore'
```

Also add `useEffect` to the existing `import { useState } from 'react'` line, making it:

```tsx
import { useEffect, useState } from 'react'
```

**2. `FolderEntryRow` gains a checkbox and long-press activation**, matching `GameRow`'s exact pattern in `ListPage.tsx`. Replace the whole function with:

```tsx
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
```

**3. Inside `FolderView`, add the selection-reset effect and the toolbar's target list**, right after the existing `const sortedSearchResults = sortEntries(searchResults, sortField, sortDirection)` line:

```tsx
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
```

**4. Add `<SelectionToolbar>` to the toolbar row**, right after the existing `<PageToolbar ... />`:

```tsx
        <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
        <SelectionToolbar allEntries={selectionTargets} />
```

**5. The search-results `<li>` gains the same checkbox + long-press treatment.** Replace:

```tsx
            {sortedSearchResults.map((entry) => (
              <li
                key={entry.path}
                className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
                onClick={() => openDetail(entry)}
              >
                <EntryIcon entry={entry} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate">{entry.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {relativePath(path, entry.path)}
                  </span>
                </div>
              </li>
            ))}
```

with:

```tsx
            {sortedSearchResults.map((entry) => (
              <SearchResultRow key={entry.path} entry={entry} onOpenDetail={openDetail} path={path} />
            ))}
```

and add this new component right after `FolderEntryRow`'s closing brace (before `export function FolderView`):

```tsx
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
```

(A separate component, not an inline `<li>`, because — like `FolderEntryRow` — it now needs its own `useLongPress` hook instance per row; hooks cannot be called inside a `.map()` callback directly.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 4: Live-verify selection and batch actions**

Run: `npm run dev`, open Explorer with a folder containing at least 3 entries (mix of coded and plain). Confirm:
- Clicking the toolbar's "선택" button enters selection mode: every row gains a visible checkbox, and long-pressing (~2s) a row also enters selection mode and pre-checks that row.
- Checking 2-3 rows and clicking "전체 선택" selects every visible row; "취소" exits selection mode and hides the checkboxes again.
- With 2+ rows selected, "이름변경"/"이동"/"삭제" each open the corresponding dialog pre-populated with all selected entries, and completing one actually renames/moves/deletes all of them, then exits selection mode.
- Navigate to a different folder (breadcrumb or drilling into a subfolder) while selection mode is active with items selected — confirm selection mode turns itself off (toolbar reverts to just the "선택" button) rather than carrying over a stale "N selected" count.
- Switch to a different Explorer tab while selection mode is active — same check: selection mode turns off in the newly-active tab.
- Repeat the "선택 진입 → 체크 → 취소" check inside a search-results list (run a search first).
- No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Explorer/FolderView.tsx
git commit -m "$(cat <<'EOF'
feat: wire multi-select and batch rename/move/delete into Explorer

Gallery/List already had a complete selection pipeline
(useSelectionStore, SelectionCheckbox, SelectionToolbar, useLongPress,
and multi-target RenameDialog/MoveDialog/DeleteConfirmDialog) that
Explorer never adopted. Since the store is a single global singleton
shared across pages, and Explorer is the only one of them that
navigates between different entry sets while staying mounted, add a
path-keyed reset so a selection doesn't linger past the folder or tab
it was made in.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Animations — row hover, folder/tab fade, tab add/remove

**Files:**
- Modify: `src/pages/Explorer/FolderView.tsx`
- Modify: `src/pages/Explorer/TabBar.tsx`

**Interfaces:**
- Consumes: `motion`/`AnimatePresence` from `framer-motion` (already a dependency — see `GalleryPage.tsx`'s `whileHover={{ scale: 1.05 }}` card animation and `AppLayout.tsx`'s `AnimatePresence mode="wait"` route-fade for this codebase's existing usage conventions).
- Produces: nothing consumed elsewhere — this is the plan's final task.

- [ ] **Step 1: `FolderView.tsx` — icon hover scale + path-keyed list fade**

Add the import (alongside the existing imports):

```tsx
import { AnimatePresence, motion } from 'framer-motion'
```

In `EntryIcon`, wrap each returned icon in a `motion.div` with a hover scale (matching the `whileHover={{ scale: 1.05 }}` / `transition={{ duration: 0.15 }}` values `GalleryPage.tsx`'s `GameCard` already uses, at a slightly larger 1.08 since this element is much smaller than a full card). Replace `EntryIcon`'s body with:

```tsx
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
      <FileKindIcon kind={entry.kind} name={entry.name} className="h-4 w-4 text-muted-foreground" />
    </motion.div>
  )
}
```

Then wrap the two entry-list `<ul>` elements (the search-results one and the normal-browsing one — both already exist from Tasks 1-2) in `AnimatePresence` keyed on `path`, so navigating fades the list without unmounting `FolderView` itself. Replace:

```tsx
        ) : (
          <ul className="flex-1 divide-y divide-border overflow-auto">
            {sortedSearchResults.map((entry) => (
              <SearchResultRow key={entry.path} entry={entry} onOpenDetail={openDetail} path={path} />
            ))}
            {sortedSearchResults.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('dlsiteSearch.noResults')}
              </li>
            )}
          </ul>
        )
```

with:

```tsx
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
```

and replace the final branch:

```tsx
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-auto">
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
        </ul>
      )}
```

with:

```tsx
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
```

(`mode="wait"` matches `AppLayout.tsx`'s own route-fade usage — the outgoing list fully fades out before the incoming one fades in, avoiding an overlap flash. `key={path}` is what actually triggers the fade on navigation; `FolderView` itself still never unmounts, per the existing comment on `useFolderScan`.)

- [ ] **Step 2: `TabBar.tsx` — tab add/remove animation**

Current relevant block (`TabBar`'s full return statement; `SortableTab`'s own body above it is unchanged and not shown here):

```tsx
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex items-center border-b border-border">
          {tabs.map((tab) => (
            <SortableTab key={tab.id} tab={tab} />
          ))}
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
```

Add the import:

```tsx
import { AnimatePresence, motion } from 'framer-motion'
```

Wrap only the `tabs.map()` render in `AnimatePresence`, keeping `SortableTab`'s own `ref`/`style`/`attributes`/`listeners` (from `useSortable`) exactly as they are today — the new `motion.div` is an additional wrapper around what `SortableTab` already returns, not a replacement for its drag wiring. The two buttons after the map stay siblings of `AnimatePresence`, outside it, unchanged:

```tsx
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
```

(`layout` on the `motion.div` is what makes surviving tabs slide smoothly into a closed tab's freed space instead of snapping; `mode="popLayout"` lets the exiting tab animate out without immediately collapsing the space it occupied, which is what makes the `layout` slide on siblings look right instead of jumping the instant a tab is removed.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 5: Live-verify animations**

Run: `npm run dev`, open Explorer. Confirm:
- Hovering a row's icon (any kind) shows a small, smooth scale-up; moving off scales it back down. No jitter, no clipping against neighboring rows.
- Clicking a breadcrumb segment or double-clicking into a subfolder fades the list out and the new one in, without any visible flash of stale content or a jump in scroll position.
- Opening a new tab (the `+` button) animates it in (width/opacity) rather than popping in instantly; closing a tab (its `x` button, middle-click, or Ctrl+W) animates it out, and the remaining tabs slide smoothly into the freed space rather than snapping.
- Dragging to reorder tabs still works exactly as before (drag-and-drop itself is unchanged by this task — only mount/unmount animation was added).
- No console errors, no layout jitter anywhere above.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Explorer/FolderView.tsx src/pages/Explorer/TabBar.tsx
git commit -m "$(cat <<'EOF'
feat: animate Explorer's row hover, folder/tab transitions, and tab add/remove

Row-icon hover gets a subtle framer-motion scale (matching GalleryPage's
card hover, scaled down for a much smaller element). The entry list
fades on navigation via a path-keyed AnimatePresence, without touching
FolderView's own deliberate no-remount-on-path-change behavior. Tabs
animate in/out on add/remove with a layout transition so surviving
tabs slide into freed space instead of snapping.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
