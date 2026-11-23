import { useEffect, useRef } from 'react'
import { clampPreviewLeft, formatTime, PREVIEW_PILL_WIDTH, previewCardWidth } from './seekPreview'
import type { SeekPreviewFrame } from './useSeekPreview'

export interface SeekPreviewHover {
  seconds: number
  clientX: number
  // Seek wrapper's left edge and the window width, both read at event time.
  wrapperLeft: number
  viewportWidth: number
}

interface SeekPreviewCardProps {
  hover: SeekPreviewHover | null
  frame: SeekPreviewFrame | null
}

// Scene card above the seek bar (spec §3.7): the frame (when one is ready)
// plus the pointer time, or just the time pill. Absolutely positioned inside
// the seek wrapper (which must be `relative`), so it never shifts layout;
// clamped to the window edges.
export function SeekPreviewCard({ hover, frame }: SeekPreviewCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !frame || typeof ImageData !== 'function') return
    if (canvas.width !== frame.width) canvas.width = frame.width
    if (canvas.height !== frame.height) canvas.height = frame.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    try {
      ctx.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0)
    } catch {
      // Defense in depth (useSeekPreview already drops malformed frames): a
      // throw here would otherwise take the whole player down with it.
    }
  }, [frame])

  if (!hover) return null

  // + the card's 4px padding on each side, so the canvas itself is 240 (192) px.
  const width = frame ? previewCardWidth(hover.viewportWidth) + 8 : PREVIEW_PILL_WIDTH
  const left = clampPreviewLeft(hover.clientX, width, hover.wrapperLeft, hover.viewportWidth)

  return (
    <div
      aria-hidden
      data-seek-preview
      className="pointer-events-none absolute bottom-full z-20 mb-2 flex flex-col items-center gap-1 rounded-md bg-black/85 p-1 shadow-lg"
      style={{ left, width, pointerEvents: 'none' }}
    >
      {frame && (
        <canvas
          ref={canvasRef}
          width={frame.width}
          height={frame.height}
          className="block w-full rounded-sm bg-black"
          style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
        />
      )}
      <span className="text-xs leading-4 text-white tabular-nums">{formatTime(hover.seconds)}</span>
    </div>
  )
}
