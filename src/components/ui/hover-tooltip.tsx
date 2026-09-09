import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import { UI_MOTION } from '../../lib/motion'
import { placeTooltip } from '../../lib/tooltipPosition'

interface HoverTooltipProps {
  content: ReactNode
  children: ReactNode
  className?: string
  style?: CSSProperties
  // Hover-open delay in ms - defaults to UI_MOTION.tooltipDelayMs. Focus
  // always opens immediately regardless of this value (design §5 rule 1).
  delayMs?: number
  // Where the tooltip portals to - defaults to document.body. A Radix
  // Dialog's content is marked inert/aria-hidden from outside its own
  // subtree while open, which can make a body-portaled tooltip unreadable
  // to assistive tech even though it's visually on top (z-100) - a caller
  // showing a tooltip INSIDE a dialog can pass that dialog's own content
  // element here instead.
  portalContainer?: HTMLElement | null
}

// A truncated/icon-only trigger's tooltip content can occasionally be wider
// than the wrapper itself expects mid-measurement; clamped the same way the
// design spec's own width rule states - min(28rem, 100vw - 16px). Expressed
// in px at render time since placeTooltip's Size type is px, not CSS units.
const MAX_WIDTH_PX = 448 // 28rem at the default 16px root font size

export function HoverTooltip({
  content,
  children,
  className,
  style,
  delayMs = UI_MOTION.tooltipDelayMs,
  portalContainer,
}: HoverTooltipProps) {
  const tooltipId = useId()
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The real DOM element that received keyboard focus (event.target of the
  // capture-phase focusin, not the wrapper span) - aria-describedby is
  // attached directly to THIS element via ref, not the wrapper, since a
  // wrapper-only description is invisible to assistive tech reading the
  // actual focused control. Hover-only opens never touch this - mouse users
  // don't need an aria-describedby, and there is no well-defined single
  // "trigger element" to attach one to when children isn't a single element
  // (a string, a fragment) the way there reliably is for focus's event.target.
  const focusedElementRef = useRef<HTMLElement | null>(null)
  const previousDescribedByRef = useRef<string | null>(null)

  const [hoverOpen, setHoverOpen] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  const open = hoverOpen || focusOpen
  // null until the first post-open layout measurement - rendered invisible
  // (not unmounted) at that point so its real size can be measured without
  // ever painting at the wrong, pre-measurement position (design §2's "모서리
  // 점프를 줄인다" - reduce corner jump).
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null)

  const clearHoverTimer = (): void => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  const close = (): void => {
    clearHoverTimer()
    setHoverOpen(false)
    setFocusOpen(false)
    setCoords(null)
  }

  // Re-measure and reposition whenever `open` flips true, or the content
  // itself changes while already open (a virtualized row reusing this exact
  // component instance for a new entry, e.g. react-window recycling a
  // CurrentQueueTab row - the previous entry's label must never linger).
  // Runs in useLayoutEffect (before paint) so the invisible-measurement
  // frame above is never actually visible to the user.
  useLayoutEffect(() => {
    if (!open) return
    const triggerEl = wrapperRef.current
    const tooltipEl = tooltipRef.current
    if (!triggerEl || !tooltipEl) return
    const trigger = triggerEl.getBoundingClientRect()
    const tooltip = { width: tooltipEl.offsetWidth, height: tooltipEl.offsetHeight }
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    setCoords(placeTooltip(trigger, tooltip, viewport))
    // content is a dependency deliberately, even though it isn't read in
    // this effect body - a virtualized row reusing this exact component
    // instance for a new entry (react-window recycling a CurrentQueueTab
    // row) needs the box re-measured/repositioned for the new label's size,
    // not just repainted at the old one's coordinates.
  }, [open, content])

  // Close (not just reposition) when content changes while already open -
  // the previous entry's tooltip text must never linger against a new
  // trigger. A fresh mouseenter/focus on the new content reopens it. Adjusts
  // state directly during render (React's documented pattern for "reset
  // state when a prop changes" - see https://react.dev/learn/you-might-not-need-an-effect)
  // rather than a useEffect + setState, which would cost an extra
  // discarded render.
  const [prevContent, setPrevContent] = useState(content)
  if (content !== prevContent) {
    setPrevContent(content)
    if (open) {
      // Deliberately does NOT also clear a still-pending hover-open timer
      // here (that would need touching hoverTimerRef during render, which
      // React disallows) - if one is in flight, it fires later and reopens
      // for whatever content is current AT THAT POINT, which is correct:
      // the mouse never left the trigger, it's still genuinely hovering
      // this same screen position, just over newly-recycled content.
      setHoverOpen(false)
      setFocusOpen(false)
      setCoords(null)
    }
  }

  // Escape / click / ancestor scroll / resize all close the tooltip -
  // registered only while open, not permanently, so these don't add
  // per-instance global listeners for the (overwhelmingly common) closed
  // state of every icon button in the app at once.
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    const handleClick = (): void => close()
    // capture: true - scroll events don't bubble, but DO fire in the
    // capture phase for every ancestor, so this is how "some ancestor
    // scrolled" is detected without knowing which ancestor in advance.
    const handleScroll = (): void => close()
    const handleResize = (): void => close()

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('click', handleClick, true)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('click', handleClick, true)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Unmount safety net - a trigger that unmounts mid-hover (e.g. the row
  // itself gets removed from the queue) must not leave a pending timer
  // trying to setState on an unmounted component, nor an aria-describedby
  // reference dangling on a detached node.
  useEffect(() => {
    return () => {
      clearHoverTimer()
      if (focusedElementRef.current) {
        restoreDescribedBy(focusedElementRef.current, tooltipId, previousDescribedByRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMouseEnter = (): void => {
    clearHoverTimer()
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null
      setHoverOpen(true)
    }, delayMs)
  }

  const handleMouseLeave = (): void => {
    clearHoverTimer()
    setHoverOpen(false)
  }

  // Capture phase so event.target is the actual deepest focused DOM node
  // under the wrapper (the real button/input a caller passed as `children`),
  // not the wrapper span itself - this is what makes aria-describedby land
  // on the right element without needing to know or clone the shape of
  // `children` (a single element, a string, a fragment - see the module
  // comment on focusedElementRef).
  const handleFocusCapture = (event: FocusEvent<HTMLSpanElement>): void => {
    clearHoverTimer()
    setFocusOpen(true)
    const target = event.target as HTMLElement
    focusedElementRef.current = target
    previousDescribedByRef.current = target.getAttribute('aria-describedby')
    target.setAttribute(
      'aria-describedby',
      mergeDescribedBy(previousDescribedByRef.current, tooltipId)
    )
  }

  const handleBlurCapture = (): void => {
    setFocusOpen(false)
    if (focusedElementRef.current) {
      restoreDescribedBy(focusedElementRef.current, tooltipId, previousDescribedByRef.current)
      focusedElementRef.current = null
      previousDescribedByRef.current = null
    }
  }

  return (
    <span
      ref={wrapperRef}
      className={cn('min-w-0', className)}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            id={tooltipId}
            className="pointer-events-none fixed z-100 break-words rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
            style={{
              maxWidth: `min(${MAX_WIDTH_PX}px, calc(100vw - 16px))`,
              left: coords?.left ?? 0,
              top: coords?.top ?? 0,
              // Not yet measured - keep it invisible (not display:none, so
              // offsetWidth/offsetHeight are still measurable) rather than
              // painting at (0,0) for one frame. Because the measure-then-
              // position handoff happens inside useLayoutEffect (synchronous,
              // before the browser's first paint of this open), the browser
              // never actually paints the invisible frame - the corner-jump
              // this exists to prevent is fully eliminated, but as a direct
              // consequence there's no committed "before" frame left to
              // CSS-transition an opacity fade from. Design §4's 120ms
              // tooltip fade is NOT implemented here for that reason (an
              // instant, correctly-positioned appearance was judged the
              // higher-value guarantee of the two, and there was no way to
              // visually confirm a fade timing choice in this session
              // anyway) - a real fade would need a requestAnimationFrame-
              // deferred opacity flip on top of this, left as a follow-up.
              visibility: coords ? 'visible' : 'hidden',
            }}
          >
            {content}
          </div>,
          portalContainer ?? document.body
        )}
    </span>
  )
}

// Adds `id` to an existing aria-describedby value (space-separated id list
// per the ARIA spec) rather than clobbering whatever a caller may already
// have set there.
function mergeDescribedBy(existing: string | null, id: string): string {
  if (!existing) return id
  const ids = existing.split(' ').filter(Boolean)
  return ids.includes(id) ? existing : `${existing} ${id}`
}

// Removes exactly this tooltip's own id from aria-describedby, restoring
// whatever the element had before (or removing the attribute entirely if
// this tooltip was the only thing describing it) - never touches an id this
// tooltip didn't add itself.
function restoreDescribedBy(element: HTMLElement, id: string, previous: string | null): void {
  const current = element.getAttribute('aria-describedby')
  if (current === null) return
  const remaining = current
    .split(' ')
    .filter(Boolean)
    .filter((existingId) => existingId !== id)
  if (remaining.length > 0) {
    element.setAttribute('aria-describedby', remaining.join(' '))
  } else if (previous) {
    element.setAttribute('aria-describedby', previous)
  } else {
    element.removeAttribute('aria-describedby')
  }
}
