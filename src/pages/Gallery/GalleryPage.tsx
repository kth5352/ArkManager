import { useCallback, useEffect, useRef, useState } from 'react'
import { Grid, useGridRef, type CellComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { motion } from 'framer-motion'
import { CheckCircle2, Clock, Copy, Heart, Star } from 'lucide-react'
import { useVisibleGames } from '../../hooks/useVisibleGames'
import { GameThumbnail } from '../../components/game/GameThumbnail'
import { FileKindIcon } from '../../components/game/FileKindIcon'
import { SelectionCheckbox } from '../../components/game/SelectionCheckbox'
import { GameEntryContextMenu } from '../../components/game/GameEntryContextMenu'
import { ContextMenu, ContextMenuTrigger } from '../../components/ui/context-menu'
import { useEntryActionDialogs } from '../../hooks/useEntryActionDialogs'
import { FileKindFilterToggle } from '../../components/layout/FileKindFilterToggle'
import { DuplicatesOnlyToggle } from '../../components/layout/DuplicatesOnlyToggle'
import { LibraryVisibilityDialog } from '../../components/layout/LibraryVisibilityDialog'
import { SelectionToolbar } from '../../components/layout/SelectionToolbar'
import {
  useGameUserData,
  useToggleCleared,
  useToggleFavorite,
} from '../../services/gameUserDataService'
import { useGameDetailSidebar } from '../../hooks/useGameDetailSidebar'
import { useFavoriteShortcut } from '../../hooks/useFavoriteShortcut'
import { useLongPress } from '../../hooks/useLongPress'
import { useSelectionStore } from '../../stores/selectionStore'
import { usePendingGalleryOpenStore } from '../../stores/pendingGalleryOpenStore'
import { normalizeLibraryPath } from '../../../shared/normalizeLibraryPath'
import { useScanProgress } from '../../hooks/useScanProgress'
import { useTriggerBulkCrawlMissingMetadata } from '../../hooks/useBulkCrawlMissingMetadata'
import { Skeleton } from '../../components/ui/skeleton'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { ScanProgressIndicator } from '../../components/layout/ScanProgressIndicator'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { filterEntries, type FileKindFilter } from '../../lib/filterEntries'
import { groupDuplicatesByCode } from '../../lib/groupDuplicatesByCode'
import { useGameMetadataMany } from '../../services/metadataService'
import { formatPlaytime } from '../RecentlyPlayed/formatPlaytime'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'

const CARD_WIDTH = 180
const GAP = 16
// Genre badges used to wrap onto a 2nd/3rd line with no height reserved for
// them at all (only the title/code/rating/playtime rows were accounted
// for), so react-window's fixed rowHeight cut them off - see GENRE_ROW below,
// which reserves one line and keeps the badges from wrapping in the first
// place (single-line + overflow-hidden instead of flex-wrap).
const GENRE_ROW_HEIGHT = 22
// Windows' native (non-overlay) scrollbar is ~17px wide - reserving this
// from the column-layout math keeps it from being drawn on top of the
// rightmost card whenever the grid's content overflows vertically.
const SCROLLBAR_GUTTER = 17
const CARD_TEXT_BLOCK_HEIGHT = 16 + 36 + 20 + 20 + GENRE_ROW_HEIGHT // 마지막 +20은 제목 2번째 줄분

function computeCardHeight(cardWidth: number): number {
  return cardWidth * (4 / 3) + CARD_TEXT_BLOCK_HEIGHT
}

const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.8
const ZOOM_STEP = 0.05

// Rough width of one genre badge (label + its own padding) plus the gap
// before the next one - used to decide how many badges actually fit at the
// card's current zoom level instead of always trying 3 and letting
// overflow-hidden hard-clip whichever one lands mid-way through the edge.
const GENRE_BADGE_WIDTH_ESTIMATE = 60

function GameCard({
  game,
  genres,
  cardWidth,
  duplicateCount,
  onFilterByGenre,
  onHoverChange,
  onOpenDetail,
  onRename,
  onMove,
  onDelete,
}: {
  game: ScannedEntry
  genres: string[]
  cardWidth: number
  duplicateCount: number | undefined
  onFilterByGenre: (genre: string) => void
  onHoverChange: (game: ScannedEntry | null) => void
  onOpenDetail: (game: ScannedEntry) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}) {
  const { t } = useTranslation()
  const { data: userData } = useGameUserData(game)
  const toggleFavorite = useToggleFavorite()
  const toggleCleared = useToggleCleared()
  const activateSelection = useSelectionStore((s) => s.activate)
  const { handlers: longPressHandlers, consumeLongPressClick } = useLongPress(() =>
    activateSelection(game.path)
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          {...longPressHandlers}
          onMouseEnter={() => onHoverChange(game)}
          onMouseLeave={() => onHoverChange(null)}
          onClick={() => {
            if (consumeLongPressClick()) return
            onOpenDetail(game)
          }}
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.15 }}
          className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-card"
        >
          <button
            aria-label={t('game.toggleFavorite')}
            onClick={(e) => {
              e.stopPropagation()
              toggleFavorite.mutate({ entry: game, isFavorite: !(userData?.isFavorite ?? false) })
            }}
            className="absolute right-2 top-2 z-10 rounded-full bg-background/70 p-1 text-muted-foreground hover:text-foreground"
          >
            <Heart className="h-4 w-4" fill={userData?.isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            aria-label={t('game.toggleCleared')}
            onClick={(e) => {
              e.stopPropagation()
              toggleCleared.mutate({ entry: game, isCleared: !(userData?.isCleared ?? false) })
            }}
            className="absolute right-2 top-9 z-10 rounded-full bg-background/70 p-1 text-muted-foreground hover:text-foreground"
          >
            <CheckCircle2
              className={`h-4 w-4 ${userData?.isCleared ? 'text-green-500' : ''}`}
              fill={userData?.isCleared ? 'currentColor' : 'none'}
            />
          </button>
          <div className="absolute left-2 top-2 z-10 rounded-full bg-background/70 p-1 text-muted-foreground">
            <FileKindIcon kind={game.kind} name={game.name} className="h-4 w-4" />
          </div>
          <SelectionCheckbox
            path={game.path}
            className="absolute left-2 top-9 z-10 h-4 w-4 rounded-sm"
          />
          <div className="aspect-[3/4] w-full bg-muted">
            <GameThumbnail entry={game} />
          </div>
          <div className="shrink-0 p-2">
            <p className="line-clamp-2 break-words text-sm font-medium">{game.name}</p>
            <div className="flex items-center gap-1">
              {game.code && (
                <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>
              )}
              {!!duplicateCount && (
                <span
                  title={t('game.duplicateTitle', { count: duplicateCount })}
                  className="flex shrink-0 items-center gap-0.5 rounded bg-destructive/10 px-1 text-[10px] text-destructive"
                >
                  <Copy className="h-2.5 w-2.5" />
                  {duplicateCount}
                </span>
              )}
            </div>
            {userData?.rating != null && (
              <div className="mt-0.5 flex gap-0.5">
                {[1, 2, 3, 4, 5].map((value) => (
                  <Star
                    key={value}
                    className="h-3 w-3 text-yellow-500"
                    fill={value <= (userData.rating ?? 0) ? 'currentColor' : 'none'}
                  />
                ))}
              </div>
            )}
            {!!userData?.totalPlaytimeMs && (
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatPlaytime(userData.totalPlaytimeMs, t)}
              </div>
            )}
            <div
              style={{ height: GENRE_ROW_HEIGHT }}
              className="mt-1 flex items-center gap-1 overflow-hidden"
            >
              {genres
                .slice(0, Math.max(1, Math.floor((cardWidth - 16) / GENRE_BADGE_WIDTH_ESTIMATE)))
                .map((genre) => (
                  <button
                    key={genre}
                    onClick={(e) => {
                      e.stopPropagation()
                      onFilterByGenre(genre)
                    }}
                    className="shrink-0 whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
                  >
                    {genre}
                  </button>
                ))}
            </div>
          </div>
        </motion.div>
      </ContextMenuTrigger>
      <GameEntryContextMenu
        entry={game}
        onOpenDetail={onOpenDetail}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
      />
    </ContextMenu>
  )
}

