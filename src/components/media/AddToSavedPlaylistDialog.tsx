import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  useMediaPlaylists,
  useMediaPlaylistTracks,
  useCreateMediaPlaylist,
  useSetMediaPlaylistTracks,
  MEDIA_PLAYLISTS_QUERY_KEY,
  mediaPlaylistTracksQueryKey,
} from '../../services/mediaPlaylistService'
import { useTranslation } from '../../i18n/useTranslation'
import { appToast } from '../../lib/appToast'
import type { MediaPlaylistTrackDto } from '../../../shared/types/ipc'

interface AddToSavedPlaylistDialogProps {
  tracks: MediaPlaylistTrackDto[]
  onClose: () => void
}

// One playlist row's "add to this playlist" button - appending (not
// overwriting) needs useMediaPlaylistTracks(playlistId) to read what's
// already there, and hooks can't be called conditionally or in a loop, so
// this is its own component (one instance per row) rather than inline logic
// in the list below.
function AppendButton({
  playlistId,
  tracks,
  onDone,
}: {
  playlistId: string
  tracks: MediaPlaylistTrackDto[]
  onDone: () => void
}) {
  // Reads the query object itself (not just `.data` with a `[]` default) -
  // useSetMediaPlaylistTracks is a FULL-REPLACE API (delete-all-then-
  // reinsert, see mediaPlaylistsRepository.ts's setMediaPlaylistTracks), so
  // if existingTracks silently defaulted to [] while the per-playlist
  // tracks query was still pending (or had errored), `merged` below would
  // become just the new track(s) and clicking add would SILENTLY DELETE
  // every existing track in this playlist. Disabling the button while
  // pending/errored - mirroring PlaylistManagementTab's UserPlaylistRow
  // removeTrack guard on setTracksMutation.isPending - prevents that.
  const tracksQuery = useMediaPlaylistTracks(playlistId)
  const setTracks = useSetMediaPlaylistTracks(playlistId)
  const handleAdd = (): void => {
    // Defense in depth beyond the disabled button above - bail out if the
    // data genuinely isn't loaded yet (e.g. a stale click event queued
    // right as the query resolves).
    if (tracksQuery.data === undefined) return
    const existingTracks = tracksQuery.data
    const existingPaths = new Set(existingTracks.map((track) => track.path))
    const merged = [
      ...existingTracks,
      ...tracks.filter((track) => !existingPaths.has(track.path)),
    ]
    setTracks.mutate(merged, { onSuccess: onDone })
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleAdd}
      disabled={tracksQuery.isPending || tracksQuery.isError || setTracks.isPending}
    >
      +
    </Button>
  )
}

// A small picker dialog opened from GameEntryContextMenu's "저장된
// 재생목록에 추가" item - distinct from mediaPlayerStore's addToPlaylist,
// which only affects the ephemeral session queue rather than a persistent
// named playlist. `tracks.length > 0` doubles as the dialog's open flag
// (matching RenameDialog/MoveDialog's own targets.length-driven open state,
// see useEntryActionDialogs), so callers just clear their pending list on
// close instead of tracking a separate boolean.
export function AddToSavedPlaylistDialog({ tracks, onClose }: AddToSavedPlaylistDialogProps) {
  const { t } = useTranslation()
  const { data: playlists = [] } = useMediaPlaylists()
  const createMutation = useCreateMediaPlaylist()
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')

  const handleCreateAndAdd = (): void => {
    const trimmed = newName.trim()
    if (!trimmed) return
    createMutation.mutate(trimmed, {
      onSuccess: (playlist) => {
        // useSetMediaPlaylistTracks is a hook and can't be invoked
        // conditionally from inside this handler for an id that doesn't
        // exist until this exact callback fires - call the underlying
        // preload API directly instead, then invalidate the same query keys
        // the hook itself would have on success.
        window.api.mediaPlaylist
          .setTracks(playlist.id, tracks)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: mediaPlaylistTracksQueryKey(playlist.id) })
            queryClient.invalidateQueries({ queryKey: MEDIA_PLAYLISTS_QUERY_KEY })
            setNewName('')
            onClose()
          })
          .catch(() => appToast.error(t('media.updatePlaylistTracksFailed')))
      },
    })
  }

  return (
    <Dialog open={tracks.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('media.selectPlaylist')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {playlists.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('media.noPlaylistsForAdd')}</p>
          )}
          {playlists.map((playlist) => (
            <div key={playlist.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{playlist.name}</span>
              <AppendButton playlistId={playlist.id} tracks={tracks} onDone={onClose} />
            </div>
          ))}
          <div className="flex items-center gap-2 border-t border-border pt-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('media.newPlaylistNamePlaceholder')}
              className="h-8 flex-1 text-sm"
            />
            <Button size="sm" onClick={handleCreateAndAdd} disabled={!newName.trim()}>
              {t('media.createAndAdd')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
