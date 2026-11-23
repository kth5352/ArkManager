import type { FocusEvent, MouseEvent, ReactNode, Ref } from 'react'
import { Captions, Expand, ListMusic, Minimize2, PictureInPicture2, Shrink } from 'lucide-react'
import { MediaTransportBar } from './MediaTransportBar'
import { MediaLikeButton } from './MediaLikeButton'
import { MEDIA_ACCENT, isKeyboardFocus, progressFraction } from './playerView'
import type { MediaPlaybackState } from './useMediaPlayback'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'
import { HoverTooltip } from '../ui/hover-tooltip'
import { Button } from '../ui/button'

export type ControlBand = 'top' | 'bottom'

interface PlayerControlBandsProps {
  playback: MediaPlaybackState
  mode: 'overlay' | 'detached'
  // False while auto-hidden: the bands fade out and stop taking pointer
  // input, but keep their layout (the sidebar anchors to the bottom band's
  // measured height, which must not jump).
  visible: boolean
  onMinimize?: () => void
  onDetach?: () => void
  lyricsEnabled: boolean
  hasLyrics: boolean
  hasSyncedLyrics: boolean
  onToggleLyrics?: () => void
  subtitlePipOpen: boolean
  playlistActive: boolean
  playlistLabel: string
  onTogglePlaylist: () => void
  fullscreen: boolean
  onToggleFullscreen: () => void
  topBandExtra?: ReactNode
  // Right inset of the top band (px) so it ends where an open sidebar starts.
  topInsetRight?: number
  bottomBandRef?: Ref<HTMLDivElement>
  onPointerOverChange: (band: ControlBand, over: boolean) => void
  onFocusInChange: (band: ControlBand, focused: boolean) => void
  onDraggingChange: (dragging: boolean) => void
  onPopoverOpenChange: (open: boolean) => void
}

const iconButton = 'shrink-0 text-white/70 hover:text-white'

// The fullscreen view's top band (title + window actions) and bottom band
// (transport + every action the old overlay bar had, spec §3.8), plus the
// 2px progress line left at the very bottom while the bands are hidden.
export function PlayerControlBands({
  playback,
  mode,
  visible,
  onMinimize,
  onDetach,
  lyricsEnabled,
  hasLyrics,
  hasSyncedLyrics,
  onToggleLyrics,
  subtitlePipOpen,
  playlistActive,
  playlistLabel,
  onTogglePlaylist,
  fullscreen,
  onToggleFullscreen,
  topBandExtra,
  topInsetRight = 0,
  bottomBandRef,
  onPointerOverChange,
  onFocusInChange,
  onDraggingChange,
  onPopoverOpenChange,
}: PlayerControlBandsProps) {
  const { t } = useTranslation()

  const bandEvents = (band: ControlBand) => ({
    onPointerEnter: () => onPointerOverChange(band, true),
    onPointerLeave: () => onPointerOverChange(band, false),
    onFocus: (e: FocusEvent<HTMLDivElement>) =>
      onFocusInChange(band, isKeyboardFocus(e.target as Element)),
    onBlur: (e: FocusEvent<HTMLDivElement>) => {
      // Moving focus within the band is followed by its own onFocus.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        onFocusInChange(band, false)
      }
    },
  })

  const handleToggleSubtitlePip = (e: MouseEvent): void => {
    e.stopPropagation()
    if (subtitlePipOpen) window.api.media.closeSubtitlePipWindow()
    else window.api.media.openSubtitlePipWindow()
  }

  const bandFade = cn(
    'absolute left-0 transition-opacity duration-200 motion-reduce:transition-none',
    visible ? 'opacity-100' : 'pointer-events-none opacity-0'
  )
  const fullscreenLabel = fullscreen ? t('media.exitFullscreen') : t('media.enterFullscreen')
  const fraction = progressFraction(playback.currentTime, playback.duration)

  return (
    <>
      <div
        {...bandEvents('top')}
        data-control-band="top"
        className={cn(
          bandFade,
          'top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-[3%] pt-2.5 pb-6'
        )}
        style={{ right: topInsetRight }}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
          {playback.title || playback.track.name}
        </span>
        {topBandExtra}
        {mode === 'overlay' && onDetach && (
          <HoverTooltip content={t('media.detachWindow')}>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDetach}
              aria-label={t('media.detachWindow')}
              className={iconButton}
            >
              <PictureInPicture2 className="h-4 w-4" />
            </Button>
          </HoverTooltip>
        )}
        {mode === 'overlay' && onMinimize && (
          <HoverTooltip content={t('media.minimize')}>
            <Button
              variant="ghost"
              size="icon"
              onClick={onMinimize}
              aria-label={t('media.minimize')}
              className={iconButton}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </HoverTooltip>
        )}
      </div>

      <div
        {...bandEvents('bottom')}
        ref={bottomBandRef}
        data-control-band="bottom"
        className={cn(
          bandFade,
          'right-0 bottom-0 bg-gradient-to-b from-transparent to-black/80 px-[3%] pt-6 pb-2.5'
        )}
      >
        <MediaTransportBar
          playback={playback}
          dark
          compact
          variant="band"
          lyricsEnabled={lyricsEnabled}
          hasLyrics={hasLyrics}
          onToggleLyrics={onToggleLyrics}
          onDraggingChange={onDraggingChange}
          onPopoverOpenChange={onPopoverOpenChange}
          trailing={
            <>
              <MediaLikeButton
                path={playback.track.path}
                name={playback.track.name}
                className="text-white/70 transition-colors hover:text-white"
              />
              <HoverTooltip content={t('media.subtitlePipToggle')}>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={!hasSyncedLyrics && !subtitlePipOpen}
                  onClick={handleToggleSubtitlePip}
                  aria-label={t('media.subtitlePipToggle')}
                  aria-pressed={subtitlePipOpen}
                  className={cn(iconButton, subtitlePipOpen && 'text-white')}
                >
                  <Captions className="h-4 w-4" />
                </Button>
              </HoverTooltip>
              <HoverTooltip content={playlistLabel}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onTogglePlaylist}
                  aria-label={playlistLabel}
                  aria-pressed={playlistActive}
                  className={cn(iconButton, playlistActive && 'text-white')}
                >
                  <ListMusic className="h-4 w-4" />
                </Button>
              </HoverTooltip>
              <HoverTooltip content={fullscreenLabel}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleFullscreen}
                  aria-label={fullscreenLabel}
                  className={iconButton}
                >
                  {fullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                </Button>
              </HoverTooltip>
            </>
          }
        />
      </div>

      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-0 bottom-0 left-0 h-[2px] bg-white/20 transition-opacity duration-200 motion-reduce:transition-none',
          visible ? 'opacity-0' : 'opacity-100'
        )}
      >
        <div className="h-full" style={{ width: `${fraction * 100}%`, background: MEDIA_ACCENT }} />
      </div>
    </>
  )
}
