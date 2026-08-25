import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { isTextOverflowing } from '../../lib/isTextOverflowing'

interface MarqueeTextProps {
  text: string
  className?: string
  // true for a track that's continuously marqueeing regardless of hover
  // (the currently-playing queue row) - false (default) marquees only
  // while the pointer is over it (every other truncated label in the
  // sidebar/dock bar).
  alwaysAnimate?: boolean
}

// A truncate-by-default label that switches to an infinite right-to-left
// scroll ONLY when its own text genuinely overflows its container (measured
// via scrollWidth/clientWidth, not assumed from length) - a short name
// never animates, even when alwaysAnimate is true. Re-measures whenever
// `text` changes (a new track/playlist name) since overflow depends on the
// actual rendered content, not just container width.
export function MarqueeText({ text, className, alwaysAnimate = false }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Stays mounted (as the `truncate` span) in BOTH the animating and
  // non-animating branches below - only its `invisible` class toggles when
  // the two-copy marquee overlay is shown on top of it. This is what makes
  // it safe to re-measure on a later `text` change even while already
  // animating: an element that unmounted in the animating branch instead
  // couldn't be re-measured, leaving `overflowing` stale.
  const textRef = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    const textEl = textRef.current
    if (!container || !textEl) return
    // Compare the raw (unclipped) text's own rendered width against the
    // container's visible width, NOT containerRef's own scrollWidth - a
    // `truncate` span is its own scroll container (Tailwind's `truncate`
    // includes `overflow: hidden`), so its overflow never propagates up to
    // containerRef, and containerRef.scrollWidth === containerRef.clientWidth
    // even when the text is genuinely overflowing.
    setOverflowing(
      isTextOverflowing({ scrollWidth: textEl.scrollWidth, clientWidth: container.clientWidth } as HTMLElement)
    )
  }, [text])

  const animating = overflowing && (alwaysAnimate || hovered)

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn('relative min-w-0 overflow-hidden', className)}
    >
      <span
        ref={textRef}
        className={cn('block truncate', animating && 'invisible')}
      >
        {text}
      </span>
      {animating && (
        <div className="absolute left-0 top-0 flex w-max animate-[marquee_8s_linear_infinite]">
          <span className="mr-8 whitespace-nowrap">{text}</span>
          <span className="mr-8 whitespace-nowrap" aria-hidden="true">
            {text}
          </span>
        </div>
      )}
    </div>
  )
}
