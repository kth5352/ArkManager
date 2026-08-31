import { cn } from '../../lib/utils'
import type { PlaylistThumbnailSource } from '../../lib/playlistThumbnailSources'

interface PlaylistThumbnailProps {
  source: PlaylistThumbnailSource
  size: 'sm' | 'md' | 'lg'
  className?: string
}

// sm = 사이드바 행(32px), md = 좁은 상세 화면 레이아웃(64px), lg = 넓은 상세
// 화면 레이아웃(200px) - 브레인스토밍 목업으로 확정된 정확한 값들.
const SIZE_CLASSES: Record<
  PlaylistThumbnailProps['size'],
  { box: string; outerRadius: string; tileRadius: string }
> = {
  sm: { box: 'h-8 w-8', outerRadius: 'rounded-[6px]', tileRadius: 'rounded-[2px]' },
  md: { box: 'h-16 w-16', outerRadius: 'rounded-lg', tileRadius: 'rounded' },
  lg: { box: 'h-50 w-50', outerRadius: 'rounded-xl', tileRadius: 'rounded' },
}

// Renders either a single user-set cover image, or a 2x2 grid of up to 4
// track thumbnails (a null slot renders as an empty placeholder tile) - see
// computePlaylistThumbnailSource for how `source` is derived.
export function PlaylistThumbnail({ source, size, className }: PlaylistThumbnailProps) {
  const sizing = SIZE_CLASSES[size]

  if (source.kind === 'cover') {
    return (
      <div
        className={cn(sizing.box, sizing.outerRadius, 'shrink-0 overflow-hidden bg-muted', className)}
      >
        <img
          src={source.url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        sizing.box,
        sizing.outerRadius,
        'grid shrink-0 grid-cols-2 grid-rows-2 gap-[3px] overflow-hidden bg-border',
        className
      )}
    >
      {source.tileUrls.map((url, index) =>
        url ? (
          <img
            key={index}
            src={url}
            alt=""
            loading="lazy"
            className={cn(sizing.tileRadius, 'h-full w-full object-cover')}
            draggable={false}
          />
        ) : (
          <div key={index} className={cn(sizing.tileRadius, 'h-full w-full bg-muted')} />
        )
      )}
    </div>
  )
}
