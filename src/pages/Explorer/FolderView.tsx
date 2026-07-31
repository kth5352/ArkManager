import { useState } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../components/ui/context-menu'
import { pathToBreadcrumbSegments } from './breadcrumb'
import { useExplorerStore } from '../../stores/explorerStore'
import { GameThumbnail } from '../../components/game/GameThumbnail'
import { useOpenExternal } from '../../services/shellService'
import { useFolderScan, useFolderScanRecursive } from '../../services/scannerService'
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { Skeleton } from '../../components/ui/skeleton'
import { filterEntries } from '../../lib/filterEntries'
import { useCrawlGameMetadata, useGameMetadataMany } from '../../services/metadataService'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { relativePath } from './relativePath'
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
  const crawlMetadata = useCrawlGameMetadata()

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
        <ContextMenuItem onSelect={() => entry.code && crawlMetadata.mutate(entry.code)}>
          메타데이터 새로고침
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
          <span className="truncate">{entry.name}</span>
        </li>
      </ContextMenuTrigger>
      <FolderEntryContextMenu
        entry={entry}
        onOpenInNewTab={onOpenInNewTab}
        onOpenDetail={onOpenDetail}
      />
    </ContextMenu>
  )
}

export function FolderView({ tabId, path, onNavigate }: FolderViewProps) {
  const addTab = useExplorerStore((s) => s.addTab)
  const breadcrumbs = pathToBreadcrumbSegments(path)

  // useFolderScan's queryKey includes `path`, so React Query automatically
  // re-fetches when it changes - ExplorerPage keys FolderView only on the
  // active tab's id, not its path, so navigating into a subfolder (or via
  // breadcrumb) updates `path` without unmounting this component.
  const [searchQuery, setSearchQuery] = useState('')
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

  const { openDetail, detailOverlayElement } = useGameDetailOverlay([
    ...shallowEntries,
    ...recursiveEntries,
  ])

  const codes = recursiveEntries.flatMap((e) => (e.code ? [e.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

  const searchResults = isSearching
    ? filterEntries(recursiveEntries, metadataByCode, searchQuery, excludedGenres)
    : []

  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('explorer')

  const sortedSearchResults = sortEntries(searchResults, sortField, sortDirection)

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
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <SearchHeader
          query={searchQuery}
          onQueryChange={setSearchQuery}
          excludedGenres={excludedGenres}
          onClearFilters={() => setExcludedGenres([])}
        />
        <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
      </div>
      {isSearching ? (
        isSearchLoading ? (
          <div className="flex flex-1 flex-col gap-1 overflow-auto p-4">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isSearchError ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            검색 중 오류가 발생했습니다.
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
                검색 결과가 없습니다.
              </li>
            )}
          </ul>
        )
      ) : isError ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          이 폴더에 접근할 수 없습니다.
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
            />
          ))}
        </ul>
      )}
      {detailOverlayElement}
    </div>
  )
}
