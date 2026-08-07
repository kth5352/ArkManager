import { useState } from 'react'
import { ImagePlus, Play, Plus } from 'lucide-react'
import { usePickLibraryFolder } from '../../services/librariesService'
import { useFolderScanRecursive } from '../../services/scannerService'
import { useMediaFolderQuery, useSetMediaFolderMutation } from '../../services/settingsService'
import { useMediaPlayerStore, type MediaTrack } from '../../stores/mediaPlayerStore'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import {
  usePickMediaThumbnailFile,
  useSetMediaThumbnailFromFile,
} from '../../services/mediaThumbnailService'
import { isMediaFile } from '../../../shared/isMediaFile'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import { useTranslation } from '../../i18n/useTranslation'
import { appToast } from '../../lib/appToast'

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
    const sourcePath = await pickFile.mutateAsync()
    if (!sourcePath) return
    const result = await setFromFile.mutateAsync({ filePath: track.path, sourcePath })
    appToast.success(t('media.thumbnailSet'))
    if (result.warning) appToast.info(result.warning)
    // mediathumb:// is a plain URL, not a react-query cache entry - nothing
    // to invalidate. Bumping this query param forces the <img> to actually
    // re-request instead of reusing Chromium's cached response for the
    // previous (now-stale) bytes at the same URL.
    setThumbFailed(false)
    setRefreshToken((v) => v + 1)
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
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

// A dedicated browse-and-queue page, separate from Explorer's per-folder
// "click to play" entry point (see FolderView.tsx) - this one is for
// picking any folder (not necessarily a registered library) and building up
// a playlist from everything media-shaped found in it, recursively. The
// picked folder is persisted (see useMediaFolderQuery) rather than kept in
// local state, so navigating to another tab and back doesn't force picking
// it again - it's also what makes media:// willing to serve files from a
// non-library folder at all (see mediaProtocol.ts).
export function MediaPage() {
  const { t } = useTranslation()
  const { data: folder = null, isLoading: isFolderLoading } = useMediaFolderQuery()
  const setMediaFolder = useSetMediaFolderMutation()
  const pickFolder = usePickLibraryFolder()
  const { data: entries, isLoading } = useFolderScanRecursive(folder ?? '', {
    enabled: folder !== null,
  })
  const playNow = useMediaPlayerStore((s) => s.playNow)
  const addToPlaylist = useMediaPlayerStore((s) => s.addToPlaylist)

  const tracks: MediaTrack[] = (entries ?? [])
    .filter((e) => e.kind === 'file' && isMediaFile(e.name))
    .map((e) => ({ path: e.path, name: e.name }))

  const handlePickFolder = async (): Promise<void> => {
    const dir = await pickFolder.mutateAsync()
    if (dir) setMediaFolder.mutate(dir)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button size="sm" variant="secondary" onClick={handlePickFolder}>
          {t('settings.pickFolder')}
        </Button>
        {folder && <span className="truncate text-xs text-muted-foreground">{folder}</span>}
        {tracks.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => addToPlaylist(tracks)}
          >
            {t('media.addAllToPlaylist')}
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
        ) : tracks.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t('media.noMediaFound')}
          </div>
        ) : (
          <ul className="divide-y divide-border">
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
