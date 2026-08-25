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
  const [overflowing, setOverflowing] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setOverflowing(isTextOverflowing(el))
  }, [text])

  const animating = overflowing && (alwaysAnimate || hovered)

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn('min-w-0 overflow-hidden', className)}
    >
      {animating ? (
        <div className="flex w-max animate-[marquee_8s_linear_infinite] gap-8">
          <span className="whitespace-nowrap">{text}</span>
          <span className="whitespace-nowrap" aria-hidden="true">
            {text}
          </span>
        </div>
      ) : (
        <span className="block truncate">{text}</span>
      )}
    </div>
  )
}
