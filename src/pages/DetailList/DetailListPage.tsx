import { List, useListCallbackRef, type RowComponentProps } from 'react-window'
import { useQueryClient } from '@tanstack/react-query'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Copy, Star } from 'lucide-react'
import { useVisibleGames } from '../../hooks/useVisibleGames'
import { useGameMetadataMany } from '../../services/metadataService'
import { useGameUserData } from '../../services/gameUserDataService'
import { useExcludeEntry } from '../../services/excludedEntriesService'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { filterEntries, type FileKindFilter } from '../../lib/filterEntries'
import {
  getDuplicateGroupForEntry,
  getExtractedArchiveCodes,
  groupDuplicatesByCode,
  hasDuplicateGroupForEntry,
  isArchiveExtracted,
} from '../../lib/groupDuplicatesByCode'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { FileKindFilterToggle } from '../../components/layout/FileKindFilterToggle'
import { DuplicatesOnlyToggle } from '../../components/layout/DuplicatesOnlyToggle'
import { LibraryVisibilityDialog } from '../../components/layout/LibraryVisibilityDialog'
import { SelectionToolbar } from '../../components/layout/SelectionToolbar'
import { FileKindIcon } from '../../components/game/FileKindIcon'
import { SelectionCheckbox } from '../../components/game/SelectionCheckbox'
import { GameEntryContextMenu } from '../../components/game/GameEntryContextMenu'
import { ContextMenu, ContextMenuTrigger } from '../../components/ui/context-menu'
import { HoverTooltip } from '../../components/ui/hover-tooltip'
import { Skeleton } from '../../components/ui/skeleton'
import { useGameDetailSidebar } from '../../hooks/useGameDetailSidebar'
import { useEntryActionDialogs } from '../../hooks/useEntryActionDialogs'
import { useLongPress } from '../../hooks/useLongPress'
import { useSelectionStore } from '../../stores/selectionStore'
import { useScanProgress } from '../../hooks/useScanProgress'
import { useTriggerBulkCrawlMissingMetadata } from '../../hooks/useBulkCrawlMissingMetadata'
import { ScanProgressIndicator } from '../../components/layout/ScanProgressIndicator'
import { useTranslation } from '../../i18n/useTranslation'
import { invalidateFileListQueries } from '../../services/fileOpsService'
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
    // Reassigned after every move so each call reports the delta since the
    // PREVIOUS event, not since the drag started - onResize adds it to the
    // column's current width (see resizeColumn), so passing the
    // since-drag-start offset on every single pointermove tick (there are
    // many per drag) compounded it over and over, growing the column
    // without bound on the slightest movement.
    let lastX = event.clientX

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      onResize(moveEvent.clientX - lastX)
      lastX = moveEvent.clientX
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
      // The visible divider is a thin line flush with the cell's right
      // edge, but the clickable hit area is wider (w-3, extending inward
      // from that edge) - a target this short (just the header row's
      // height) and only 1px wide was hard to land a real mouse cursor on
      // precisely, which reads identically to "resize doesn't work" if the
      // drag never actually starts. Must stay flush with (not extend past)
      // the cell's own right edge - HeaderCell has `truncate`
      // (overflow: hidden), which would clip an outward-extending hit area
      // right where a user's cursor naturally lands on the boundary.
      className="group absolute right-0 top-0 z-10 flex h-full w-3 shrink-0 cursor-col-resize justify-end"
    >
      <div className="pointer-events-none h-full w-0.5 bg-muted-foreground/40 group-hover:bg-primary" />
    </div>
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
  extractedArchiveCodes: Set<string>
  columnWidths: ColumnWidths
  onOpenDetail: (entry: ScannedEntry) => void
  onExclude: (entry: ScannedEntry) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}

