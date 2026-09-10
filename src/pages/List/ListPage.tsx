import { useCallback, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { List, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { CheckCircle2, Clock, Copy, Heart, Star } from 'lucide-react'
import { useVisibleGames } from '../../hooks/useVisibleGames'
import { GameThumbnail } from '../../components/game/GameThumbnail'
import { FileKindIcon } from '../../components/game/FileKindIcon'
import { SelectionCheckbox } from '../../components/game/SelectionCheckbox'
import { GameEntryContextMenu } from '../../components/game/GameEntryContextMenu'
import { AddToSavedPlaylistDialog } from '../../components/media/AddToSavedPlaylistDialog'
import { ContextMenu, ContextMenuTrigger } from '../../components/ui/context-menu'
import { useEntryActionDialogs } from '../../hooks/useEntryActionDialogs'
import { FileKindFilterToggle } from '../../components/layout/FileKindFilterToggle'
import { DuplicatesOnlyToggle } from '../../components/layout/DuplicatesOnlyToggle'
import { LibraryVisibilityDialog } from '../../components/layout/LibraryVisibilityDialog'
import { SelectionToolbar } from '../../components/layout/SelectionToolbar'
import { useOpenExternal } from '../../services/shellService'
import {
  useGameUserData,
  useToggleCleared,
  useToggleFavorite,
} from '../../services/gameUserDataService'
import { useGameDetailSidebar } from '../../hooks/useGameDetailSidebar'
import { useFavoriteShortcut } from '../../hooks/useFavoriteShortcut'
import { useLongPress } from '../../hooks/useLongPress'
import { useConfirmedPulse } from '../../hooks/useConfirmedPulse'
import { useSelectionStore } from '../../stores/selectionStore'
import { appToast } from '../../lib/appToast'
import { cn } from '../../lib/utils'
import { useScanProgress } from '../../hooks/useScanProgress'
import { useTriggerBulkCrawlMissingMetadata } from '../../hooks/useBulkCrawlMissingMetadata'
import { Skeleton } from '../../components/ui/skeleton'
import { PageToolbar } from '../../components/layout/PageToolbar'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { ScanProgressIndicator } from '../../components/layout/ScanProgressIndicator'
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
import { useGameMetadataMany } from '../../services/metadataService'
import { useExcludeEntry } from '../../services/excludedEntriesService'
import { formatPlaytime } from '../RecentlyPlayed/formatPlaytime'
import { useTranslation } from '../../i18n/useTranslation'
import { invalidateFileListQueries } from '../../services/fileOpsService'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { MediaPlaylistTrackDto } from '../../../shared/types/ipc'

const ROW_HEIGHT = 84 // 64 + 20 (제목 2번째 줄분)

function formatMtime(mtimeMs: number): string {
  const date = new Date(mtimeMs)
  return date.toISOString().slice(0, 10)
}

function GameRow({
  game,
  genres,
  circle,
  workType,
  duplicateCount,
  archiveExtracted,
  onFilterByGenre,
  onSearchCircle,
  onOpenDetail,
  onHoverChange,
  onExclude,
  onAddToSavedPlaylist,
  onRename,
  onMove,
  onDelete,
}: {
  game: ScannedEntry
  genres: string[]
  circle: string | null
  workType: string | null
  duplicateCount: number | undefined
  archiveExtracted: boolean
  onFilterByGenre: (genre: string) => void
  onSearchCircle: (circle: string) => void
  onOpenDetail: (game: ScannedEntry) => void
  onHoverChange: (game: ScannedEntry | null) => void
  onExclude: (entry: ScannedEntry) => void
  onAddToSavedPlaylist: (tracks: MediaPlaylistTrackDto[]) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}) {
  const { t } = useTranslation()
  const { data: userData } = useGameUserData(game)
  const toggleFavorite = useToggleFavorite()
  const toggleCleared = useToggleCleared()
  const openExternal = useOpenExternal()
  const activateSelection = useSelectionStore((s) => s.activate)
  // Rows get background/ring treatment only, per design §3 ("행 자체의
  // transform/height 변경은 하지 않는다") - unlike Gallery's card, nothing
  // here scales or resizes on selection/hover.
  const isSelected = useSelectionStore((s) => s.selectedPaths.has(game.path))
  const { handlers: longPressHandlers, consumeLongPressClick } = useLongPress(() =>
    activateSelection(game.path)
  )
  const favoritePulse = useConfirmedPulse(userData?.isFavorite ?? false, userData !== undefined)
  const clearedPulse = useConfirmedPulse(userData?.isCleared ?? false, userData !== undefined)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          {...longPressHandlers}
          className={cn(
            'flex cursor-pointer items-center gap-4 border-b border-border px-4 py-2 transition-colors hover:bg-accent',
            isSelected && 'bg-primary/10'
          )}
          onClick={() => {
            if (consumeLongPressClick()) return
            onOpenDetail(game)
          }}
          onMouseEnter={() => onHoverChange(game)}
          onMouseLeave={() => onHoverChange(null)}
        >
          <SelectionCheckbox path={game.path} className="h-4 w-4 shrink-0 rounded-sm" />
          <button
            aria-label={t('game.toggleFavorite')}
            onClick={(e) => {
              e.stopPropagation()
              const isFavorite = !(userData?.isFavorite ?? false)
              toggleFavorite.mutate(
                { entry: game, isFavorite },
                { onError: () => appToast.error(t('game.toggleFavoriteFailed')) }
              )
            }}
            className={cn(
              'shrink-0 text-muted-foreground transition-[color,transform] duration-120 hover:text-foreground active:scale-[0.9] motion-reduce:transform-none',
              favoritePulse && '[animation:icon-pulse_180ms_ease-in-out] motion-reduce:animate-none'
            )}
          >
            <Heart className="h-4 w-4" fill={userData?.isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            aria-label={t('game.toggleCleared')}
            onClick={(e) => {
              e.stopPropagation()
              const isCleared = !(userData?.isCleared ?? false)
              toggleCleared.mutate(
                { entry: game, isCleared },
                { onError: () => appToast.error(t('game.toggleClearedFailed')) }
              )
            }}
            className={cn(
              'shrink-0 text-muted-foreground transition-[color,transform] duration-120 hover:text-foreground active:scale-[0.9] motion-reduce:transform-none',
              clearedPulse && '[animation:icon-pulse_180ms_ease-in-out] motion-reduce:animate-none'
            )}
          >
            <CheckCircle2
              className={`h-4 w-4 ${userData?.isCleared ? 'text-green-500' : ''}`}
              fill={userData?.isCleared ? 'currentColor' : 'none'}
            />
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
                <p className="truncate text-xs text-muted-foreground">{t('game.noCode')}</p>
              )}
              {circle && (
                <button
                  className="min-w-0 shrink truncate text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSearchCircle(circle)
                  }}
                >
                  {circle}
                </button>
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
              {archiveExtracted && (
                <span className="shrink-0 rounded bg-primary/10 px-1 text-[10px] text-primary">
                  {t('game.archiveExtracted')}
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
          {/* w-24 (was w-20) + whitespace-nowrap: Pretendard renders a value
              like "12시간 34분" wider than the previous system font fit in
              80px minus the icon - it wrapped onto a second line and got
              clipped by this row's fixed ROW_HEIGHT. No header row to stay
              aligned with in this list, so widening is safe. */}
          {!!userData?.totalPlaytimeMs && (
            <span className="flex w-24 shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              {formatPlaytime(userData.totalPlaytimeMs, t)}
            </span>
          )}
        </div>
      </ContextMenuTrigger>
      <GameEntryContextMenu
        entry={game}
        onOpenDetail={onOpenDetail}
        onExclude={onExclude}
        onAddToSavedPlaylist={onAddToSavedPlaylist}
        workType={workType}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
      />
    </ContextMenu>
  )
}

interface ListRowProps {
  games: ScannedEntry[]
  metadataByCode: Record<string, { genres: string[]; circle: string | null; workType: string | null }>
  duplicateGroups: Map<string, ScannedEntry[]>
  extractedArchiveCodes: Set<string>
  onFilterByGenre: (genre: string) => void
  onSearchCircle: (circle: string) => void
  onOpenDetail: (game: ScannedEntry) => void
  onHoverChange: (game: ScannedEntry | null) => void
  onExclude: (entry: ScannedEntry) => void
  onAddToSavedPlaylist: (tracks: MediaPlaylistTrackDto[]) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}

function Row({
  index,
  style,
  games,
  metadataByCode,
  duplicateGroups,
  extractedArchiveCodes,
  onFilterByGenre,
  onSearchCircle,
  onOpenDetail,
  onHoverChange,
  onExclude,
  onAddToSavedPlaylist,
  onRename,
  onMove,
  onDelete,
}: RowComponentProps<ListRowProps>) {
  const game = games[index]
  if (!game) return null
  const genres = game.code ? (metadataByCode[game.code.value]?.genres ?? []) : []
  const circle = game.code ? (metadataByCode[game.code.value]?.circle ?? null) : null
  const workType = game.code ? (metadataByCode[game.code.value]?.workType ?? null) : null
  const duplicateCount = getDuplicateGroupForEntry(game, duplicateGroups)?.length
  const archiveExtracted = isArchiveExtracted(game, extractedArchiveCodes)
  return (
    <div style={style}>
      <GameRow
        game={game}
        genres={genres}
        circle={circle}
        workType={workType}
        duplicateCount={duplicateCount}
        archiveExtracted={archiveExtracted}
        onFilterByGenre={onFilterByGenre}
        onSearchCircle={onSearchCircle}
        onOpenDetail={onOpenDetail}
        onHoverChange={onHoverChange}
        onExclude={onExclude}
        onAddToSavedPlaylist={onAddToSavedPlaylist}
        onRename={onRename}
        onMove={onMove}
        onDelete={onDelete}
      />
    </div>
  )
}

export function ListPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const refreshFiles = (): void => invalidateFileListQueries(queryClient)
  const { data: games, isLoading, isError } = useVisibleGames()
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [includedGenres, setIncludedGenres] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const [fileKindFilter, setFileKindFilter] = useState<FileKindFilter>('all')
  const [duplicatesOnly, setDuplicatesOnly] = useState(false)
  // A ref, not state - see GalleryPage's identical comment: hover fires on
  // every mouse move, and its only consumer (useFavoriteShortcut) only ever
  // needs the CURRENT value at keydown time, not to re-render anything.
  const hoveredGameRef = useRef<ScannedEntry | null>(null)
  const handleHoverChange = useCallback((game: ScannedEntry | null) => {
    hoveredGameRef.current = game
  }, [])

  // Clicking a tag on a row adds it to the include filter alongside
  // whatever's already active (other tag clicks, or SearchHeader's own
  // filter-composer input) - clicking an already-active tag removes it,
  // so tag clicks double as an on/off toggle rather than a one-at-a-time
  // replace.
  const filterByGenre = useCallback((genre: string) => {
    setIncludedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    )
  }, [])

  // Replaces the current search text outright (unlike genre tags, which
  // toggle into a structured include-list) - a shortcut for "search for
  // this name", same as typing it into SearchHeader yourself. Shared by
  // both this page's own rows (GameRow's circle button below) and the
  // detail sidebar opened from a row.
  const searchByCircle = useCallback((circle: string) => {
    setSearchQuery(circle)
  }, [])

  const { openDetail, detailSidebarElement } = useGameDetailSidebar(
    games ?? [],
    filterByGenre,
    searchByCircle
  )
  const { dialogElement, openRename, openMove, openDelete } = useEntryActionDialogs()
  const excludeEntry = useExcludeEntry()
  const [pendingSavedPlaylistTracks, setPendingSavedPlaylistTracks] = useState<
    MediaPlaylistTrackDto[] | null
  >(null)
  useFavoriteShortcut(hoveredGameRef)
  const scanProgress = useScanProgress(isLoading)

  // Memoized on `games` alone (not recomputed on every render caused by
  // hover/dialog-open/etc.) - see GalleryPage.tsx's identical pattern for
  // the full reasoning.
  const codes = useMemo(() => (games ?? []).flatMap((g) => (g.code ? [g.code.value] : [])), [games])
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)
  const gameCodes = useMemo(() => (games ?? []).flatMap((g) => (g.code ? [g.code] : [])), [games])
  useTriggerBulkCrawlMissingMetadata(gameCodes)
  const duplicateGroups = useMemo(() => groupDuplicatesByCode(games ?? []), [games])
  const extractedArchiveCodes = useMemo(() => getExtractedArchiveCodes(games ?? []), [games])

  // Moved above the isError/isLoading early returns below (see
  // GalleryPage.tsx's identical pattern) - hooks can't be called
  // conditionally.
  const filteredGames = useMemo(
    () =>
      games === undefined
        ? []
        : games.length > 0
          ? filterEntries(
              games,
              metadataByCode,
              searchQuery,
              includedGenres,
              excludedGenres,
              fileKindFilter
            )
          : games,
    [games, metadataByCode, searchQuery, includedGenres, excludedGenres, fileKindFilter]
  )
  const sortedGames = useMemo(
    () =>
      filteredGames.length > 0
        ? sortEntries(filteredGames, sortField, sortDirection)
        : filteredGames,
    [filteredGames, sortField, sortDirection]
  )
  const visibleGames = useMemo(
    () =>
      duplicatesOnly
        ? sortedGames.filter((g) => hasDuplicateGroupForEntry(g, duplicateGroups))
        : sortedGames,
    [duplicatesOnly, sortedGames, duplicateGroups]
  )

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
        <div className="flex flex-col gap-2 p-6">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
        <ScanProgressIndicator scanned={scanProgress} />
      </div>
    )
  }

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
        <SelectionToolbar allEntries={visibleGames} />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {visibleGames.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {games.length === 0 ? t('common.noGamesFound') : t('common.noItemsToShow')}
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
                        games: visibleGames,
                        metadataByCode,
                        duplicateGroups,
                        extractedArchiveCodes,
                        onFilterByGenre: filterByGenre,
                        onSearchCircle: searchByCircle,
                        onOpenDetail: openDetail,
                        onHoverChange: handleHoverChange,
                        onExclude: (entry: ScannedEntry) => excludeEntry.mutate(entry),
                        onAddToSavedPlaylist: setPendingSavedPlaylistTracks,
                        onRename: openRename,
                        onMove: openMove,
                        onDelete: openDelete,
                      }}
                      rowCount={visibleGames.length}
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
      {dialogElement}
      <AddToSavedPlaylistDialog
        tracks={pendingSavedPlaylistTracks ?? []}
        onClose={() => setPendingSavedPlaylistTracks(null)}
      />
    </div>
  )
}
