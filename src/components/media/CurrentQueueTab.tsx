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
import { useMediaPlayerStore, type MediaTrack } from '../../stores/mediaPlayerStore'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import { MediaLikeButton } from './MediaLikeButton'
import { MarqueeText } from '../ui/marquee-text'
import { Button } from '../ui/button'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'

function QueueRow({ track, index, isCurrent }: { track: MediaTrack; index: number; isCurrent: boolean }) {
  const { t } = useTranslation()
  const playAt = useMediaPlayerStore((s) => s.playAt)
  const removeFromPlaylist = useMediaPlayerStore((s) => s.removeFromPlaylist)
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: track.path })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 rounded px-1 py-1.5 text-sm transition-colors',
        isCurrent ? 'bg-accent' : 'hover:bg-accent/50'
      )}
    >
      <button
        type="button"
        aria-label={t('media.reorderTrack')}
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
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
      <button type="button" onClick={() => playAt(index)} className="min-w-0 flex-1 text-left">
        <MarqueeText text={track.name} alwaysAnimate={isCurrent} />
      </button>
      <MediaLikeButton path={track.path} name={track.name} />
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 transition-colors hover:text-destructive"
        aria-label={t('media.removeFromPlaylist')}
        onClick={() => removeFromPlaylist(index)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// Second, separate DndContext scoped to just this tab - does not interact
// with ExplorerPage.tsx's own DndContext (different part of the app,
// different drag semantics: reordering an in-memory queue vs. moving files
// on disk). closestCenter (not pointerWithin, unlike Explorer's file-move
// DndContext) is correct here since this is a same-list vertical reorder,
// not a destructive cross-target drop - matching dnd-kit's own recommended
// collision strategy for verticalListSortingStrategy.
export function CurrentQueueTab() {
  const { t } = useTranslation()
  const playlist = useMediaPlayerStore((s) => s.playlist)
  const currentIndex = useMediaPlayerStore((s) => s.currentIndex)
  const reorderPlaylist = useMediaPlayerStore((s) => s.reorderPlaylist)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = playlist.findIndex((track) => track.path === active.id)
    const toIndex = playlist.findIndex((track) => track.path === over.id)
    if (fromIndex === -1 || toIndex === -1) return
    reorderPlaylist(fromIndex, toIndex)
  }

  if (playlist.length === 0) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">{t('media.emptyPlaylistTracks')}</p>
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={playlist.map((track) => track.path)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-0.5">
          {playlist.map((track, index) => (
            <QueueRow key={track.path} track={track} index={index} isCurrent={index === currentIndex} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