function Row({
  index,
  style,
  entries,
  metadataByCode,
  duplicateGroups,
  extractedArchiveCodes,
  columnWidths,
  onOpenDetail,
  onExclude,
  onRename,
  onMove,
  onDelete,
}: RowComponentProps<DetailListRowProps>) {
  const { t } = useTranslation()
  const entry = entries[index]
  const { data: userData } = useGameUserData(entry ?? { code: null, path: '' })
  const activateSelection = useSelectionStore((s) => s.activate)
  const { handlers: longPressHandlers, consumeLongPressClick } = useLongPress(() => {
    if (entry) activateSelection(entry.path)
  })
  if (!entry) return null
  const genres = entry.code ? (metadataByCode[entry.code.value]?.genres ?? []) : []
  const duplicates = getDuplicateGroupForEntry(entry, duplicateGroups)
  const archiveExtracted = isArchiveExtracted(entry, extractedArchiveCodes)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          style={style}
          {...longPressHandlers}
          className="flex cursor-pointer items-center gap-4 border-b border-border px-4 text-xs text-muted-foreground"
          onClick={() => {
            if (consumeLongPressClick()) return
            onOpenDetail(entry)
          }}
        >
          <SelectionCheckbox path={entry.path} className="h-3.5 w-3.5 shrink-0 rounded-sm" />
          <FileKindIcon kind={entry.kind} name={entry.name} className="h-3.5 w-3.5 shrink-0" />
          <HoverTooltip
            content={entry.code?.value ?? '-'}
            className="shrink-0"
            style={{ width: columnWidths.code }}
          >
            <span className="block truncate">{entry.code?.value ?? '-'}</span>
          </HoverTooltip>
          <HoverTooltip
            content={entry.name}
            className="shrink-0"
            style={{ width: columnWidths.name }}
          >
            <span className="block truncate text-foreground">{entry.name}</span>
          </HoverTooltip>
          {/* Fixed-width slot, always present (matching HeaderCell's own
              unconditional placeholder below) - this badge only renders for
              SOME rows, so without a reserved width every column after it
              (path/genres/modified/size/rating) would shift right only for
              rows that happen to have duplicates, misaligning them from
              both the header and from every other row. */}
          <span className="flex w-20 shrink-0 items-center">
            {duplicates && (
              <span
                className="flex items-center gap-0.5 rounded bg-destructive/10 px-1 py-0.5 text-destructive"
                title={t('detailList.duplicateTooltip', {
                  count: duplicates.length - 1,
                  paths: duplicates
                    .filter((d) => d.path !== entry.path)
                    .map((d) => d.path)
                    .join('\n'),
                })}
              >
                <Copy className="h-3 w-3" />
                {duplicates.length}
              </span>
            )}
            {archiveExtracted && (
              <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
                {t('game.archiveExtracted')}
              </span>
            )}
          </span>

          <HoverTooltip
            content={entry.path}
            className="shrink-0"
            style={{ width: columnWidths.path }}
          >
            <span className="block truncate">{entry.path}</span>
          </HoverTooltip>
          <HoverTooltip
            content={genres.join(', ') || t('detailList.none')}
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
      </ContextMenuTrigger>
      <GameEntryContextMenu
        entry={entry}
        onOpenDetail={onOpenDetail}
        onExclude={onExclude}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
      />
    </ContextMenu>
  )
}

