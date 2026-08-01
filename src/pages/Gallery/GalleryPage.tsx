import { useEffect, useState } from 'react'
import { Grid, type CellComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { motion } from 'framer-motion'
import { Clock, Copy, Heart, Star } from 'lucide-react'
import { useVisibleGames } from '../../hooks/useVisibleGames'
import { GameThumbnail } from '../../components/game/GameThumbnail'
import { FileKindIcon } from '../../components/game/FileKindIcon'
import { FileKindFilterToggle } from '../../components/layout/FileKindFilterToggle'
import { LibraryVisibilityDialog } from '../../components/layout/LibraryVisibilityDialog'
import { useGameUserData, useToggleFavorite } from '../../services/gameUserDataService'
import { useGameDetailSidebar } from '../../hooks/useGameDetailSidebar'
import { useFavoriteShortcut } from '../../hooks/useFavoriteShortcut'
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
import type { ScannedEntry } from '../../../shared/types/scanner'

const CARD_WIDTH = 180
const GAP = 16
const CARD_TEXT_BLOCK_HEIGHT = 16 + 36 + 20 + 20 // 마지막 +20은 제목 2번째 줄분

function computeCardHeight(cardWidth: number): number {
  return cardWidth * (4 / 3) + CARD_TEXT_BLOCK_HEIGHT
}

const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.8
const ZOOM_STEP = 0.05

function GameCard({
  game,
  genres,
  duplicateCount,
  onFilterByGenre,
  onHoverChange,
  onOpenDetail,
}: {
  game: ScannedEntry
  genres: string[]
  duplicateCount: number | undefined
  onFilterByGenre: (genre: string) => void
  onHoverChange: (game: ScannedEntry | null) => void
  onOpenDetail: (game: ScannedEntry) => void
}) {
  const { data: userData } = useGameUserData(game)
  const toggleFavorite = useToggleFavorite()

  return (
    <motion.div
      onMouseEnter={() => onHoverChange(game)}
      onMouseLeave={() => onHoverChange(null)}
      onClick={() => onOpenDetail(game)}
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.15 }}
      className="relative flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <button
        aria-label="즐겨찾기 토글"
        onClick={(e) => {
          e.stopPropagation()
          toggleFavorite.mutate({ entry: game, isFavorite: !(userData?.isFavorite ?? false) })
        }}
        className="absolute right-2 top-2 z-10 rounded-full bg-background/70 p-1 text-muted-foreground hover:text-foreground"
      >
        <Heart className="h-4 w-4" fill={userData?.isFavorite ? 'currentColor' : 'none'} />
      </button>
      <div className="absolute left-2 top-2 z-10 rounded-full bg-background/70 p-1 text-muted-foreground">
        <FileKindIcon kind={game.kind} name={game.name} className="h-4 w-4" />
      </div>
      <div className="aspect-[3/4] w-full bg-muted">
        <GameThumbnail entry={game} />
      </div>
      <div className="shrink-0 p-2">
        <p className="line-clamp-2 break-words text-sm font-medium">{game.name}</p>
        <div className="flex items-center gap-1">
          {game.code && <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>}
          {!!duplicateCount && (
            <span
              title={`같은 코드의 파일이 ${duplicateCount}개 있습니다.`}
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
            {formatPlaytime(userData.totalPlaytimeMs)}
          </div>
        )}
        {genres.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {genres.slice(0, 3).map((genre) => (
              <button
                key={genre}
                onClick={(e) => {
                  e.stopPropagation()
                  onFilterByGenre(genre)
                }}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
              >
                {genre}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
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
          duplicateCount={duplicateCount}
          onFilterByGenre={onFilterByGenre}
          onHoverChange={onHoverChange}
          onOpenDetail={onOpenDetail}
        />
      </div>
    </div>
  )
}

export function GalleryPage() {
  const { data: games, isLoading, isError } = useVisibleGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('gallery')
  const [zoom, setZoom] = useState(1)
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [includedGenres, setIncludedGenres] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const [fileKindFilter, setFileKindFilter] = useState<FileKindFilter>('all')
  const [hoveredGame, setHoveredGame] = useState<ScannedEntry | null>(null)
  const { openDetail, detailSidebarElement } = useGameDetailSidebar(games ?? [])
  useFavoriteShortcut(hoveredGame)
  const scanProgress = useScanProgress(isLoading)

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)
  const gameCodes = (games ?? []).flatMap((g) => (g.code ? [g.code] : []))
  useTriggerBulkCrawlMissingMetadata(gameCodes)
  const duplicateGroups = groupDuplicatesByCode(games ?? [])

  // Clicking a tag on a card is a quick "show me only this" shortcut, not
  // an incremental toggle - it replaces whatever include filter was active
  // (the SearchHeader's own filter-composer input, below, is additive and
  // meant for building up several terms deliberately).
  const filterByGenre = (genre: string): void => {
    setIncludedGenres([genre])
  }

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
        라이브러리를 스캔하는 중 오류가 발생했습니다.
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
        <PageToolbar
          sortField={sortField}
          sortDirection={sortDirection}
          onSortChange={setSort}
          zoom={zoom}
          onZoomChange={setZoom}
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {sortedGames.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {games.length === 0
                ? '등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.'
                : '표시할 항목이 없습니다.'}
            </div>
          ) : (
            <div ref={setContainer} className="h-full w-full p-6">
              <AutoSizer
                style={{ height: '100%', width: '100%' }}
                renderProp={({ height, width }) => {
                  if (height === undefined || width === undefined) return null

                  const columnCount = Math.max(1, Math.floor(width / (cardWidth + gap)))
                  const usedWidth = columnCount * (cardWidth + gap)
                  const extraPerColumn = columnCount > 0 ? (width - usedWidth) / columnCount : 0
                  const effectiveColumnWidth = cardWidth + gap + extraPerColumn
                  const rowCount = Math.ceil(sortedGames.length / columnCount)

                  return (
                    <Grid
                      cellComponent={GameCell}
                      cellProps={{
                        games: sortedGames,
                        columnCount,
                        gap,
                        cardWidth,
                        metadataByCode,
                        duplicateGroups,
                        onFilterByGenre: filterByGenre,
                        onHoverChange: setHoveredGame,
                        onOpenDetail: openDetail,
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
          )}
        </div>
        {detailSidebarElement}
      </div>
    </div>
  )
}
