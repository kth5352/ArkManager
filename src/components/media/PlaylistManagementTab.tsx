import { useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, GripVertical, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
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
import { DeletePlaylistConfirmDialog } from './DeletePlaylistConfirmDialog'
import type { MediaPlaylistTrackDto } from '../../../shared/types/ipc'

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
            <li key={track.path} className="flex items-center gap-1 px-1 py-1 text-xs text-muted-foreground">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
                <img
                  src={buildMediaThumbnailUrl(track.path)}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                  draggable={false}
                  onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                />
              </div>
              <span className="min-w-0 flex-1 truncate">{track.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// One track row within an expanded playlist - draggable via dnd-kit's
// useSortable, mirroring CurrentQueueTab.tsx's QueueRow exactly (same
// track.path-as-id convention). Kept as its own component (rather than
// inline in the .map below) purely for readability; unlike
// AddToSavedPlaylistDialog's AppendButton, this isn't a hooks-in-a-loop
// requirement, useSortable is fine to call from inside a .map callback
// too, but a named component reads clearer here.
function PlaylistTrackRow({
  track,
  disabled,
  onRemove,
}: {
  track: MediaPlaylistTrackDto
  disabled: boolean
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: track.path,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-1 px-1 py-1 text-xs text-muted-foreground"
    >
      <button
        type="button"
        aria-label={t('media.reorderTrack')}
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
        <img
          src={buildMediaThumbnailUrl(track.path)}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          draggable={false}
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
        />
      </div>
      <span className="min-w-0 flex-1 truncate">{track.name}</span>
      <button
        type="button"
        aria-label={t('media.removeFromPlaylist')}
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

function UserPlaylistRow({
  id,
  name,
  onRequestDelete,
}: {
  id: string
  name: string
  onRequestDelete: (playlist: { id: string; name: string }) => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(name)
  // Read the full query object (not just `.data`) so removeTrack/
  // handleDragEnd below can also guard on isFetching, not just the
  // mutation's own isPending - useSetMediaPlaylistTracks's onSuccess fires
  // invalidateQueries without awaiting it, so isPending flips back to false
  // before the refetch it triggered actually lands with the post-reorder
  // tracks. Without also checking isFetching, a second rapid drag/remove in
  // that window reads this stale `tracks` array and full-replaces the
  // playlist from it, silently discarding the first reorder - the same
  // staleness race Task 4 already fixed once for removeTrack alone.
  const tracksQuery = useMediaPlaylistTracks(id)
  const tracks = tracksQuery.data ?? []
  const renameMutation = useRenameMediaPlaylist()
  const deleteMutation = useDeleteMediaPlaylist()
  const setTracksMutation = useSetMediaPlaylistTracks(id)
  const playNow = useMediaPlayerStore((s) => s.playNow)
  // Own DndContext scoped to just this row's track list (not one shared
  // across all playlists) - multiple playlists can be expanded
  // simultaneously, so a shared context would let a drag started in one
  // playlist's list interact with another's. Same PointerSensor/
  // closestCenter configuration as CurrentQueueTab.tsx's session-queue
  // reorder.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const commitRename = (): void => {
    if (renameMutation.isPending) return
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== name) renameMutation.mutate({ id, name: trimmed })
    setRenaming(false)
  }

  const requestDelete = (): void => {
    if (deleteMutation.isPending) return
    onRequestDelete({ id, name })
  }

  const removeTrack = (path: string): void => {
    if (setTracksMutation.isPending || tracksQuery.isFetching) return
    setTracksMutation.mutate(tracks.filter((track) => track.path !== path))
  }

  // Reuses the exact same guard removeTrack already established (Task 4's
  // race-condition fix, extended here to also cover tracksQuery.isFetching
  // - see the comment above tracksQuery's declaration) - a drag-reorder
  // must not fire while a remove/create/reorder is still in flight (or its
  // resulting refetch still pending) for this same playlist, and vice
  // versa, or the two mutate() calls would race against each other on the
  // same full-replace endpoint using stale data.
  const handleDragEnd = (event: DragEndEvent): void => {
    if (setTracksMutation.isPending || tracksQuery.isFetching) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = tracks.findIndex((track) => track.path === active.id)
    const toIndex = tracks.findIndex((track) => track.path === over.id)
    if (fromIndex === -1 || toIndex === -1) return
    const reordered = [...tracks]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    setTracksMutation.mutate(reordered)
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
          disabled={renameMutation.isPending}
          onClick={() => setRenaming(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 hover:text-destructive"
          aria-label={t('media.deletePlaylist')}
          disabled={deleteMutation.isPending}
          onClick={requestDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {expanded && (
        <div className="ml-5 flex flex-col gap-0.5">
          {tracks.length === 0 && (
            <p className="px-1 py-1 text-xs text-muted-foreground">{t('media.emptyPlaylistTracks')}</p>
          )}
          {tracks.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={tracks.map((track) => track.path)}
                strategy={verticalListSortingStrategy}
              >
                {tracks.map((track) => (
                  <PlaylistTrackRow
                    key={track.path}
                    track={track}
                    disabled={setTracksMutation.isPending || tracksQuery.isFetching}
                    onRemove={() => removeTrack(track.path)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  )
}

export function PlaylistManagementTab() {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  const [pendingDeletePlaylist, setPendingDeletePlaylist] = useState<{
    id: string
    name: string
  } | null>(null)
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
    <>
      <div className="flex flex-col gap-1">
        <LikedPlaylistRow />
        {playlists.length === 0 && !creating && (
          <p className="px-1 py-2 text-xs text-muted-foreground">{t('media.emptyPlaylists')}</p>
        )}
        {playlists.map((playlist) => (
          <UserPlaylistRow
            key={playlist.id}
            id={playlist.id}
            name={playlist.name}
            onRequestDelete={setPendingDeletePlaylist}
          />
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
      <DeletePlaylistConfirmDialog
        playlist={pendingDeletePlaylist}
        onClose={() => setPendingDeletePlaylist(null)}
      />
    </>
  )
}
