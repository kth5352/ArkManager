// Pure placement math for HoverTooltip (docs/superpowers/specs/2026-09-09-ui-renewal-design.md
// section 5) - takes the trigger's real bounding rect, the tooltip's own
// rendered size (measured after an invisible first paint, not estimated -
// see hover-tooltip.tsx), and the viewport size, and returns a fixed-position
// { left, top } that always stays fully inside the viewport with an 8px
// margin. Kept side-effect-free and DOM-free so it's unit-testable without a
// browser.
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Size {
  width: number
  height: number
}

export function placeTooltip(
  trigger: Rect,
  tooltip: Size,
  viewport: Size
): { left: number; top: number } {
  const margin = 8
  const gap = 6

  // Horizontal: start aligned with the trigger's own left edge, then clamp
  // so the tooltip's right edge never crosses viewport.width - margin (and,
  // if the tooltip is wider than the available space, the left edge itself
  // clamps to margin rather than going negative - maxLeft can be less than
  // margin for a very wide tooltip in a very narrow viewport).
  const maxLeft = Math.max(margin, viewport.width - tooltip.width - margin)
  const left = Math.min(Math.max(margin, trigger.left), maxLeft)

  // Vertical: prefer below the trigger (gap px under its bottom edge).
  // Flip above only when below genuinely doesn't fit within the viewport -
  // not just "the trigger is in the bottom half," which would also flip
  // when there was actually enough room.
  const below = trigger.bottom + gap
  const preferredTop =
    below + tooltip.height <= viewport.height - margin ? below : trigger.top - gap - tooltip.height
  const maxTop = Math.max(margin, viewport.height - tooltip.height - margin)
  const top = Math.min(Math.max(margin, preferredTop), maxTop)

  return { left, top }
}
