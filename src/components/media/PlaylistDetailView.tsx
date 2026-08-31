import { useEffect, useState } from 'react'
import { ImagePlus, Pencil, Plus, Trash2, X, ChevronLeft } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { appToast } from '../../lib/appToast'
import { useTranslation } from '../../i18n/useTranslation'
import { useContainerWidth } from '../../hooks/useContainerWidth'
import { getPlaylistDetailWidthMode } from '../../lib/playlistDetailWidthMode'
import {
  computePlaylistThumbnailSource,
  type PlaylistThumbnailSource,
} from '../../lib/playlistThumbnailSources'
import { PlaylistThumbnail } from './PlaylistThumbnail'
import { PlaylistTrackList } from './PlaylistTrackList'
import { DeletePlaylistConfirmDialog } from './DeletePlaylistConfirmDialog'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import {
  useMediaPlaylists,
  useMediaPlaylistTracks,
  useLikedTracks,
  useRenameMediaPlaylist,
  useSetMediaPlaylistTracks,
  usePickPlaylistCoverFile,
  useSetPlaylistCover,
  useClearPlaylistCover,
  LIKED_PLAYLIST_ID,
} from '../../services/mediaPlaylistService'
import { cn } from '../../lib/utils'
import type { MediaPlaylistTrackDto } from '../../../shared/types/ipc'

