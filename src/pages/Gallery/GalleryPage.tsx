import { useEffect, useRef, useState } from 'react'
import { Grid, type CellComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { motion } from 'framer-motion'
import { useGames } from '../../services/useGames'
import { Skeleton } from '../../components/ui/skeleton'
import type { MockGame } from '../../services/mockGames'

const CARD_WIDTH = 180
const GAP = 16

// Fixed (non-scaling) portions of card height: p-2 vertical padding (8px * 2 = 16px),
// plus title (text-sm, 1.25rem/20px line-height) and circle name (text-xs, 1rem/16px
// line-height) = 36px text, plus ~20px slack so the text block is never a hairline fit.
const CARD_TEXT_BLOCK_HEIGHT = 16 + 36 + 20

// Height budget: aspect-[3/4] cover image scales with card width (width * 4/3), plus the
// fixed text block above. At the default CARD_WIDTH=180 this yields 180*(4/3) + 72 = 312,
// matching the original fixed CARD_HEIGHT of 312.
function computeCardHeight(cardWidth: number): number {
  return cardWidth * (4 / 3) + CARD_TEXT_BLOCK_HEIGHT
}

const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.8
const ZOOM_STEP = 0.05

function GameCard({ game }: { game: MockGame }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.15 }}
      className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <div className="aspect-[3/4] w-full bg-muted" />
      <div className="shrink-0 p-2">
        <p className="truncate text-sm font-medium">{game.title}</p>
        <p className="truncate text-xs text-muted-foreground">{game.circle}</p>
      </div>
    </motion.div>
  )
}

interface GridCellProps {
  games: MockGame[]
  columnCount: number
  gap: number
}

function GameCell({ columnIndex, rowIndex, style, games, columnCount, gap }: CellComponentProps<GridCellProps>) {
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
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)

  // Ctrl+wheel zoom must be a native (non-passive) listener: React attaches its
  // synthetic `onWheel` handler as a passive listener by default, so calling
  // event.preventDefault() from a React onWheel prop would be silently ignored
  // (and log a console warning) instead of suppressing Chromium/Electron's
  // built-in Ctrl+wheel page-zoom gesture.
  //
  // Depends on `isLoading`: the ref-bearing container only exists in the "loaded"
  // JSX branch below (the loading-skeleton branch renders a different, ref-less
  // tree). With an empty dependency array this effect would run exactly once,
  // immediately after the *first* commit — which, on a cold app boot, is the
  // loading-skeleton commit where `containerRef.current` is still null, forever
  // skipping listener attachment for this component instance. Re-running when
  // `isLoading` flips to false ensures the listener attaches once the real
  // container has mounted.
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

  return (
    <div ref={containerRef} className="h-full w-full p-6">
      <AutoSizer
        style={{ height: '100%', width: '100%' }}
        renderProp={({ height, width }) => {
          if (height === undefined || width === undefined) return null

          const columnCount = Math.max(1, Math.floor(width / (cardWidth + gap)))
          const rowCount = Math.ceil(games.length / columnCount)

          return (
            <Grid
              cellComponent={GameCell}
              cellProps={{ games, columnCount, gap }}
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
  )
}
