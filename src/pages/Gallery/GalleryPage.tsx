import { useEffect, useRef, useState } from 'react'
import { Grid, type CellComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { motion } from 'framer-motion'
import { useGames } from '../../services/useGames'
import { useThumbnail } from '../../services/thumbnailService'
import { Skeleton } from '../../components/ui/skeleton'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import type { GameEntry } from '../../../shared/types/scanner'

const CARD_WIDTH = 180
const GAP = 16
const CARD_TEXT_BLOCK_HEIGHT = 16 + 36 + 20

function computeCardHeight(cardWidth: number): number {
  return cardWidth * (4 / 3) + CARD_TEXT_BLOCK_HEIGHT
}

const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.8
const ZOOM_STEP = 0.05

function GameCard({ game }: { game: GameEntry }) {
  const { data: thumbnail } = useThumbnail(game.path, game.kind)

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.15 }}
      className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <div className="aspect-[3/4] w-full bg-muted">
        {thumbnail && (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <div className="shrink-0 p-2">
        <p className="truncate text-sm font-medium">{game.name}</p>
        <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>
      </div>
    </motion.div>
  )
}

interface GridCellProps {
  games: GameEntry[]
  columnCount: number
  gap: number
}

function GameCell({
  columnIndex,
  rowIndex,
  style,
  games,
  columnCount,
  gap,
}: CellComponentProps<GridCellProps>) {
  const index = rowIndex * columnCount + columnIndex
  const game = games[index]
  if (!game) return null
  return (
    <div style={{ ...style, padding: gap / 2 }}>
      <GameCard game={game} />
    </div>
  )
}

export function GalleryPage() {
  const { data: games, isLoading } = useGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('gallery')
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)

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

  const sortedGames = games.length > 0 ? sortEntries(games, sortField, sortDirection) : games

  return (
    <div className="flex h-full flex-col">
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
              const rowCount = Math.ceil(sortedGames.length / columnCount)

              return (
                <Grid
                  cellComponent={GameCell}
                  cellProps={{ games: sortedGames, columnCount, gap }}
                  columnCount={columnCount}
                  columnWidth={cardWidth + gap}
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
  )
}
