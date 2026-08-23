import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, Play, Plus, Folder as FolderIcon } from 'lucide-react'
import { usePickLibraryFolder } from '../../services/librariesService'
import { useFolderScan } from '../../services/scannerService'
import { useMediaFolderQuery, useSetMediaFolderMutation } from '../../services/settingsService'
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
import { useTranslation } from '../../i18n/useTranslation'
import { setMediaThumbnailWithFeedback } from './mediaThumbnailFeedback'
import { MediaLikeButton } from '../../components/media/MediaLikeButton'
import type { ScannedEntry } from '../../../shared/types/scanner'

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
  onAddToPlaylist,
}: {
  track: MediaTrack
  onPlay: () => void
  onAddToPlaylist: () => void
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
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('media.addToPlaylist')}
        className="shrink-0"
        onClick={onAddToPlaylist}
      >
        <Plus className="h-4 w-4" />
      </Button>
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

function MediaBreadcrumb({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const segments = pathToBreadcrumbSegments(path)
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-xs">
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
  const { data: folder = null, isLoading: isFolderLoading } = useMediaFolderQuery()
  const setMediaFolder = useSetMediaFolderMutation()
  const pickFolder = usePickLibraryFolder()
  const playNow = useMediaPlayerStore((s) => s.playNow)
  const addToPlaylist = useMediaPlayerStore((s) => s.addToPlaylist)
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
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
            <MediaBreadcrumb path={currentPath} onNavigate={navigateMediaBrowseTo} />
          </>
        )}
        {tracks.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto shrink-0"
            onClick={() => addToPlaylist(tracks)}
          >
            {t('media.addFolderToPlaylist')}
          </Button>
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
                onPlay={() => playNow(track, tracks)}
                onAddToPlaylist={() => addToPlaylist([track])}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
