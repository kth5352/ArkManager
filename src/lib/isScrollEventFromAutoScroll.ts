// Refresh window: a scroll event arriving within this many ms of the last
// one we attributed to our own auto-scroll is presumed to still be part of
// that same smooth scrollIntoView's event train (which fires several scroll
// events in a row).
export const SCROLL_REFRESH_WINDOW_MS = 600

// Ceiling: refreshing the window alone would let a continuous user scroll
// gesture (successive native scroll events well under the refresh window
// apart, which is the normal case for wheel/trackpad input) re-arm the
// window forever and never pause auto-follow - so it's capped by a hard
// ceiling measured from when the auto-scroll originally started.
export const SCROLL_CEILING_MS = 1500

// A scroll event only counts as "still ours" (i.e. still part of our own
// auto-scroll, not a genuine user gesture) while BOTH the short refresh
// window and the overall ceiling hold; once either lapses, it's a real user
// scroll and auto-follow should pause. See LyricsLogTab.tsx's handleScroll
// for the full history of why both checks are required (this decision has
// been the site of two prior bugs: a fixed one-shot window too short for
// large jumps, then a naive self-extending window a sustained user scroll
// could keep alive indefinitely).
export function isScrollEventFromAutoScroll(
  now: number,
  lastAutoScrollAt: number,
  autoScrollStartedAt: number,
  refreshWindowMs = SCROLL_REFRESH_WINDOW_MS,
  ceilingMs = SCROLL_CEILING_MS
): boolean {
  const withinRefreshWindow = now - lastAutoScrollAt < refreshWindowMs
  const withinCeiling = now - autoScrollStartedAt < ceilingMs
  return withinRefreshWindow && withinCeiling
}
