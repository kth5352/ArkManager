import { useState } from 'react'
import { List, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { Clock, Copy, Heart, Star } from 'lucide-react'
import { useVisibleGames } from '../../hooks/useVisibleGames'
import { GameThumbnail } from '../../components/game/GameThumbnail'
import { FileKindIcon } from '../../components/game/FileKindIcon'
import { SelectionCheckbox } from '../../components/game/SelectionCheckbox'
import { FileKindFilterToggle } from '../../components/layout/FileKindFilterToggle'
import { LibraryVisibilityDialog } from '../../components/layout/LibraryVisibilityDialog'
import { SelectionToolbar } from '../../components/layout/SelectionToolbar'
import { useOpenExternal } from '../../services/shellService'
import { useGameUserData, useToggleFavorite } from '../../services/gameUserDataService'
import { useGameDetailSidebar } from '../../hooks/useGameDetailSidebar'
import { useFavoriteShortcut } from '../../hooks/useFavoriteShortcut'
import { useLongPress } from '../../hooks/useLongPress'
import { useSelectionStore } from '../../stores/selectionStore'
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

const ROW_HEIGHT = 84 // 64 + 20 (제목 2번째 줄분)

function formatMtime(mtimeMs: number): string {
  const date = new Date(mtimeMs)
  return date.toISOString().slice(0, 10)
}

function GameRow({
  game,
  genres,
  duplicateCount,
  onFilterByGenre,
  onOpenDetail,
  onHoverChange,
}: {
  game: ScannedEntry
  genres: string[]
  duplicateCount: number | undefined
  onFilterByGenre: (genre: string) => void
  onOpenDetail: (game: ScannedEntry) => void
  onHoverChange: (game: ScannedEntry | null) => void
}) {
  const { data: userData } = useGameUserData(game)
  const toggleFavorite = useToggleFavorite()
  const openExternal = useOpenExternal()
  const activateSelection = useSelectionStore((s) => s.activate)
  const { handlers: longPressHandlers, consumeLongPressClick } = useLongPress(() =>
    activateSelection(game.path)
  )

  return (
    <div
      {...longPressHandlers}
      className="flex cursor-pointer items-center gap-4 border-b border-border px-4 py-2 transition-colors hover:bg-accent"
      onClick={() => {
        if (consumeLongPressClick()) return
        onOpenDetail(game)
      }}
      onMouseEnter={() => onHoverChange(game)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <SelectionCheckbox path={game.path} className="h-4 w-4 shrink-0 rounded-sm" />
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
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
        <GameThumbnail entry={game} />
        <div className="absolute bottom-0.5 right-0.5 rounded-full bg-background/70 p-0.5 text-muted-foreground">
          <FileKindIcon kind={game.kind} name={game.name} className="h-3 w-3" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 line-clamp-2 break-words text-sm font-medium">{game.name}</p>
          {genres.length > 0 && (
            <div className="flex shrink-0 gap-1">
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
        <div className="flex items-center gap-1">
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
      {!!userData?.totalPlaytimeMs && (
        <span className="flex w-20 shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatPlaytime(userData.totalPlaytimeMs)}
        </span>
      )}
    </div>
  )
}

interface ListRowProps {
  games: ScannedEntry[]
  metadataByCode: Record<string, { genres: string[] }>
  duplicateGroups: Map<string, ScannedEntry[]>
  onFilterByGenre: (genre: string) => void
  onOpenDetail: (game: ScannedEntry) => void
  onHoverChange: (game: ScannedEntry | null) => void
}

function Row({
  index,
  style,
  games,
  metadataByCode,
  duplicateGroups,
  onFilterByGenre,
  onOpenDetail,
  onHoverChange,
}: RowComponentProps<ListRowProps>) {
  const game = games[index]
  if (!game) return null
  const genres = game.code ? (metadataByCode[game.code.value]?.genres ?? []) : []
  const duplicateCount = game.code ? duplicateGroups.get(game.code.value)?.length : undefined
  return (
    <div style={style}>
      <GameRow
        game={game}
        genres={genres}
        duplicateCount={duplicateCount}
        onFilterByGenre={onFilterByGenre}
        onOpenDetail={onOpenDetail}
        onHoverChange={onHoverChange}
      />
    </div>
  )
}

export function ListPage() {
  const { data: games, isLoading, isError } = useVisibleGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [includedGenres, setIncludedGenres] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const [fileKindFilter, setFileKindFilter] = useState<FileKindFilter>('all')
  const [hoveredGame, setHoveredGame] = useState<ScannedEntry | null>(null)

  // Clicking a tag on a row adds it to the include filter alongside
  // whatever's already active (other tag clicks, or SearchHeader's own
  // filter-composer input) - clicking an already-active tag removes it,
  // so tag clicks double as an on/off toggle rather than a one-at-a-time
  // replace.
  const filterByGenre = (genre: string): void => {
    setIncludedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    )
  }

  const { openDetail, detailSidebarElement } = useGameDetailSidebar(games ?? [], filterByGenre)
  useFavoriteShortcut(hoveredGame)
  const scanProgress = useScanProgress(isLoading)

  const codes = (games ?? []).flatMap((g) => (g.code ? [g.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)
  const gameCodes = (games ?? []).flatMap((g) => (g.code ? [g.code] : []))
  useTriggerBulkCrawlMissingMetadata(gameCodes)
  const duplicateGroups = groupDuplicatesByCode(games ?? [])

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
        <div className="flex flex-col gap-2 p-6">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
        <ScanProgressIndicator scanned={scanProgress} />
      </div>
    )
  }

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
        <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
        <SelectionToolbar allEntries={sortedGames} />
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
                        duplicateGroups,
                        onFilterByGenre: filterByGenre,
                        onOpenDetail: openDetail,
                        onHoverChange: setHoveredGame,
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
        </div>
        {detailSidebarElement}
      </div>
    </div>
  )
}
