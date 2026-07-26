import { Grid, type CellComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { motion } from 'framer-motion'
import { useGames } from '../../services/useGames'
import { Skeleton } from '../../components/ui/skeleton'
import type { MockGame } from '../../services/mockGames'

const CARD_WIDTH = 180
const CARD_HEIGHT = 260
const GAP = 16

function GameCard({ game }: { game: MockGame }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.15 }}
      className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <div className="aspect-[3/4] w-full bg-muted" />
      <div className="p-2">
        <p className="truncate text-sm font-medium">{game.title}</p>
        <p className="truncate text-xs text-muted-foreground">{game.circle}</p>
      </div>
    </motion.div>
  )
}

interface GridCellProps {
  games: MockGame[]
  columnCount: number
}

function GameCell({ columnIndex, rowIndex, style, games, columnCount }: CellComponentProps<GridCellProps>) {
  const index = rowIndex * columnCount + columnIndex
  const game = games[index]
  if (!game) return null
  return (
    <div style={{ ...style, padding: GAP / 2 }}>
      <GameCard game={game} />
    </div>
  )
}

export function GalleryPage() {
  const { data: games, isLoading } = useGames()

  if (isLoading || !games) {
    return (
      <div className="grid grid-cols-5 gap-4 p-6">
        {Array.from({ length: 15 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
        ))}
      </div>
    )
  }

  return (
    <div className="h-full w-full p-6">
      <AutoSizer
        style={{ height: '100%', width: '100%' }}
        renderProp={({ height, width }) => {
          if (height === undefined || width === undefined) return null

          const columnCount = Math.max(1, Math.floor(width / (CARD_WIDTH + GAP)))
          const rowCount = Math.ceil(games.length / columnCount)

          return (
            <Grid
              cellComponent={GameCell}
              cellProps={{ games, columnCount }}
              columnCount={columnCount}
              columnWidth={CARD_WIDTH + GAP}
              rowCount={rowCount}
              rowHeight={CARD_HEIGHT + GAP}
              style={{ height, width }}
            />
          )
        }}
      />
    </div>
  )
}
