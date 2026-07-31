import { useState } from 'react'
import { List, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { Heart, Star } from 'lucide-react'
import { useGames } from '../../services/useGames'
import { useThumbnail } from '../../services/thumbnailService'
import { useOpenExternal } from '../../services/shellService'
import { useGameUserData, useToggleFavorite } from '../../services/gameUserDataService'
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
import { Skeleton } from '../../components/ui/skeleton'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
import { filterEntries } from '../../lib/filterEntries'
import { useGameMetadataMany } from '../../services/metadataService'
import type { ScannedEntry } from '../../../shared/types/scanner'

const ROW_HEIGHT = 64

function formatMtime(mtimeMs: number): string {
  const date = new Date(mtimeMs)
  return date.toISOString().slice(0, 10)
}

function GameRow({
  game,
  genres,
  onToggleGenreFilter,
  onOpenDetail,
}: {
  game: ScannedEntry
  genres: string[]
  onToggleGenreFilter: (genre: string) => void
  onOpenDetail: (game: ScannedEntry) => void
}) {
  const { data: thumbnail } = useThumbnail(game.path, game.kind)
  const { data: userData } = useGameUserData(game)
  const toggleFavorite = useToggleFavorite()
  const openExternal = useOpenExternal()

  return (
    <div
      className="flex cursor-pointer items-center gap-4 border-b border-border px-4 py-2 transition-colors hover:bg-accent"
      onClick={() => onOpenDetail(game)}
    >
      <button
        aria-label="즐겨찾기 토글"
        onClick={(e) => {
          e.stopPropagation()
          toggleFavorite.mutate({ entry: game, isFavorite: !(userData?.isFavorite ?? false) })
        }}
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
        <div className="flex items-center gap-2">
          <p className="min-w-0 truncate text-sm font-medium">{game.name}</p>
          {genres.length > 0 && (
            <div className="flex shrink-0 gap-1">
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
        {game.code ? (
          <button
            className="truncate text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={(e) => {
              e.stopPropagation()
              if (game.code) openExternal.mutate(game.code)
            }}
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
      {userData?.rating != null && (
        <div className="flex w-16 shrink-0 gap-0.5">
          {[1, 2, 3, 4, 5].map((value) => (
            <Star
              key={value}
              className="h-3 w-3 text-yellow-500"
              fill={value <= (userData.rating ?? 0) ? 'currentColor' : 'none'}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ListRowProps {
  games: ScannedEntry[]
  metadataByCode: Record<string, { genres: string[] }>
  onToggleGenreFilter: (genre: string) => void
  onOpenDetail: (game: ScannedEntry) => void
}

function Row({
  index,
  style,
  games,
  metadataByCode,
  onToggleGenreFilter,
  onOpenDetail,
}: RowComponentProps<ListRowProps>) {
  const game = games[index]
  if (!game) return null
  const genres = game.code ? (metadataByCode[game.code.value]?.genres ?? []) : []
  return (
    <div style={style}>
      <GameRow
        game={game}
        genres={genres}
        onToggleGenreFilter={onToggleGenreFilter}
        onOpenDetail={onOpenDetail}
      />
    </div>
  )
}

export function ListPage() {
  const { data: games, isLoading, isError } = useGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const { openDetail, detailOverlayElement } = useGameDetailOverlay(games ?? [])

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

  const toggleGenreFilter = (genre: string): void => {
    setExcludedGenres((current) =>
      current.includes(genre) ? current.filter((g) => g !== genre) : [...current, genre]
    )
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
      <div className="flex flex-col gap-2 p-6">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    )
  }

  const filteredGames =
    games.length > 0 ? filterEntries(games, metadataByCode, searchQuery, excludedGenres) : games
  const sortedGames =
    filteredGames.length > 0 ? sortEntries(filteredGames, sortField, sortDirection) : filteredGames

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <SearchHeader
          query={searchQuery}
          onQueryChange={setSearchQuery}
          excludedGenres={excludedGenres}
          onClearFilters={() => setExcludedGenres([])}
        />
        <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
      </div>
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
                  rowProps={{
                    games: sortedGames,
                    metadataByCode,
                    onToggleGenreFilter: toggleGenreFilter,
                    onOpenDetail: openDetail,
                  }}
                  rowCount={sortedGames.length}
                  rowHeight={ROW_HEIGHT}
                  style={{ height, width }}
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
