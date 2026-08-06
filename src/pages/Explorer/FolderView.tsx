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
