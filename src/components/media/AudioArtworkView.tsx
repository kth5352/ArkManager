import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { Music } from 'lucide-react'
import type { MediaCoverInfo } from '../../../shared/types/ipc'
import { useTranslation } from '../../i18n/useTranslation'
import {
  buildMediaCoverUrl,
  buildMediaThumbnailUrl,
} from '../../services/mediaThumbnailProtocolService'
import { cn } from '../../lib/utils'
import {
  STACKED_CAPS,
  SIDE_BY_SIDE_CAPS,
  coverBoxSize,
  isNarrowCoverLayout,
  type BoxSize,
  type CoverDisplay,
} from './coverLayout'

// Background of the no-cover look (spec §3.3, mockup "1. 차분한 기본 화면").
const NO_COVER_BACKGROUND = 'radial-gradient(circle at 30% 40%, #2b3a55, #0d1117 70%)'

// The look the view keeps while the current track's cover info is still
// loading: the last resolved track's (see FullscreenPlayerView), or null
// before any track resolved (a neutral dark shell).
export interface AudioShell {
  kind: 'cover' | 'none'
  accent: string | null
  aspectRatio: number | null
}

interface AudioArtworkViewProps {
  path: string
  title: string
  fileName: string
  // The CURRENT track's state - only 'cover' renders images, so a kept shell
  // never shows the previous track's cover under the new path.
  display: CoverDisplay
  coverInfo: MediaCoverInfo | undefined
  shell: AudioShell | null
  // Enlarged cover (spec §3.2) - only honoured while the shell has a cover.
  expanded: boolean
  // False while the controls are auto-hidden: the zoom cursors would
  // otherwise override the root's cursor: none (spec §3.5).
  controlsVisible: boolean
  onToggleExpanded: () => void
  // Either <img> failed: the parent switches this track to the no-cover look.
  onCoverError: () => void
  // Layout height of the bottom control band; the default layout keeps the
  // cover and text above it (the band keeps its height while auto-hidden).
  bottomInset: number
}

// Title + file name, shared by the default layout's text column and the
// enlarged layout's bottom band.
export function AudioTrackHeading({
  title,
  fileName,
  size,
}: {
  title: string
  fileName: string
  size: 'large' | 'medium' | 'band'
}) {
  return (
    <div className="min-w-0">
      <p
        data-testid="audio-title"
        className={cn(
          'line-clamp-3 font-semibold break-words text-white',
          size === 'large' && 'text-3xl leading-tight',
          size === 'medium' && 'text-xl leading-snug',
          size === 'band' && 'text-sm'
        )}
      >
        {title}
      </p>
      <p
        data-testid="audio-file-name"
        className={cn(
          'line-clamp-2 text-white/60 [overflow-wrap:anywhere]',
          size === 'band' ? 'text-xs' : 'mt-2 text-sm'
        )}
      >
        {fileName}
      </p>
    </div>
  )
}

