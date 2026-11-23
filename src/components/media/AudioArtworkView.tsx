import { useEffect, useRef, useState } from 'react'
import { Music } from 'lucide-react'
import type { MediaCoverInfo } from '../../../shared/types/ipc'
import { useTranslation } from '../../i18n/useTranslation'
import {
  buildMediaCoverUrl,
  buildMediaThumbnailUrl,
} from '../../services/mediaThumbnailProtocolService'
import { cn } from '../../lib/utils'
import { coverBoxSize, type BoxSize, type CoverDisplay } from './coverLayout'

// Background of the no-cover look (spec §3.3, mockup "1. 차분한 기본 화면").
const NO_COVER_BACKGROUND = 'radial-gradient(circle at 30% 40%, #2b3a55, #0d1117 70%)'

interface AudioArtworkViewProps {
  path: string
  title: string
  fileName: string
  display: CoverDisplay
  coverInfo: MediaCoverInfo | undefined
  // Enlarged cover (spec §3.2) - only honoured while a cover is shown.
  expanded: boolean
  onToggleExpanded: () => void
  // Either <img> failed: the parent switches this track to the no-cover look.
  onCoverError: () => void
  // Layout height of the bottom control band; the default layout keeps the
  // cover and text above it (the band keeps its height while auto-hidden).
  bottomInset: number
}

// Title + file name, shared by the default layout's right column and the
// enlarged layout's bottom band.
export function AudioTrackHeading({
  title,
  fileName,
  size,
}: {
  title: string
  fileName: string
  size: 'large' | 'band'
}) {
  return (
    <div className="min-w-0">
      <p
        data-testid="audio-title"
        className={cn(
          'line-clamp-3 font-semibold break-words text-white',
          size === 'large' ? 'text-3xl leading-tight' : 'text-sm'
        )}
      >
        {title}
      </p>
      <p
        data-testid="audio-file-name"
        className={cn('truncate text-white/60', size === 'large' ? 'mt-2 text-sm' : 'text-xs')}
      >
        {fileName}
      </p>
    </div>
  )
}

// The audio branch of FullscreenPlayerView: blurred cover background, cover
// on the left with the title on the right (spec §3.1), the cover enlarged to
// fit the whole view on click (§3.2), or a calm placeholder when the track has
// no cover (§3.3).
export function AudioArtworkView({
  path,
  title,
  fileName,
  display,
  coverInfo,
  expanded,
  onToggleExpanded,
  onCoverError,
  bottomInset,
}: AudioArtworkViewProps) {
  const { t } = useTranslation()
  const hasCover = display === 'cover' && coverInfo !== undefined
  const showExpanded = hasCover && expanded

  // The area the default layout's cover box is fitted into.
  const areaRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState<BoxSize>({ width: 0, height: 0 })
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      setArea((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height }
      )
    })
    observer.observe(el)
    return () => observer.disconnect()
    // The measured row only exists in the default layout: re-attach when
    // the enlarged layout gives it back.
  }, [showExpanded])
  const box = coverBoxSize(area, hasCover ? (coverInfo.aspectRatio ?? 1) : 1)
  const coverUrl = hasCover ? buildMediaCoverUrl(path, coverInfo.version) : null

  return (
    <div
      data-testid="audio-artwork"
      data-cover-display={display}
      className="absolute inset-0 overflow-hidden"
      style={hasCover ? undefined : { background: NO_COVER_BACKGROUND }}
    >
      {hasCover && (
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
          type="button"
          onClick={onToggleExpanded}
          aria-label={t('media.collapseCover')}
          className="absolute inset-0 flex cursor-zoom-out items-center justify-center focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none focus-visible:ring-inset"
        >
          <img
            src={coverUrl!}
            alt=""
            draggable={false}
            onError={onCoverError}
            className="h-full w-full object-contain"
          />
        </button>
      ) : (
        <div
          className="absolute inset-x-0 top-0 flex items-center justify-center px-[8%]"
          style={{ bottom: bottomInset }}
        >
          <div ref={areaRef} className="flex h-full w-full items-center gap-[5%]">
            {hasCover ? (
              <button
                type="button"
                onClick={onToggleExpanded}
                aria-label={t('media.expandCover')}
                className="shrink-0 cursor-zoom-in overflow-hidden rounded-[10px] shadow-[0_20px_50px_rgba(0,0,0,0.55)] focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
                style={{ width: box.width, height: box.height }}
              >
                <img
                  src={coverUrl!}
                  alt=""
                  draggable={false}
                  onError={onCoverError}
                  className="h-full w-full object-contain"
                />
              </button>
            ) : (
              <div
                data-testid="audio-cover-placeholder"
                aria-hidden
                className="flex shrink-0 items-center justify-center rounded-[10px] border border-white/12 bg-white/[0.06]"
                style={{ width: box.width, height: box.height }}
              >
                {display === 'none' && (
                  <div className="flex aspect-square w-2/5 items-center justify-center rounded-full bg-white/12 text-white/50">
                    <Music className="h-1/2 w-1/2" strokeWidth={1.5} />
                  </div>
                )}
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="text-xs tracking-[0.08em] text-white/60 uppercase">
                {t('media.nowPlaying')}
              </p>
              <AudioTrackHeading title={title} fileName={fileName} size="large" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