function PlaylistCoverPanel({
  layout,
  name,
  trackCount,
  thumbnailSource,
  isEditable,
  renaming,
  nameDraft,
  onNameDraftChange,
  onCommitRename,
  onStartRename,
  onRequestDelete,
  onAddToQueue,
  hasCover,
  onSetCover,
  onClearCover,
}: {
  layout: 'wide' | 'narrow'
  name: string
  trackCount: number
  thumbnailSource: PlaylistThumbnailSource
  isEditable: boolean
  renaming: boolean
  nameDraft: string
  onNameDraftChange: (value: string) => void
  onCommitRename: () => void
  onStartRename: () => void
  onRequestDelete: () => void
  onAddToQueue: () => void
  hasCover: boolean
  onSetCover: () => void
  onClearCover: () => void
}) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)

  return (
    <div className={cn('flex gap-3', layout === 'wide' ? 'w-50 flex-col' : 'items-start')}>
      <div
        className="relative shrink-0"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <PlaylistThumbnail source={thumbnailSource} size={layout === 'wide' ? 'lg' : 'md'} />
        {isEditable && hovered && (
          <div className="absolute right-1 top-1 flex gap-1">
            <button
              type="button"
              onClick={onSetCover}
              aria-label={t('media.setPlaylistCover')}
              className="rounded bg-black/60 p-1 text-white hover:bg-black/80"
            >
              <ImagePlus className="h-3.5 w-3.5" />
            </button>
            {hasCover && (
              <button
                type="button"
                onClick={onClearCover}
                aria-label={t('media.removePlaylistCover')}
                className="rounded bg-black/60 p-1 text-white hover:bg-black/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {renaming ? (
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => onNameDraftChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => e.key === 'Enter' && onCommitRename()}
            className="h-7 text-sm"
          />
        ) : (
          <span className="min-w-0 truncate text-sm font-medium">{name}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {t('media.trackCount', { count: trackCount })}
        </span>
        {isEditable && (
          <div className="flex gap-1">
            <Button variant="secondary" size="sm" className="flex-1 gap-1 text-xs" onClick={onStartRename}>
              <Pencil className="h-3 w-3" />
              {t('media.renamePlaylist')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 gap-1 text-xs hover:text-destructive"
              onClick={onRequestDelete}
            >
              <Trash2 className="h-3 w-3" />
              {t('media.deletePlaylist')}
            </Button>
          </div>
        )}
        <Button variant="secondary" size="sm" className="gap-1 text-xs" onClick={onAddToQueue}>
          <Plus className="h-3 w-3" />
          {t('media.addPlaylistToQueue')}
        </Button>
      </div>
    </div>
  )
}

// Rendered by MediaPage.tsx whenever selectedPlaylistId is set - shows
// either a real saved playlist or the virtual "liked tracks" pseudo-
// playlist (id === LIKED_PLAYLIST_ID), which has no media_playlists row
// and therefore no rename/delete/cover-set affordance (isEditable gates
// all three) and no drag-reorder/per-track-delete (disabled on
// PlaylistTrackList).
export function PlaylistDetailView() {
  const { t } = useTranslation()
  const selectedPlaylistId = useMediaPlayerStore((s) => s.selectedPlaylistId)
  const closePlaylistDetail = useMediaPlayerStore((s) => s.closePlaylistDetail)
  const playNow = useMediaPlayerStore((s) => s.playNow)
  const addToPlaylist = useMediaPlayerStore((s) => s.addToPlaylist)
  const coverVersions = useMediaPlayerStore((s) => s.coverVersions)
  const bumpPlaylistCoverVersion = useMediaPlayerStore((s) => s.bumpPlaylistCoverVersion)

  const isLiked = selectedPlaylistId === LIKED_PLAYLIST_ID
  const { data: playlists = [] } = useMediaPlaylists()
  const playlist = isLiked ? null : playlists.find((p) => p.id === selectedPlaylistId)

  const { data: likedTracks = [] } = useLikedTracks()
  const likedAsTracks: MediaPlaylistTrackDto[] = likedTracks.map((track) => ({
    path: track.path,
    name: track.path.split(/[\\/]/).pop() ?? track.path,
  }))
  const tracksQuery = useMediaPlaylistTracks(selectedPlaylistId ?? '', {
    enabled: !isLiked && selectedPlaylistId !== null,
  })
  const tracks = isLiked ? likedAsTracks : (tracksQuery.data ?? [])

  const renameMutation = useRenameMediaPlaylist()
  const setTracksMutation = useSetMediaPlaylistTracks(selectedPlaylistId ?? '')
  const pickCoverFile = usePickPlaylistCoverFile()
  const setCoverMutation = useSetPlaylistCover()
  const clearCoverMutation = useClearPlaylistCover()

  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const [containerRef, containerWidth] = useContainerWidth<HTMLDivElement>()
  const widthMode = getPlaylistDetailWidthMode(containerWidth)

  // A stale selectedPlaylistId (its playlist was deleted elsewhere, or the
  // id is simply invalid) has nothing to render - return to whatever the
  // Media tab was showing before. Only fires once playlists has actually
  // loaded (an empty array during the initial fetch would otherwise look
  // identical to "not found").
  useEffect(() => {
    if (!isLiked && playlists.length > 0 && !playlist) closePlaylistDetail()
  }, [isLiked, playlists.length, playlist, closePlaylistDetail])

  if (!isLiked && !playlist) return null

  const name = isLiked ? t('media.likedPlaylistName') : (playlist?.name ?? '')
  const hasCover = !isLiked && playlist?.coverImagePath !== null && playlist?.coverImagePath !== undefined
  const thumbnailSource = computePlaylistThumbnailSource(
    hasCover,
    selectedPlaylistId ?? '',
    tracks.map((track) => track.path),
    coverVersions[selectedPlaylistId ?? ''] ?? 0
  )

  const startRename = (): void => {
    setNameDraft(name)
    setRenaming(true)
  }

  const commitRename = (): void => {
    if (!playlist) return
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== playlist.name) renameMutation.mutate({ id: playlist.id, name: trimmed })
    setRenaming(false)
  }

  const handleAddToQueue = (): void => {
    if (tracks.length > 0) addToPlaylist(tracks)
  }

  const handlePlayTrack = (index: number): void => {
    if (tracks.length > 0) playNow(tracks[index], tracks)
  }

  const handleReorder = (fromIndex: number, toIndex: number): void => {
    if (setTracksMutation.isPending || tracksQuery.isFetching) return
    const reordered = [...tracks]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    setTracksMutation.mutate(reordered)
  }

  const handleRemoveTrack = (path: string): void => {
    if (setTracksMutation.isPending || tracksQuery.isFetching) return
    setTracksMutation.mutate(tracks.filter((track) => track.path !== path))
  }

  const handleSetCover = async (): Promise<void> => {
    if (!playlist) return
    // pickCoverFile.mutateAsync() rejects (e.g. a failed trust-token check)
    // rather than routing through the mutation's own onError - unlike the
    // fire-and-forget setCoverMutation.mutate() below, this is awaited
    // directly, so an uncaught rejection here would surface as an unhandled
    // promise rejection instead of user-facing feedback (mirrors the
    // pick-then-set try/catch shape in mediaThumbnailFeedback.ts).
    try {
      const sourcePath = await pickCoverFile.mutateAsync()
      if (!sourcePath) return
      setCoverMutation.mutate(
        { playlistId: playlist.id, sourcePath },
        { onSuccess: () => bumpPlaylistCoverVersion(playlist.id) }
      )
    } catch {
      appToast.error(t('media.setPlaylistCoverFailed'))
    }
  }

  const handleClearCover = (): void => {
    if (!playlist) return
    clearCoverMutation.mutate(playlist.id, { onSuccess: () => bumpPlaylistCoverVersion(playlist.id) })
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button variant="ghost" size="icon" aria-label={t('media.goBack')} onClick={closePlaylistDetail}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      </div>
      <div
        className={cn(
          'flex-1 overflow-auto p-4',
          widthMode === 'wide' ? 'flex gap-4' : 'flex flex-col gap-3'
        )}
      >
        <PlaylistCoverPanel
          layout={widthMode}
          name={name}
          trackCount={tracks.length}
          thumbnailSource={thumbnailSource}
          isEditable={!isLiked}
          renaming={renaming}
          nameDraft={nameDraft}
          onNameDraftChange={setNameDraft}
          onCommitRename={commitRename}
          onStartRename={startRename}
          onRequestDelete={() => playlist && setPendingDelete({ id: playlist.id, name: playlist.name })}
          onAddToQueue={handleAddToQueue}
          hasCover={hasCover}
          onSetCover={() => void handleSetCover()}
          onClearCover={handleClearCover}
        />
        <div className={cn('flex flex-col gap-0.5', widthMode === 'wide' ? 'min-w-0 flex-1' : '')}>
          <PlaylistTrackList
            tracks={tracks}
            disabled={setTracksMutation.isPending || tracksQuery.isFetching}
            readOnly={isLiked}
            onPlayTrack={handlePlayTrack}
            onReorder={handleReorder}
            onRemove={handleRemoveTrack}
          />
        </div>
      </div>
      <DeletePlaylistConfirmDialog
        playlist={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onDeleted={closePlaylistDetail}
      />
    </div>
  )
}