// The audio branch of FullscreenPlayerView: blurred cover background, cover
// on the left with the title on the right (spec §3.1; stacked in narrow
// windows), the cover enlarged to fit the whole view on click (§3.2), or a
// calm placeholder when the track has no cover (§3.3).
export function AudioArtworkView({
  path,
  title,
  fileName,
  display,
  coverInfo,
  shell,
  expanded,
  controlsVisible,
  onToggleExpanded,
  onCoverError,
  bottomInset,
}: AudioArtworkViewProps) {
  const { t } = useTranslation()
  const imagesReady = display === 'cover' && coverInfo !== undefined
  const coverShell = shell?.kind === 'cover'
  const showExpanded = coverShell && expanded
  const coverVersion = imagesReady ? coverInfo.version : null
  const coverUrl = coverVersion !== null ? buildMediaCoverUrl(path, coverVersion) : null

  // The area the default layout's cover box is fitted into. Measured
  // synchronously before the first paint (no 0×0 frame), then observed.
  const areaRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState<BoxSize>({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const measure = (): void => {
      const rect = el.getBoundingClientRect()
      setArea((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height }
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
    // The measured row only exists in the default layout: re-attach when
    // the enlarged layout gives it back.
  }, [showExpanded])
  const narrow = isNarrowCoverLayout(area.width)
  const box = coverBoxSize(
    area,
    coverShell ? (shell.aspectRatio ?? 1) : 1,
    narrow ? STACKED_CAPS : SIDE_BY_SIDE_CAPS
  )

  // Expand and collapse are different buttons in different layouts, so the
  // one that had focus unmounts on toggle - hand focus to its replacement.
  const coverButtonRef = useRef<HTMLButtonElement>(null)
  const refocusRef = useRef(false)
  const handleToggle = (e: MouseEvent<HTMLButtonElement>): void => {
    refocusRef.current = document.activeElement === e.currentTarget
    onToggleExpanded()
  }
  useLayoutEffect(() => {
    if (!refocusRef.current) return
    refocusRef.current = false
    coverButtonRef.current?.focus()
  }, [showExpanded])

  const zoomCursor = (zoom: 'cursor-zoom-in' | 'cursor-zoom-out'): string =>
    controlsVisible ? zoom : 'cursor-none'

  return (
    <div
      data-testid="audio-artwork"
      data-cover-display={display}
      className="absolute inset-0 overflow-hidden"
      style={shell?.kind === 'none' ? { background: NO_COVER_BACKGROUND } : undefined}
    >
      {imagesReady && (
        <>
          {/* 512px is plenty under a 40px blur and far cheaper to decode. */}
          <img
            src={buildMediaThumbnailUrl(path, coverInfo.version)}
            alt=""
            aria-hidden
            draggable={false}
            onError={onCoverError}
            className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-75"
            style={{ filter: 'blur(40px) saturate(1.2)' }}
          />
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 to-black/85',
              showExpanded && 'opacity-60'
            )}
          />
        </>
      )}

      {showExpanded ? (
        <button
          ref={coverButtonRef}
          type="button"
          onClick={handleToggle}
          aria-label={t('media.collapseCover')}
          className={cn(
            'absolute inset-0 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none focus-visible:ring-inset',
            zoomCursor('cursor-zoom-out')
          )}
        >
          {coverUrl && (
            <img
              src={coverUrl}
              alt=""
              draggable={false}
              onError={onCoverError}
              className="h-full w-full object-contain"
            />
          )}
        </button>
      ) : (
        <div
          className="absolute inset-x-0 top-0 flex items-center justify-center overflow-hidden px-[8%]"
          style={{ bottom: bottomInset }}
        >
          <div
            ref={areaRef}
            data-testid="audio-cover-area"
            data-layout={narrow ? 'stacked' : 'side-by-side'}
            className={cn(
              'flex h-full w-full min-w-0',
              narrow ? 'flex-col items-center justify-center gap-4' : 'items-center gap-[5%]'
            )}
          >
            {coverShell ? (
              <button
                ref={coverButtonRef}
                type="button"
                onClick={handleToggle}
                aria-label={t('media.expandCover')}
                className={cn(
                  'shrink-0 overflow-hidden rounded-[10px] shadow-[0_20px_50px_rgba(0,0,0,0.55)] focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none',
                  zoomCursor('cursor-zoom-in')
                )}
                style={{ width: box.width, height: box.height }}
              >
                {coverUrl && (
                  <img
                    src={coverUrl}
                    alt=""
                    draggable={false}
                    onError={onCoverError}
                    className="h-full w-full object-contain"
                  />
                )}
              </button>
            ) : (
              <div
                data-testid="audio-cover-placeholder"
                aria-hidden
                className="flex shrink-0 items-center justify-center rounded-[10px] border border-white/12 bg-white/[0.06]"
                style={{ width: box.width, height: box.height }}
              >
                {shell?.kind === 'none' && (
                  <div className="flex aspect-square w-2/5 items-center justify-center rounded-full bg-white/12 text-white/50">
                    <Music className="h-1/2 w-1/2" strokeWidth={1.5} />
                  </div>
                )}
              </div>
            )}
            <div
              className={cn(
                'flex min-w-0 flex-col gap-1.5',
                narrow ? 'w-full flex-none text-center' : 'flex-1'
              )}
            >
              <p className="text-xs tracking-[0.08em] text-white/60 uppercase">
                {t('media.nowPlaying')}
              </p>
              <AudioTrackHeading
                title={title}
                fileName={fileName}
                size={narrow ? 'medium' : 'large'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
