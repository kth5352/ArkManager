import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import { invalidateFileListQueries } from '../../services/fileOpsService'
import type { ExplorerDragData, ExplorerDropData } from './dragTypes'

interface FolderViewProps {
  tabId: string
  path: string
  viewMode: 'list' | 'grid'
  onNavigate: (path: string) => void
  onViewModeChange: (mode: 'list' | 'grid') => void
  sidebarOpen: boolean
  onSidebarOpenChange: (open: boolean) => void
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
        className="relative h-8 w-8 overflow-hidden rounded bg-muted"
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
      <motion.div whileHover={{ scale: 1.08 }} transition={{ duration: 0.15 }}>
        <Music className="h-4 w-4 text-muted-foreground" />
      </motion.div>
    )
  }
  return (
    <motion.div whileHover={{ scale: 1.08 }} transition={{ duration: 0.15 }}>
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
          onKeyDown={(event) => {
            if (event.ctrlKey && event.shiftKey && event.key === 'ArrowUp') {
              event.preventDefault()
              onMove(entry)
            }
          }}
          tabIndex={0}
        >
          <SelectionCheckbox path={entry.path} className="h-4 w-4 shrink-0 rounded-sm" />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center">
            <EntryIcon entry={entry} />
          </div>
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
  onMove,
  path,
}: {
  entry: ScannedEntry
  onOpenDetail: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
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
      onKeyDown={(event) => {
        if (event.ctrlKey && event.shiftKey && event.key === 'ArrowUp') {
          event.preventDefault()
          onMove(entry)
        }
      }}
      tabIndex={0}
    >
      <SelectionCheckbox path={entry.path} className="h-4 w-4 shrink-0 rounded-sm" />
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        <EntryIcon entry={entry} />
      </div>
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

export function FolderView({
  tabId,
  path,
  viewMode,
  onNavigate,
  onViewModeChange,
  sidebarOpen,
  onSidebarOpenChange,
}: FolderViewProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const refreshFiles = (): void => invalidateFileListQueries(queryClient)
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
      <div className="flex min-h-[52px] items-center gap-2 border-b border-border px-4 py-2">
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
          onRefresh={refreshFiles}
          // Zoom only makes sense in grid mode (matching GalleryPage's own
          // "zoom only shown for a grid" precedent) - undefined here hides
          // PageToolbar's zoom slider entirely, its existing conditional
          // already handles that, unchanged.
          zoom={viewMode === 'grid' && !isSearching ? zoom : undefined}
          onZoomChange={viewMode === 'grid' && !isSearching ? setZoom : undefined}
          sidebarOpen={sidebarOpen}
          onSidebarOpenChange={onSidebarOpenChange}
        />
        <SelectionToolbar allEntries={selectionTargets} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={isSearching ? `search:${path}` : `normal:${path}:${viewMode}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex min-h-0 flex-1 flex-col"
        >
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
                  <SearchResultRow
                    key={entry.path}
                    entry={entry}
                    onOpenDetail={openDetail}
                    onMove={openMove}
                    path={path}
                  />
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
          ) : viewMode === 'grid' ? (
            <div className="min-h-0 flex-1 p-4">
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
            </div>
          ) : (
            <ul className="flex-1 divide-y divide-border overflow-auto">
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
            </ul>
          )}
        </motion.div>
      </AnimatePresence>
      {detailOverlayElement}
      {dialogElement}
    </div>
  )
}
