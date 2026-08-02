import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

interface HoverTooltipProps {
  content: ReactNode
  children: ReactNode
  className?: string
  style?: CSSProperties
}

// Rendered into document.body via a portal (not positioned relative to its
// trigger in the normal DOM flow) so it isn't clipped by an ancestor's
// overflow:auto/hidden - the exact situation a virtualized, scrollable
// DetailList row sits inside. Position is computed from the trigger's own
// bounding rect on hover, not tracked continuously, since the trigger only
// needs to be readable while the mouse stays over it (it isn't expected to
// move mid-hover in a static table row).
export function HoverTooltip({ content, children, className, style }: HoverTooltipProps) {
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number } | null>(
    null
  )
  const triggerRef = useRef<HTMLSpanElement>(null)

  // A fixed-position box with only `left` set shrink-to-fits within the
  // space between `left` and the viewport's right edge (CSS abspos
  // shrink-to-fit, not just a visual clip) - a trigger sitting in the right
  // half of the window (the detail sidebar's own buttons, DetailList's
  // rightmost columns) leaves too little room there, so short text wraps
  // across several lines instead of rendering on one. Anchoring via `right`
  // instead lets the box grow leftward from the trigger, which always has
  // the whole window to its left.
  const handleMouseEnter = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const top = rect.bottom + 4
    if (rect.left > window.innerWidth / 2) {
      setPosition({ top, right: window.innerWidth - rect.right })
    } else {
      setPosition({ top, left: rect.left })
    }
  }

  return (
    <span
      ref={triggerRef}
      className={cn('min-w-0', className)}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPosition(null)}
    >
      {children}
      {position &&
        createPortal(
          <div
            className="fixed z-50 max-w-md break-words rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
            style={{ top: position.top, left: position.left, right: position.right }}
          >
            {content}
          </div>,
          document.body
        )}
    </span>
  )
}