interface GridCellProps {
  games: ScannedEntry[]
  columnCount: number
  gap: number
  cardWidth: number
  metadataByCode: Record<string, { genres: string[] }>
  duplicateGroups: Map<string, ScannedEntry[]>
  onFilterByGenre: (genre: string) => void
  onHoverChange: (game: ScannedEntry | null) => void
  onOpenDetail: (game: ScannedEntry) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}

function GameCell({
  columnIndex,
  rowIndex,
  style,
  games,
  columnCount,
  gap,
  cardWidth,
  metadataByCode,
  duplicateGroups,
  onFilterByGenre,
  onHoverChange,
  onOpenDetail,
  onRename,
  onMove,
  onDelete,
}: CellComponentProps<GridCellProps>) {
  const index = rowIndex * columnCount + columnIndex
  const game = games[index]
  if (!game) return null
  const genres = game.code ? (metadataByCode[game.code.value]?.genres ?? []) : []
  const duplicateCount = game.code ? duplicateGroups.get(game.code.value)?.length : undefined
  return (
    <div style={{ ...style, padding: gap / 2, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: cardWidth }}>
        <GameCard
          game={game}
          genres={genres}
          cardWidth={cardWidth}
          duplicateCount={duplicateCount}
          onFilterByGenre={onFilterByGenre}
          onHoverChange={onHoverChange}
          onOpenDetail={onOpenDetail}
          onRename={onRename}
          onMove={onMove}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

export function GalleryPage() {
  const { t } = useTranslation()
  const { data: games, isLoading, isError } = useVisibleGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('gallery')
  const [zoom, setZoom] = useState(1)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [includedGenres, setIncludedGenres] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const [fileKindFilter, setFileKindFilter] = useState<FileKindFilter>('all')
  const [duplicatesOnly, setDuplicatesOnly] = useState(false)
  // A ref, not state - hover fires on every mouse move over the grid, and
  // its only consumer (useFavoriteShortcut, for the "press F to favorite
  // the hovered card" shortcut) only ever needs the CURRENT value at
  // keydown time, not to re-render anything. Making this state used to
  // re-render GalleryPage (rebuilding the whole filtered/sorted game list
  // and Grid cellProps) on every single mouse move across the grid.
  const hoveredGameRef = useRef<ScannedEntry | null>(null)
  const handleHoverChange = useCallback((game: ScannedEntry | null) => {
    hoveredGameRef.current = game
  }, [])

  // Clicking a tag on a card adds it to the include filter, alongside
  // whatever other tags (from other card clicks, or the SearchHeader's own
  // filter-composer input) are already active - clicking a tag that's
  // already active removes it instead, so tag clicks double as an on/off
  // toggle rather than a one-at-a-time replace.
  const filterByGenre = useCallback((genre: string) => {
    setIncludedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    )
  }, [])

  const { openDetail, detailSidebarElement } = useGameDetailSidebar(games ?? [], filterByGenre)
  const { dialogElement, openRename, openMove, openDelete } = useEntryActionDialogs()
  useFavoriteShortcut(hoveredGameRef)
  const scanProgress = useScanProgress(isLoading)

  const pendingOpenKey = usePendingGalleryOpenStore((s) => s.pendingKey)
  const clearPendingOpenKey = usePendingGalleryOpenStore((s) => s.clearPendingKey)
  useEffect(() => {
    if (!pendingOpenKey || !games) return
    const match = games.find(
      (g) => g.code?.value === pendingOpenKey || normalizeLibraryPath(g.path) === pendingOpenKey
    )
    // Only consumed once a match is actually found - clearing it
    // unconditionally used to silently drop the deep-link with no retry
    // whenever `games` was still a stale cached snapshot (e.g. right after
    // RecentlyPlayedPage/FavoritesPage navigated here for an entry that was
    // scanned moments earlier) that hadn't picked up the target entry yet.
    // Leaving it set lets this effect retry on the next `games` update
    // instead.
    if (match) {
      openDetail(match)
      clearPendingOpenKey()
    }
  }, [pendingOpenKey, games, openDetail, clearPendingOpenKey])

  // Toggling the detail sidebar or resizing the window changes the grid's
  // available width, which changes columnCount, which reflows every card
  // into a different row/column - the same pixel scrollTop then shows a
  // completely different set of games, which reads as "jumping to a random
  // position". gridRef + onCellsRendered/onResize below re-anchor the
  // scroll position to the same game (by absolute index) across a
  // columnCount change instead of leaving scrollTop untouched.
  const gridRef = useGridRef(null)
  const visibleAnchorRef = useRef({ rowStartIndex: 0, columnStartIndex: 0 })
  const prevColumnCountRef = useRef<number | null>(null)

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)
  const gameCodes = (games ?? []).flatMap((g) => (g.code ? [g.code] : []))
  useTriggerBulkCrawlMissingMetadata(gameCodes)
  const duplicateGroups = groupDuplicatesByCode(games ?? [])

  useEffect(() => {
    // `container` is a callback ref (state), not a plain object ref - this
    // div only exists in the DOM while sortedGames is non-empty (see the
    // conditional render below), so it mounts/unmounts as search/filter
    // results go in and out of empty. A plain useRef wouldn't re-trigger
    // this effect on those transitions (its deps were only `[isLoading]`),
    // permanently losing the zoom listener the first time results emptied
    // out and came back. A state-backed callback ref re-renders on every
    // attach/detach, so depending on it here keeps the listener in sync.
    if (!container) return

    const handleWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      setZoom((current) => {
        const next = event.deltaY > 0 ? current - ZOOM_STEP : current + ZOOM_STEP
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
      })
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [container])

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
        <div className="grid grid-cols-5 gap-4 p-6">
          {Array.from({ length: 15 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
          ))}
        </div>
        <ScanProgressIndicator scanned={scanProgress} />
      </div>
    )
  }

  const cardWidth = CARD_WIDTH * zoom
  const cardHeight = computeCardHeight(cardWidth)
  const gap = GAP * zoom

  const filteredGames =
    games.length > 0
      ? filterEntries(
          games,
          metadataByCode,
          searchQuery,
          includedGenres,
          excludedGenres,
          fileKindFilter
        )
      : games
  const sortedGames =
    filteredGames.length > 0 ? sortEntries(filteredGames, sortField, sortDirection) : filteredGames
  const visibleGames = duplicatesOnly
    ? sortedGames.filter((g) => g.code && duplicateGroups.has(g.code.value))
    : sortedGames

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
        <DuplicatesOnlyToggle value={duplicatesOnly} onChange={setDuplicatesOnly} />
        <LibraryVisibilityDialog />
        <PageToolbar
          sortField={sortField}
          sortDirection={sortDirection}
          onSortChange={setSort}
          zoom={zoom}
          onZoomChange={setZoom}
        />
        <SelectionToolbar allEntries={visibleGames} />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {visibleGames.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {games.length === 0 ? t('common.noGamesFound') : t('common.noItemsToShow')}
            </div>
          ) : (
            <div ref={setContainer} className="h-full w-full p-6">
              <AutoSizer
                style={{ height: '100%', width: '100%' }}
                renderProp={({ height, width }) => {
                  if (height === undefined || width === undefined) return null

                  // Columns are laid out against (width - scrollbar gutter),
                  // not the raw container width - Grid's own vertical
                  // scrollbar (native, drawn inside that same width once
                  // content overflows) would otherwise sit on top of the
                  // rightmost column instead of beside it, since the column
                  // math didn't leave it any room to render into.
                  const availableWidth = Math.max(0, width - SCROLLBAR_GUTTER)
                  const columnCount = Math.max(1, Math.floor(availableWidth / (cardWidth + gap)))
                  const usedWidth = columnCount * (cardWidth + gap)
                  const extraPerColumn =
                    columnCount > 0 ? (availableWidth - usedWidth) / columnCount : 0
                  const effectiveColumnWidth = cardWidth + gap + extraPerColumn
                  const rowCount = Math.ceil(visibleGames.length / columnCount)

                  const handleGridResize = (): void => {
                    const prevColumnCount = prevColumnCountRef.current
                    if (prevColumnCount !== null && prevColumnCount !== columnCount) {
                      const anchor = visibleAnchorRef.current
                      const anchorIndex =
                        anchor.rowStartIndex * prevColumnCount + anchor.columnStartIndex
                      const newRowIndex = Math.floor(anchorIndex / columnCount)
                      gridRef.current?.scrollToRow({
                        index: newRowIndex,
                        align: 'start',
                        behavior: 'instant',
                      })
                    }
                    prevColumnCountRef.current = columnCount
                  }

                  return (
                    <Grid
                      gridRef={gridRef}
                      cellComponent={GameCell}
                      cellProps={{
                        games: visibleGames,
                        columnCount,
                        gap,
                        cardWidth,
                        metadataByCode,
                        duplicateGroups,
                        onFilterByGenre: filterByGenre,
                        onHoverChange: handleHoverChange,
                        onOpenDetail: openDetail,
                        onRename: openRename,
                        onMove: openMove,
                        onDelete: openDelete,
                      }}
                      columnCount={columnCount}
                      columnWidth={effectiveColumnWidth}
                      rowCount={rowCount}
                      rowHeight={cardHeight + gap}
                      onCellsRendered={(visible) => {
                        visibleAnchorRef.current = visible
                      }}
                      onResize={handleGridResize}
                      style={{ height, width, overflowX: 'hidden' }}
                    />
                  )
                }}
              />
            </div>
          )}
        </div>
        {detailSidebarElement}
      </div>
      {dialogElement}
    </div>
  )
}
