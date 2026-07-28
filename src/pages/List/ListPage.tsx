import { List, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { Heart } from 'lucide-react'
import { useGames } from '../../services/useGames'
import { useThumbnail } from '../../services/thumbnailService'
import { useOpenExternal } from '../../services/shellService'
import { useGameUserData, useToggleFavorite } from '../../services/gameUserDataService'
import { Skeleton } from '../../components/ui/skeleton'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import type { ScannedEntry } from '../../../shared/types/scanner'

const ROW_HEIGHT = 64

function formatMtime(mtimeMs: number): string {
  const date = new Date(mtimeMs)
  return date.toISOString().slice(0, 10)
}

function GameRow({ game }: { game: ScannedEntry }) {
  const { data: thumbnail } = useThumbnail(game.path, game.kind)
  const { data: userData } = useGameUserData(game)
  const toggleFavorite = useToggleFavorite()
  const openExternal = useOpenExternal()

  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-2 transition-colors hover:bg-accent">
      <button
        aria-label="즐겨찾기 토글"
        onClick={() =>
          toggleFavorite.mutate({ entry: game, isFavorite: !(userData?.isFavorite ?? false) })
        }
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <Heart className="h-4 w-4" fill={userData?.isFavorite ? 'currentColor' : 'none'} />
      </button>
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
        {thumbnail && (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{game.name}</p>
        {game.code ? (
          <button
            className="truncate text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => game.code && openExternal.mutate(game.code)}
          >
            {game.code.value}
          </button>
        ) : (
          <p className="truncate text-xs text-muted-foreground">코드없음</p>
        )}
      </div>
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {formatMtime(game.mtimeMs)}
      </span>
    </div>
  )
}

interface ListRowProps {
  games: ScannedEntry[]
}

function Row({ index, style, games }: RowComponentProps<ListRowProps>) {
  const game = games[index]
  if (!game) return null
  return (
    <div style={style}>
      <GameRow game={game} />
    </div>
  )
}

export function ListPage() {
  const { data: games, isLoading } = useGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('list')

  if (isLoading || !games) {
    return (
      <div className="flex flex-col gap-2 p-6">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    )
  }

  const sortedGames = games.length > 0 ? sortEntries(games, sortField, sortDirection) : games

  return (
    <div className="flex h-full flex-col">
      <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
      {sortedGames.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.
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
                  rowProps={{ games: sortedGames }}
                  rowCount={sortedGames.length}
                  rowHeight={ROW_HEIGHT}
                  style={{ height, width }}
                />
              )
            }}
          />
        </div>
      )}
    </div>
  )
}
