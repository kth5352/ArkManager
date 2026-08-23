import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import {
  useMediaPlaylists,
  useMediaPlaylistTracks,
  useCreateMediaPlaylist,
  useRenameMediaPlaylist,
  useDeleteMediaPlaylist,
  useSetMediaPlaylistTracks,
  useLikedTracks,
} from '../../services/mediaPlaylistService'
import { useTranslation } from '../../i18n/useTranslation'

// The "좋아요" entry is a virtual playlist backed entirely by
// useLikedTracks() - it never has a row in media_playlists, so it has no
// rename/delete affordance and is rendered as a separate, always-first,
// visually distinct item rather than one more row in the mapped list below.
function LikedPlaylistRow() {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const { data: liked = [] } = useLikedTracks()
  const playNow = useMediaPlayerStore((s) => s.playNow)

  const tracks = liked.map((track) => ({ path: track.path, name: track.path.split(/[\\/]/).pop() ?? track.path }))

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 rounded px-1 py-1.5 text-sm hover:bg-accent">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <span className="min-w-0 flex-1 truncate font-medium">{t('media.likedPlaylistName')}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          disabled={tracks.length === 0}
          aria-label={t('media.playPlaylist')}
          onClick={() => tracks.length > 0 && playNow(tracks[0], tracks)}
        >
          <Play className="h-3.5 w-3.5" />
        </Button>
      </div>
      {expanded && (
        <ul className="ml-5 flex flex-col gap-0.5">
          {tracks.length === 0 && (
            <li className="px-1 py-1 text-xs text-muted-foreground">{t('media.emptyPlaylistTracks')}</li>
          )}
          {tracks.map((track) => (
            <li key={track.path} className="truncate px-1 py-1 text-xs text-muted-foreground">
              {track.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function UserPlaylistRow({ id, name }: { id: string; name: string }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(name)
  const { data: tracks = [] } = useMediaPlaylistTracks(id)
  const renameMutation = useRenameMediaPlaylist()
  const deleteMutation = useDeleteMediaPlaylist()
  const setTracksMutation = useSetMediaPlaylistTracks(id)
  const playNow = useMediaPlayerStore((s) => s.playNow)

  const commitRename = (): void => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== name) renameMutation.mutate({ id, name: trimmed })
    setRenaming(false)
  }

  const removeTrack = (path: string): void => {
    if (setTracksMutation.isPending) return
    setTracksMutation.mutate(tracks.filter((track) => track.path !== path))
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 rounded px-1 py-1.5 text-sm hover:bg-accent">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {renaming ? (
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => e.key === 'Enter' && commitRename()}
            className="h-6 flex-1 text-sm"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{name}</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          disabled={tracks.length === 0}
          aria-label={t('media.playPlaylist')}
          onClick={() => tracks.length > 0 && playNow(tracks[0], tracks)}
        >
          <Play className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label={t('media.renamePlaylist')}
          onClick={() => setRenaming(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 hover:text-destructive"
          aria-label={t('media.deletePlaylist')}
          onClick={() => deleteMutation.mutate(id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {expanded && (
        <ul className="ml-5 flex flex-col gap-0.5">
          {tracks.length === 0 && (
            <li className="px-1 py-1 text-xs text-muted-foreground">{t('media.emptyPlaylistTracks')}</li>
          )}
          {tracks.map((track) => (
            <li key={track.path} className="flex items-center gap-1 px-1 py-1 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{track.name}</span>
              <button
                type="button"
                aria-label={t('media.removeFromPlaylist')}
                onClick={() => removeTrack(track.path)}
                disabled={setTracksMutation.isPending}
                className="shrink-0 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PlaylistManagementTab() {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const { data: playlists = [] } = useMediaPlaylists()
  const createMutation = useCreateMediaPlaylist()
  // Enter unmounts this Input (setCreating(false)), and browsers fire a
  // synchronous 'blur' on the still-focused node as part of that removal -
  // which re-invokes this exact same commitCreate closure via onBlur before
  // any re-render can happen. A createMutation.isPending check would not
  // catch this: both invocations read the same per-render snapshot. A ref
  // mutates in place and is visible to the second call immediately.
  const committedRef = useRef(false)

  const commitCreate = (): void => {
    if (committedRef.current) return
    committedRef.current = true
    const trimmed = newName.trim()
    if (trimmed) createMutation.mutate(trimmed)
    setNewName('')
    setCreating(false)
  }

  return (
    <div className="flex flex-col gap-1">
      <LikedPlaylistRow />
      {playlists.length === 0 && !creating && (
        <p className="px-1 py-2 text-xs text-muted-foreground">{t('media.emptyPlaylists')}</p>
      )}
      {playlists.map((playlist) => (
        <UserPlaylistRow key={playlist.id} id={playlist.id} name={playlist.name} />
      ))}
      {creating ? (
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={commitCreate}
          onKeyDown={(e) => e.key === 'Enter' && commitCreate()}
          placeholder={t('media.newPlaylistNamePlaceholder')}
          className="h-7 text-sm"
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-1"
          onClick={() => {
            committedRef.current = false
            setCreating(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('media.createPlaylist')}
        </Button>
      )}
    </div>
  )
}
