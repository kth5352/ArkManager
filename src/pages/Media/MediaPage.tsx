import { useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  ListMusic,
  ListPlus,
  Play,
  Plus,
  Folder as FolderIcon,
} from 'lucide-react'
import { Grid, type CellComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { usePickLibraryFolder } from '../../services/librariesService'
import { useFolderScan } from '../../services/scannerService'
import {
  useMediaFolderQuery,
  useMediaSidebarOpenQuery,
  useMediaViewModeQuery,
  useSetMediaFolderMutation,
  useSetMediaSidebarOpenMutation,
} from '../../services/settingsService'
import { useMediaPlayerStore, type MediaTrack } from '../../stores/mediaPlayerStore'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import {
  usePickMediaThumbnailFile,
  useSetMediaThumbnailFromFile,
} from '../../services/mediaThumbnailService'
import { isMediaFile } from '../../../shared/isMediaFile'
import { pathToBreadcrumbSegments } from '../Explorer/breadcrumb'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { useTranslation } from '../../i18n/useTranslation'
import { setMediaThumbnailWithFeedback } from './mediaThumbnailFeedback'
import { MediaLikeButton } from '../../components/media/MediaLikeButton'
import { PlaylistDetailView } from '../../components/media/PlaylistDetailView'
import { AddToSavedPlaylistDialog } from '../../components/media/AddToSavedPlaylistDialog'
import { MediaFolderCard, MediaTrackCard } from '../../components/media/MediaEntryCard'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { MediaPlaylistTrackDto } from '../../../shared/types/ipc'

// A single track row - thumbnail state (whether the current mediathumb://
// request 404'd, and a cache-busting counter bumped after the user manually
// sets a new thumbnail) is local to each row rather than lifted, since it's
// purely about that one row's own <img> element and this list isn't
// react-window-virtualized (a plain <ul>, unlike Gallery/List/DetailList) -
// no row recycling to worry about, unlike GameThumbnail's path-keyed
// failure tracking.
function MediaTrackRow({
  track,
  onPlay,
  onAddToQueue,
  onPlayNext,
  onAddToSavedPlaylist,
}: {
  track: MediaTrack
  onPlay: () => void
  onAddToQueue: () => void
  onPlayNext: () => void
  onAddToSavedPlaylist: () => void
}) {
  const { t } = useTranslation()
  const [thumbFailed, setThumbFailed] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const pickFile = usePickMediaThumbnailFile()
  const setFromFile = useSetMediaThumbnailFromFile()

  const handlePickThumbnail = async (): Promise<void> => {
    const result = await setMediaThumbnailWithFeedback(
      track.path,
      () => pickFile.mutateAsync(),
      (payload) => setFromFile.mutateAsync(payload),
      t
    )
    if (!result) return
    setThumbFailed(false)
    setRefreshToken((v) => v + 1)
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent">
      <div className="flex h-13 w-13 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {!thumbFailed && (
          <img
            src={`${buildMediaThumbnailUrl(track.path)}?v=${refreshToken}`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setThumbFailed(true)}
          />
        )}
      </div>
      <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onPlay}>
        <Play className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{track.name}</span>
      </button>
      <MediaLikeButton path={track.path} name={track.name} />
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('media.setThumbnail')}
        className="shrink-0"
        onClick={handlePickThumbnail}
      >
        <ImagePlus className="h-4 w-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('media.addToPlaylist')}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onAddToQueue}>{t('media.addToPlaylist')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onPlayNext}>{t('media.playNext')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onAddToSavedPlaylist}>
            {t('media.addToSavedPlaylist')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function MediaFolderRow({ entry, onOpen }: { entry: ScannedEntry; onOpen: () => void }) {
  return (
    <li>
      <button
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-accent"
      >
        <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-md bg-muted">
          <FolderIcon className="h-5 w-5 text-muted-foreground" />
        </div>
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

// Only shows segments from the anchor root folder (rootPath) down - the
// drive-letter/parent-folder prefix above the root (e.g. "C: / Media" above
// a root of "C:\Media\Work") is never shown, since the user picked that
// root specifically as their working anchor and everything above it is
// irrelevant context. Falls back to showing the full path if rootPath
// somehow isn't a real ancestor of path (shouldn't happen in practice,
// since mediaBrowsePath is always navigated to from within rootPath's own
// subtree, but a broken comparison degrading to "show everything" is safer
// than one that degrades to "show nothing").
function MediaBreadcrumb({
  path,
  rootPath,
  onNavigate,
}: {
  path: string
  rootPath: string
  onNavigate: (path: string) => void
}) {
  const allSegments = pathToBreadcrumbSegments(path)
  const rootSegments = pathToBreadcrumbSegments(rootPath)
  const rootSegmentPath = rootSegments[rootSegments.length - 1]?.path
  const rootIndex = rootSegmentPath
    ? allSegments.findIndex((segment) => segment.path === rootSegmentPath)
    : -1
  const segments = rootIndex >= 0 ? allSegments.slice(rootIndex) : allSegments

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {segments.map((segment, index) => (
        <span key={segment.path} className="flex shrink-0 items-center gap-1">
          {index > 0 && <span className="text-muted-foreground">/</span>}
          <button
            onClick={() => onNavigate(segment.path)}
            className="rounded px-1 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {segment.label}
          </button>
        </span>
      ))}
    </div>
  )
}

const MEDIA_CARD_WIDTH = 140
const MEDIA_GRID_GAP = 16
const MEDIA_SCROLLBAR_GUTTER = 17
// p-2 top/bottom (8+8) + one line of text-xs (16px line-height) - shallower
// than Explorer's own CARD_TEXT_BLOCK_HEIGHT since a Media grid card shows
// one truncated line of filename, not a 2-line clamp + code line.
const MEDIA_CARD_TEXT_BLOCK_HEIGHT = 8 + 16 + 8

function computeMediaCardHeight(cardWidth: number): number {
  return cardWidth + MEDIA_CARD_TEXT_BLOCK_HEIGHT
}

interface MediaGridCellProps {
  folders: ScannedEntry[]
  tracks: MediaTrack[]
  columnCount: number
  gap: number
  cardWidth: number
  onOpenFolder: (path: string) => void
  onPlay: (track: MediaTrack) => void
  onAddToQueue: (track: MediaTrack) => void
  onPlayNext: (track: MediaTrack) => void
  onAddToSavedPlaylist: (tracks: MediaPlaylistTrackDto[]) => void
}

// Folders come first, then tracks - same combined order the list view
// already renders (folders.map(...) then tracks.map(...) in MediaPage's
// return below), just addressed by a single flat index across both arrays
// instead of two separate <ul> sections, since react-window's Grid needs
// one flat rowCount/columnCount space to virtualize over.
function MediaEntryCell({
  columnIndex,
  rowIndex,
  style,
  folders,
  tracks,
  columnCount,
  gap,
  cardWidth,
  onOpenFolder,
  onPlay,
  onAddToQueue,
  onPlayNext,
  onAddToSavedPlaylist,
}: CellComponentProps<MediaGridCellProps>) {
  const index = rowIndex * columnCount + columnIndex
  const cellStyle = { ...style, padding: gap / 2, display: 'flex', justifyContent: 'center' }

  if (index < folders.length) {
    const entry = folders[index]
    if (!entry) return null
    return (
      <div style={cellStyle}>
        <MediaFolderCard entry={entry} cardWidth={cardWidth} onOpen={() => onOpenFolder(entry.path)} />
      </div>
    )
  }

  const track = tracks[index - folders.length]
  if (!track) return null
  return (
    <div style={cellStyle}>
      <MediaTrackCard
        track={track}
        cardWidth={cardWidth}
        onPlay={() => onPlay(track)}
        onAddToQueue={() => onAddToQueue(track)}
        onPlayNext={() => onPlayNext(track)}
        onAddToSavedPlaylist={() => onAddToSavedPlaylist([track])}
      />
    </div>
  )
}

// A dedicated browse-and-queue page, separate from Explorer's per-folder
// "click to play" entry point (see FolderView.tsx) - lets the user pick any
// folder (not necessarily a registered library) and navigate its subfolder
// tree one level at a time (breadcrumb + back/forward), building up a
// playlist from whatever media it finds at the current level. The picked
// ROOT folder is persisted (see useMediaFolderQuery) so navigating to
// another tab and back doesn't require picking it again; the current
// sub-path/history is session-only (see mediaBrowsePath in
// mediaPlayerStore.ts) and resets to the root each time this page mounts
// fresh with a new root.
export function MediaPage() {
  const { t } = useTranslation()
  const selectedPlaylistId = useMediaPlayerStore((s) => s.selectedPlaylistId)
  const { data: folder = null, isLoading: isFolderLoading } = useMediaFolderQuery()
  const setMediaFolder = useSetMediaFolderMutation()
  const pickFolder = usePickLibraryFolder()
  const { data: mediaSidebarOpenSetting, isLoading: mediaSidebarOpenLoading } =
    useMediaSidebarOpenQuery()
  const setMediaSidebarOpenMutation = useSetMediaSidebarOpenMutation()
  const mediaSidebarOpen = mediaSidebarOpenSetting ?? false
  const appendAndPlay = useMediaPlayerStore((s) => s.appendAndPlay)
  const addToPlaylist = useMediaPlayerStore((s) => s.addToPlaylist)
  const playNext = useMediaPlayerStore((s) => s.playNext)
  const [pendingSavedPlaylistTracks, setPendingSavedPlaylistTracks] = useState<
    MediaPlaylistTrackDto[] | null
  >(null)
  const { data: viewMode = 'list' } = useMediaViewModeQuery()
  // Not persisted (see design spec section 2/3) - resets to 1.0 every
  // session, matching Explorer's own grid-view zoom (FolderView.tsx).
  // setZoom is unused until the next task wires up the toolbar's zoom
  // slider (this task only reads zoom, in the grid-view branch below).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [zoom, setZoom] = useState(1)
  const mediaBrowsePath = useMediaPlayerStore((s) => s.mediaBrowsePath)
  const mediaBrowseHistory = useMediaPlayerStore((s) => s.mediaBrowseHistory)
  const mediaBrowseHistoryIndex = useMediaPlayerStore((s) => s.mediaBrowseHistoryIndex)
  const navigateMediaBrowseTo = useMediaPlayerStore((s) => s.navigateMediaBrowseTo)
  const mediaBrowseGoBack = useMediaPlayerStore((s) => s.mediaBrowseGoBack)
  const mediaBrowseGoForward = useMediaPlayerStore((s) => s.mediaBrowseGoForward)
  const resetMediaBrowseRoot = useMediaPlayerStore((s) => s.resetMediaBrowseRoot)

  // A real useEffect, not the render-time compare-and-setState pattern this
  // codebase uses elsewhere - that pattern is appropriate only for a
  // component's own local React state (see FolderView.tsx's own comment on
  // this), not for calling into an EXTERNAL Zustand store like
  // resetMediaBrowseRoot, which now also has a second, independent
  // subscriber (FolderTreeTab.tsx, mounted elsewhere in the tree via
  // AppLayout) - this is exactly the side-effect-on-a-dependency-change
  // case useEffect exists for.
  useEffect(() => {
    if (folder !== null) resetMediaBrowseRoot(folder)
  }, [folder, resetMediaBrowseRoot])

  const currentPath = mediaBrowsePath ?? folder ?? ''
  const { data: entries, isLoading } = useFolderScan(currentPath, { enabled: currentPath !== '' })

  const folders = (entries ?? []).filter((e) => e.kind === 'folder')
  const tracks: MediaTrack[] = (entries ?? [])
    .filter((e) => e.kind === 'file' && isMediaFile(e.name))
    .map((e) => ({ path: e.path, name: e.name }))

  const handlePickFolder = async (): Promise<void> => {
    const dir = await pickFolder.mutateAsync()
    if (dir) setMediaFolder.mutate(dir)
  }

  const canGoBack = mediaBrowseHistoryIndex > 0
  const canGoForward = mediaBrowseHistoryIndex < mediaBrowseHistory.length - 1

  if (selectedPlaylistId !== null) {
    return <PlaylistDetailView />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={handlePickFolder}>
            {t('settings.pickFolder')}
          </Button>
          {folder && (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('media.goBack')}
                disabled={!canGoBack}
                onClick={mediaBrowseGoBack}
                className="shrink-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('media.goForward')}
                disabled={!canGoForward}
                onClick={mediaBrowseGoForward}
                className="shrink-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('media.sidebarToggle')}
            aria-pressed={mediaSidebarOpen}
            title={t('media.sidebarToggle')}
            disabled={mediaSidebarOpenLoading || setMediaSidebarOpenMutation.isPending}
            onClick={() => setMediaSidebarOpenMutation.mutate(!mediaSidebarOpen)}
            className="ml-auto shrink-0"
          >
            <ListMusic className="h-4 w-4" />
          </Button>
          {tracks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('media.addFolderToPlaylist')}
                  title={t('media.addFolderToPlaylist')}
                  className="shrink-0"
                >
                  <ListPlus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => addToPlaylist(tracks)}>
                  {t('media.addFolderToPlaylist')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPendingSavedPlaylistTracks(tracks)}>
                  {t('media.addFolderToSavedPlaylist')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {folder && (
          <MediaBreadcrumb path={currentPath} rootPath={folder} onNavigate={navigateMediaBrowseTo} />
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {isFolderLoading ? null : folder === null ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t('media.pickFolderPrompt')}
          </div>
        ) : isLoading ? (
          <div className="flex flex-col gap-1 p-4">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : tracks.length === 0 && folders.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t('media.noMediaFound')}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="h-full w-full p-4">
            <AutoSizer
              style={{ height: '100%', width: '100%' }}
              renderProp={({ height, width }) => {
                if (height === undefined || width === undefined) return null
                const cardWidth = MEDIA_CARD_WIDTH * zoom
                const cardHeight = computeMediaCardHeight(cardWidth)
                const gap = MEDIA_GRID_GAP * zoom
                const availableWidth = Math.max(0, width - MEDIA_SCROLLBAR_GUTTER)
                const columnCount = Math.max(1, Math.floor(availableWidth / (cardWidth + gap)))
                const totalCount = folders.length + tracks.length
                const rowCount = Math.ceil(totalCount / columnCount)
                const usedWidth = columnCount * (cardWidth + gap)
                const extraPerColumn =
                  columnCount > 0 ? (availableWidth - usedWidth) / columnCount : 0
                const effectiveColumnWidth = cardWidth + gap + extraPerColumn

                return (
                  <Grid
                    cellComponent={MediaEntryCell}
                    cellProps={{
                      folders,
                      tracks,
                      columnCount,
                      gap,
                      cardWidth,
                      onOpenFolder: navigateMediaBrowseTo,
                      onPlay: appendAndPlay,
                      onAddToQueue: (track) => addToPlaylist([track]),
                      onPlayNext: playNext,
                      onAddToSavedPlaylist: setPendingSavedPlaylistTracks,
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
        ) : (
          <ul className="divide-y divide-border">
            {folders.map((entry) => (
              <MediaFolderRow
                key={entry.path}
                entry={entry}
                onOpen={() => navigateMediaBrowseTo(entry.path)}
              />
            ))}
            {tracks.map((track) => (
              <MediaTrackRow
                key={track.path}
                track={track}
                onPlay={() => appendAndPlay(track)}
                onAddToQueue={() => addToPlaylist([track])}
                onPlayNext={() => playNext(track)}
                onAddToSavedPlaylist={() => setPendingSavedPlaylistTracks([track])}
              />
            ))}
          </ul>
        )}
      </div>
      <AddToSavedPlaylistDialog
        tracks={pendingSavedPlaylistTracks ?? []}
        onClose={() => setPendingSavedPlaylistTracks(null)}
      />
    </div>
  )
}
