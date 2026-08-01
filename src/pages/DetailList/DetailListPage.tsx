import { List, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { useState } from 'react'
import { Copy, Star } from 'lucide-react'
import { useVisibleGames } from '../../hooks/useVisibleGames'
import { useGameMetadataMany } from '../../services/metadataService'
import { useGameUserData } from '../../services/gameUserDataService'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { filterEntries, type FileKindFilter } from '../../lib/filterEntries'
import { groupDuplicatesByCode } from '../../lib/groupDuplicatesByCode'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { FileKindFilterToggle } from '../../components/layout/FileKindFilterToggle'
import { LibraryVisibilityDialog } from '../../components/layout/LibraryVisibilityDialog'
import { FileKindIcon } from '../../components/game/FileKindIcon'
import { Skeleton } from '../../components/ui/skeleton'
import { useGameDetailSidebar } from '../../hooks/useGameDetailSidebar'
import { useScanProgress } from '../../hooks/useScanProgress'
import { useTriggerBulkCrawlMissingMetadata } from '../../hooks/useBulkCrawlMissingMetadata'
import { ScanProgressIndicator } from '../../components/layout/ScanProgressIndicator'
import type { ScannedEntry } from '../../../shared/types/scanner'

const ROW_HEIGHT = 32

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)}${units[unitIndex]}`
}

function formatDate(mtimeMs: number): string {
  return new Date(mtimeMs).toISOString().slice(0, 10)
}

interface DetailListRowProps {
  entries: ScannedEntry[]
  metadataByCode: Record<string, { genres: string[] }>
  duplicateGroups: Map<string, ScannedEntry[]>
  onOpenDetail: (entry: ScannedEntry) => void
}

function Row({
  index,
  style,
  entries,
  metadataByCode,
  duplicateGroups,
  onOpenDetail,
}: RowComponentProps<DetailListRowProps>) {
  const entry = entries[index]
  const { data: userData } = useGameUserData(entry ?? { code: null, path: '' })
  if (!entry) return null
  const genres = entry.code ? (metadataByCode[entry.code.value]?.genres ?? []) : []
  const duplicates = entry.code ? duplicateGroups.get(entry.code.value) : undefined

  return (
    <div
      style={style}
      className="flex cursor-pointer items-center gap-4 border-b border-border px-4 text-xs text-muted-foreground"
      onClick={() => onOpenDetail(entry)}
    >
      <FileKindIcon kind={entry.kind} name={entry.name} className="h-3.5 w-3.5 shrink-0" />
      <span className="w-28 shrink-0 truncate">{entry.code?.value ?? '-'}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{entry.name}</span>
      {duplicates && (
        <span
          className="flex shrink-0 items-center gap-0.5 rounded bg-destructive/10 px-1 py-0.5 text-destructive"
          title={`같은 코드의 다른 사본 ${duplicates.length - 1}개:\n${duplicates
            .filter((d) => d.path !== entry.path)
            .map((d) => d.path)
            .join('\n')}`}
        >
          <Copy className="h-3 w-3" />
          {duplicates.length}
        </span>
      )}
      <span className="w-64 shrink-0 truncate">{entry.path}</span>
      <span className="w-40 shrink-0 truncate">{genres.join(', ')}</span>
      <span className="w-24 shrink-0">{formatDate(entry.mtimeMs)}</span>
      <span className="w-20 shrink-0">{formatSize(entry.size)}</span>
      <span className="flex w-16 shrink-0 gap-0.5">
        {userData?.rating != null &&
          [1, 2, 3, 4, 5].map((value) => (
            <Star
              key={value}
              className="h-3 w-3 text-yellow-500"
              fill={value <= (userData.rating ?? 0) ? 'currentColor' : 'none'}
            />
          ))}
      </span>
    </div>
  )
}

export function DetailListPage() {
  const { data: games, isLoading, isError } = useVisibleGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('detail-list')
  const [searchQuery, setSearchQuery] = useState('')
  const [includedGenres, setIncludedGenres] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const [fileKindFilter, setFileKindFilter] = useState<FileKindFilter>('all')
  const { openDetail, detailSidebarElement } = useGameDetailSidebar(games ?? [])
  const scanProgress = useScanProgress(isLoading)

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)
  const gameCodes = (games ?? []).flatMap((g) => (g.code ? [g.code] : []))
  useTriggerBulkCrawlMissingMetadata(gameCodes)
  // Computed from the full unfiltered library, not the current search/filter
  // results - "this game has another copy elsewhere" should stay true
  // regardless of what's currently visible.
  const duplicateGroups = groupDuplicatesByCode(games ?? [])

  if (isError && !games) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        라이브러리를 스캔하는 중 오류가 발생했습니다.
      </div>
    )
  }

  if (isLoading || !games) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-col gap-1 p-4">
          {Array.from({ length: 15 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <ScanProgressIndicator scanned={scanProgress} />
      </div>
    )
  }

  const filtered = filterEntries(
    games,
    metadataByCode,
    searchQuery,
    includedGenres,
    excludedGenres,
    fileKindFilter
  )
  const sorted = sortEntries(filtered, sortField, sortDirection)

  return (
    <div className="flex h-full flex-col">
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
        <FileKindFilterToggle value={fileKindFilter} onChange={setFileKindFilter} />
        <LibraryVisibilityDialog />
        <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {sorted.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              표시할 항목이 없습니다.
            </div>
          ) : (
            <div className="h-full w-full">
              <AutoSizer
                style={{ height: '100%', width: '100%' }}
                renderProp={({ height, width }) => {
                  if (height === undefined || width === undefined) return null
                  return (
                    <List
                      rowComponent={Row}
                      rowProps={{
                        entries: sorted,
                        metadataByCode,
                        duplicateGroups,
                        onOpenDetail: openDetail,
                      }}
                      rowCount={sorted.length}
                      rowHeight={ROW_HEIGHT}
                      style={{ height, width }}
                    />
                  )
                }}
              />
            </div>
          )}
        </div>
        {detailSidebarElement}
      </div>
    </div>
  )
}
