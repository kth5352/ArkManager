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
import { GripVertical, X } from 'lucide-react'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import { MarqueeText } from '../ui/marquee-text'
import { useTranslation } from '../../i18n/useTranslation'
import type { MediaPlaylistTrackDto } from '../../../shared/types/ipc'

function PlaylistTrackRow({
  track,
  disabled,
  onClick,
  onRemove,
}: {
  track: MediaPlaylistTrackDto
  disabled: boolean
  onClick: () => void
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
        className="shrink-0 cursor-grab touch-none text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
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
      <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
        <MarqueeText text={track.name} />
      </button>
      <button
        type="button"
        aria-label={t('media.removeFromPlaylist')}
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0 transition-colors hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

interface PlaylistTrackListProps {
  tracks: MediaPlaylistTrackDto[]
  disabled: boolean
  onPlayTrack: (index: number) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onRemove: (path: string) => void
}

// Drag-reorder + per-track delete for a saved playlist's track list -
// extracted from PlaylistManagementTab.tsx's former expand-in-place view
// (removed entirely there in favor of navigating to PlaylistDetailView,
// the sole remaining consumer). Callers own the actual mutation/store
// wiring (onReorder/onRemove take already-resolved indices/paths) so this
// component has no dependency on which kind of playlist is being shown.
export function PlaylistTrackList({
  tracks,
  disabled,
  onPlayTrack,
  onReorder,
  onRemove,
}: PlaylistTrackListProps) {
  const { t } = useTranslation()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragEnd = (event: DragEndEvent): void => {
    if (disabled) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = tracks.findIndex((track) => track.path === active.id)
    const toIndex = tracks.findIndex((track) => track.path === over.id)
    if (fromIndex === -1 || toIndex === -1) return
    onReorder(fromIndex, toIndex)
  }

  if (tracks.length === 0) {
    return <p className="px-1 py-1 text-xs text-muted-foreground">{t('media.emptyPlaylistTracks')}</p>
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tracks.map((track) => track.path)} strategy={verticalListSortingStrategy}>
        {tracks.map((track, index) => (
          <PlaylistTrackRow
            key={track.path}
            track={track}
            disabled={disabled}
            onClick={() => onPlayTrack(index)}
            onRemove={() => onRemove(track.path)}
          />
        ))}
      </SortableContext>
    </DndContext>
  )
}
