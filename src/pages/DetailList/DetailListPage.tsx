import { List, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { useState, type PointerEvent as ReactPointerEvent } from 'react'
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
import { HoverTooltip } from '../../components/ui/hover-tooltip'
import { Skeleton } from '../../components/ui/skeleton'
import { useGameDetailSidebar } from '../../hooks/useGameDetailSidebar'
import { useScanProgress } from '../../hooks/useScanProgress'
import { useTriggerBulkCrawlMissingMetadata } from '../../hooks/useBulkCrawlMissingMetadata'
import { ScanProgressIndicator } from '../../components/layout/ScanProgressIndicator'
import type { ScannedEntry } from '../../../shared/types/scanner'

const ROW_HEIGHT = 32
const HEADER_HEIGHT = 28
const MIN_COLUMN_WIDTH = 60

// Only the free-text columns are resizable - code/date/size/rating are
// always short, fixed-format content that never benefits from it. Values
// here match this table's previous hardcoded Tailwind widths (w-28/w-64/
// w-40), just as explicit pixel state instead, since a drag-to-resize
// handle needs a real number to adjust rather than a Tailwind class.
interface ColumnWidths {
  code: number
  name: number
  path: number
  genres: number
}

const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  code: 112,
  name: 300,
  path: 256,
  genres: 160,
}

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

// The draggable divider sits on a column's right edge and grows/shrinks
// that same column - unlike DetailSidebar's single left-edge handle, this
// table has one of these per resizable column, so which column to update is
// a parameter rather than baked into one handler.
function ColumnResizeHandle({ onResize }: { onResize: (deltaX: number) => void }) {
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const startX = event.clientX

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      onResize(moveEvent.clientX - startX)
    }
    const handlePointerUp = (): void => {
      target.removeEventListener('pointermove', handlePointerMove)
      target.removeEventListener('pointerup', handlePointerUp)
    }

    target.addEventListener('pointermove', handlePointerMove)
    target.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 z-10 h-full w-1 shrink-0 cursor-col-resize hover:bg-primary/40"
    />
  )
}

function HeaderCell({
  label,
  width,
  onResize,
}: {
  label: string
  width: number
  onResize: (deltaX: number) => void
}) {
  return (
    <div
      style={{ width }}
      className="relative shrink-0 truncate pr-2 text-xs font-medium text-foreground"
    >
      {label}
      <ColumnResizeHandle onResize={onResize} />
    </div>
  )
}

interface DetailListRowProps {
  entries: ScannedEntry[]
  metadataByCode: Record<string, { genres: string[] }>
  duplicateGroups: Map<string, ScannedEntry[]>
  columnWidths: ColumnWidths
  onOpenDetail: (entry: ScannedEntry) => void
}

function Row({
  index,
  style,
  entries,
  metadataByCode,
  duplicateGroups,
  columnWidths,
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
      <HoverTooltip
        content={entry.code?.value ?? '-'}
        className="shrink-0"
        style={{ width: columnWidths.code }}
      >
        <span className="block truncate">{entry.code?.value ?? '-'}</span>
      </HoverTooltip>
      <HoverTooltip content={entry.name} className="min-w-0 flex-1">
        <span className="block truncate text-foreground">{entry.name}</span>
      </HoverTooltip>
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
      <HoverTooltip content={entry.path} className="shrink-0" style={{ width: columnWidths.path }}>
        <span className="block truncate">{entry.path}</span>
      </HoverTooltip>
      <HoverTooltip
        content={genres.join(', ') || '없음'}
        className="shrink-0"
        style={{ width: columnWidths.genres }}
      >
        <span className="block truncate">{genres.join(', ')}</span>
      </HoverTooltip>
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
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(DEFAULT_COLUMN_WIDTHS)

  // DetailList's own rows show genres as plain (non-clickable) text - this
  // only drives tag clicks inside the detail sidebar opened from a row.
  const filterByGenre = (genre: string): void => {
    setIncludedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    )
  }

  const { openDetail, detailSidebarElement } = useGameDetailSidebar(games ?? [], filterByGenre)
  const scanProgress = useScanProgress(isLoading)

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)
  const gameCodes = (games ?? []).flatMap((g) => (g.code ? [g.code] : []))
  useTriggerBulkCrawlMissingMetadata(gameCodes)
  // Computed from the full unfiltered library, not the current search/filter
  // results - "this game has another copy elsewhere" should stay true
  // regardless of what's currently visible.
  const duplicateGroups = groupDuplicatesByCode(games ?? [])

  const resizeColumn = (column: keyof ColumnWidths, deltaX: number): void => {
    setColumnWidths((prev) => ({
      ...prev,
      [column]: Math.max(MIN_COLUMN_WIDTH, prev[column] + deltaX),
    }))
  }

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
            <>
              <div
                style={{ height: HEADER_HEIGHT }}
                className="flex shrink-0 items-center gap-4 border-b border-border bg-muted/40 px-4"
              >
                <span className="h-3.5 w-3.5 shrink-0" />
                <HeaderCell
                  label="코드"
                  width={columnWidths.code}
                  onResize={(delta) => resizeColumn('code', delta)}
                />
                <HeaderCell
                  label="이름"
                  width={columnWidths.name}
                  onResize={(delta) => resizeColumn('name', delta)}
                />
                <HeaderCell
                  label="경로"
                  width={columnWidths.path}
                  onResize={(delta) => resizeColumn('path', delta)}
                />
                <HeaderCell
                  label="장르"
                  width={columnWidths.genres}
                  onResize={(delta) => resizeColumn('genres', delta)}
                />
                <span className="w-24 shrink-0 text-xs font-medium">수정일</span>
                <span className="w-20 shrink-0 text-xs font-medium">크기</span>
                <span className="w-16 shrink-0 text-xs font-medium">평점</span>
              </div>
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
                          columnWidths,
                          onOpenDetail: openDetail,
                        }}
                        rowCount={sorted.length}
                        rowHeight={ROW_HEIGHT}
                        style={{ height: height - HEADER_HEIGHT, width }}
                      />
                    )
                  }}
                />
              </div>
            </>
          )}
        </div>
        {detailSidebarElement}
      </div>
    </div>
  )
}
