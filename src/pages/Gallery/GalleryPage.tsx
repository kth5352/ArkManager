import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Grid, type CellComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { motion } from 'framer-motion'
import { Heart, Star } from 'lucide-react'
import { useGames } from '../../services/useGames'
import { useThumbnail } from '../../services/thumbnailService'
import {
  useGameUserData,
  useToggleFavorite,
  userDataQueryKey,
} from '../../services/gameUserDataService'
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
import { Skeleton } from '../../components/ui/skeleton'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { filterEntries } from '../../lib/filterEntries'
import { useGameMetadataMany } from '../../services/metadataService'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { GameUserDataDto } from '../../../shared/types/ipc'

const CARD_WIDTH = 180
const GAP = 16
const CARD_TEXT_BLOCK_HEIGHT = 16 + 36 + 20

function computeCardHeight(cardWidth: number): number {
  return cardWidth * (4 / 3) + CARD_TEXT_BLOCK_HEIGHT
}

const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.8
const ZOOM_STEP = 0.05

function GameCard({
  game,
  genres,
  onToggleGenreFilter,
  onHoverChange,
  onOpenDetail,
}: {
  game: ScannedEntry
  genres: string[]
  onToggleGenreFilter: (genre: string) => void
  onHoverChange: (game: ScannedEntry | null) => void
  onOpenDetail: (game: ScannedEntry) => void
}) {
  const { data: thumbnail } = useThumbnail(game.path, game.kind)
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
      <div className="aspect-[3/4] w-full bg-muted">
        {thumbnail && (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <div className="shrink-0 p-2">
        <p className="truncate text-sm font-medium">{game.name}</p>
        {game.code && <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>}
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
        {genres.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {genres.slice(0, 3).map((genre) => (
              <button
                key={genre}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleGenreFilter(genre)
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
  onToggleGenreFilter: (genre: string) => void
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
  onToggleGenreFilter,
  onHoverChange,
  onOpenDetail,
}: CellComponentProps<GridCellProps>) {
  const index = rowIndex * columnCount + columnIndex
  const game = games[index]
  if (!game) return null
  const genres = game.code ? (metadataByCode[game.code.value]?.genres ?? []) : []
  return (
    <div style={{ ...style, padding: gap / 2, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: cardWidth }}>
        <GameCard
          game={game}
          genres={genres}
          onToggleGenreFilter={onToggleGenreFilter}
          onHoverChange={onHoverChange}
          onOpenDetail={onOpenDetail}
        />
      </div>
    </div>
  )
}

export function GalleryPage() {
  const { data: games, isLoading, isError } = useGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('gallery')
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const [hoveredGame, setHoveredGame] = useState<ScannedEntry | null>(null)
  const toggleFavoriteShortcut = useToggleFavorite()
  const queryClient = useQueryClient()
  const { openDetail, detailOverlayElement } = useGameDetailOverlay()

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

  const toggleGenreFilter = (genre: string): void => {
    setExcludedGenres((current) =>
      current.includes(genre) ? current.filter((g) => g !== genre) : [...current, genre]
    )
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'f' || event.ctrlKey || event.altKey) return
      if (!hoveredGame) return
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return // 검색창 입력 중엔 무시
      event.preventDefault()
      const cached = queryClient.getQueryData<GameUserDataDto | null>(userDataQueryKey(hoveredGame))
      toggleFavoriteShortcut.mutate({
        entry: hoveredGame,
        isFavorite: !(cached?.isFavorite ?? false),
      })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hoveredGame, toggleFavoriteShortcut, queryClient])

  useEffect(() => {
    const container = containerRef.current
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
  }, [isLoading])

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        라이브러리를 스캔하는 중 오류가 발생했습니다.
      </div>
    )
  }

  if (isLoading || !games) {
    return (
      <div className="grid grid-cols-5 gap-4 p-6">
        {Array.from({ length: 15 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
        ))}
      </div>
    )
  }

  const cardWidth = CARD_WIDTH * zoom
  const cardHeight = computeCardHeight(cardWidth)
  const gap = GAP * zoom

  const filteredGames =
    games.length > 0 ? filterEntries(games, metadataByCode, searchQuery, excludedGenres) : games
  const sortedGames =
    filteredGames.length > 0 ? sortEntries(filteredGames, sortField, sortDirection) : filteredGames

  return (
    <div className="flex h-full flex-col">
      <SearchHeader
        query={searchQuery}
        onQueryChange={setSearchQuery}
        excludedGenres={excludedGenres}
        onClearFilters={() => setExcludedGenres([])}
      />
      <PageToolbar
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={setSort}
        zoom={zoom}
        onZoomChange={setZoom}
      />
      {sortedGames.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.
        </div>
      ) : (
        <div ref={containerRef} className="h-full w-full p-6">
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
                    onToggleGenreFilter: toggleGenreFilter,
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
      {detailOverlayElement}
    </div>
  )
}
