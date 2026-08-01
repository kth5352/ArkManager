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