export function DetailListPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const refreshFiles = (): void => invalidateFileListQueries(queryClient)
  const { data: games, isLoading, isError } = useVisibleGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('detail-list')
  const [searchQuery, setSearchQuery] = useState('')
  const [includedGenres, setIncludedGenres] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const [fileKindFilter, setFileKindFilter] = useState<FileKindFilter>('all')
  const [duplicatesOnly, setDuplicatesOnly] = useState(false)
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(DEFAULT_COLUMN_WIDTHS)

  // react-window's List sets overflowY: 'auto' on its own scroll container,
  // which per the CSS overflow spec makes the browser treat overflowX as
  // 'auto' too (an unset axis can't stay 'visible' once the other axis
  // isn't) - so the list already grows a horizontal scrollbar on its own
  // whenever a row is wider than the available width (e.g. after widening a
  // resizable column). The header row above it is a separate DOM element
  // with no scroll position of its own, so it used to overflow unclipped
  // instead of scrolling in sync - showing a second, uncoordinated
  // horizontal scrollbar (or bleeding past its own box entirely, depending
  // on ancestor overflow). headerTrackRef gets transformed to follow the
  // list's own scrollLeft instead, so there's only one real horizontal
  // scrollbar and the header always stays aligned with its columns.
  const headerTrackRef = useRef<HTMLDivElement>(null)
  const [listApi, setListApi] = useListCallbackRef(null)
  useEffect(() => {
    const el = listApi?.element
    if (!el) return
    const handleScroll = (): void => {
      if (headerTrackRef.current) {
        headerTrackRef.current.style.transform = `translateX(${-el.scrollLeft}px)`
      }
    }
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [listApi])

  // DetailList's own rows show genres as plain (non-clickable) text - this
  // only drives tag clicks inside the detail sidebar opened from a row.
  const filterByGenre = (genre: string): void => {
    setIncludedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    )
  }

  const { openDetail, detailSidebarElement } = useGameDetailSidebar(games ?? [], filterByGenre)
  const { dialogElement, openRename, openMove, openDelete } = useEntryActionDialogs()
  const excludeEntry = useExcludeEntry()
  // Matches SelectionCheckbox's own condition exactly - it renders nothing
  // at all (not just hidden) while selection mode is off, so the header
  // must skip reserving that slot too, or every row column below silently
  // ends up shifted left of its header by that unclaimed width.
  const isSelectionActive = useSelectionStore((s) => s.isActive)
  const scanProgress = useScanProgress(isLoading)

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)
  const gameCodes = (games ?? []).flatMap((g) => (g.code ? [g.code] : []))
  useTriggerBulkCrawlMissingMetadata(gameCodes)
  // Computed from the full unfiltered library, not the current search/filter
  // results - "this game has another copy elsewhere" should stay true
  // regardless of what's currently visible.
  const duplicateGroups = groupDuplicatesByCode(games ?? [])
  const extractedArchiveCodes = getExtractedArchiveCodes(games ?? [])

  const resizeColumn = (column: keyof ColumnWidths, deltaX: number): void => {
    setColumnWidths((prev) => ({
      ...prev,
      [column]: Math.max(MIN_COLUMN_WIDTH, prev[column] + deltaX),
    }))
  }

  if (isError && !games) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t('common.scanError')}
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
  const visible = duplicatesOnly
    ? sorted.filter((e) => hasDuplicateGroupForEntry(e, duplicateGroups))
    : sorted

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-[52px] flex-wrap items-center gap-2 border-b border-border px-4 py-2">
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
        <DuplicatesOnlyToggle value={duplicatesOnly} onChange={setDuplicatesOnly} />
        <LibraryVisibilityDialog />
        <PageToolbar
          sortField={sortField}
          sortDirection={sortDirection}
          onSortChange={setSort}
          onRefresh={refreshFiles}
        />
        <SelectionToolbar allEntries={visible} />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {visible.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t('common.noItemsToShow')}
            </div>
          ) : (
            <>
              <div
                style={{ height: HEADER_HEIGHT }}
                className="shrink-0 overflow-hidden border-b border-border bg-muted/40"
              >
                <div
                  ref={headerTrackRef}
                  style={{ height: HEADER_HEIGHT, width: 'max-content' }}
                  className="flex items-center gap-4 px-4"
                >
                  {isSelectionActive && <span className="h-3.5 w-3.5 shrink-0" />}
                  <span className="h-3.5 w-3.5 shrink-0" />
                  <HeaderCell
                    label={t('detailList.code')}
                    width={columnWidths.code}
                    onResize={(delta) => resizeColumn('code', delta)}
                  />
                  <HeaderCell
                    label={t('detailList.name')}
                    width={columnWidths.name}
                    onResize={(delta) => resizeColumn('name', delta)}
                  />
                  {/* Matches Row's duplicate-badge slot exactly - see the
                      comment there. */}
                  <span className="w-20 shrink-0" />
                  <HeaderCell
                    label={t('detailList.path')}
                    width={columnWidths.path}
                    onResize={(delta) => resizeColumn('path', delta)}
                  />
                  <HeaderCell
                    label={t('detailList.genres')}
                    width={columnWidths.genres}
                    onResize={(delta) => resizeColumn('genres', delta)}
                  />
                  <span className="w-24 shrink-0 text-xs font-medium">
                    {t('detailList.modified')}
                  </span>
                  <span className="w-20 shrink-0 text-xs font-medium">{t('detailList.size')}</span>
                  <span className="w-16 shrink-0 text-xs font-medium">
                    {t('detailList.rating')}
                  </span>
                </div>
              </div>
              <div className="h-full w-full">
                <AutoSizer
                  style={{ height: '100%', width: '100%' }}
                  renderProp={({ height, width }) => {
                    if (height === undefined || width === undefined) return null
                    return (
                      <List
                        listRef={setListApi}
                        rowComponent={Row}
                        rowProps={{
                          entries: visible,
                          metadataByCode,
                          duplicateGroups,
                          extractedArchiveCodes,
                          columnWidths,
                          onOpenDetail: openDetail,
                          onExclude: (entry: ScannedEntry) => excludeEntry.mutate(entry),
                          onRename: openRename,
                          onMove: openMove,
                          onDelete: openDelete,
                        }}
                        rowCount={visible.length}
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
      {dialogElement}
    </div>
  )
}
