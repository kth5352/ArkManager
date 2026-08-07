import { X } from 'lucide-react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

interface MediaPlaylistPanelProps {
  className?: string
  dark?: boolean
}

// Reused by the docked bar's popover, the fullscreen video overlay, and the
// detached player window.
export function MediaPlaylistPanel({ className, dark }: MediaPlaylistPanelProps) {
  const { t } = useTranslation()
  const playlist = useMediaPlayerStore((s) => s.playlist)
  const currentIndex = useMediaPlayerStore((s) => s.currentIndex)
  const playAt = useMediaPlayerStore((s) => s.playAt)
  const removeFromPlaylist = useMediaPlayerStore((s) => s.removeFromPlaylist)

  return (
    <div className={cn('flex flex-col gap-1 overflow-y-auto', className)}>
      {playlist.map((track, i) => (
        <div
          key={track.path}
          className={cn(
            'flex items-center gap-1 rounded px-2 py-1 text-xs',
            i === currentIndex
              ? dark
                ? 'bg-white/20'
                : 'bg-accent'
              : dark
                ? 'hover:bg-white/10'
                : 'hover:bg-accent/50'
          )}
        >
          <button
            className={cn('min-w-0 flex-1 truncate text-left', dark && 'text-white')}
            onClick={() => playAt(i)}
          >
            {track.name}
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeFromPlaylist(i)}
            aria-label={t('media.removeFromPlaylist')}
            className={cn(
              'h-7 w-7 shrink-0 hover:text-destructive',
              dark ? 'text-white/70' : 'text-muted-foreground'
            )}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  )
}
