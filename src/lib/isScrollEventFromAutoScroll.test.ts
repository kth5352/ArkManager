import { describe, it, expect } from 'vitest'
import {
  isScrollEventFromAutoScroll,
  SCROLL_CEILING_MS,
  SCROLL_REFRESH_WINDOW_MS,
} from './isScrollEventFromAutoScroll'

describe('isScrollEventFromAutoScroll', () => {
  it('treats an event well within both windows as our own auto-scroll', () => {
    expect(isScrollEventFromAutoScroll(100, 0, 0)).toBe(true)
  })

  it('keeps returning true across a sequence simulating a single large jump', () => {
    // Each event refreshes lastAutoScrollAt and lands well within 600ms of
    // the previous one, while the whole sequence stays within the 1500ms
    // ceiling from autoScrollStartedAt (a large jump - e.g. opening the tab
    // on a far-down active line - fires several scroll events in a row).
    const autoScrollStartedAt = 0
    let lastAutoScrollAt = 0
    const eventTimes = [200, 500, 800, 1100, 1200]

    for (const now of eventTimes) {
      const result = isScrollEventFromAutoScroll(now, lastAutoScrollAt, autoScrollStartedAt)
      expect(result).toBe(true)
      lastAutoScrollAt = now
    }
  })

  it('returns false once cumulative elapsed time crosses the ceiling, even though each event is within its own refresh window (regression: naive self-extending window)', () => {
    // Simulates a sustained user scroll gesture: each event lands well
    // within 600ms of the previous one (so a refresh-window-only check would
    // never trip), but the ceiling from autoScrollStartedAt is eventually
    // crossed. This is the exact bug class fixed twice - the AND with the
    // ceiling must reject it once autoScrollStartedAt is far enough behind.
    const autoScrollStartedAt = 0
    let lastAutoScrollAt = 0
    const eventTimes = [400, 800, 1200, 1600, 2000]

    const results = eventTimes.map((now) => {
      const result = isScrollEventFromAutoScroll(now, lastAutoScrollAt, autoScrollStartedAt)
      lastAutoScrollAt = now
      return result
    })

    // First three events (400, 800, 1200) are still within the 1500ms
    // ceiling.
    expect(results[0]).toBe(true)
    expect(results[1]).toBe(true)
    expect(results[2]).toBe(true)
    // Once elapsed time from autoScrollStartedAt reaches/exceeds 1500ms, the
    // ceiling must reject the event even though it's within its own 600ms
    // refresh window of the previous one.
    expect(results[3]).toBe(false)
    expect(results[4]).toBe(false)
  })

  it('rejects an event after a long gap even though it is still within the ceiling (AND logic, not OR)', () => {
    // now - lastAutoScrollAt >= 600 (refresh window lapsed), but
    // now - autoScrollStartedAt < 1500 (still within the ceiling). The
    // refresh-window check alone must be sufficient to reject this - if the
    // logic were an OR instead of an AND, this would incorrectly return true.
    const now = 700
    const lastAutoScrollAt = 0
    const autoScrollStartedAt = 0

    expect(now - lastAutoScrollAt).toBeGreaterThanOrEqual(SCROLL_REFRESH_WINDOW_MS)
    expect(now - autoScrollStartedAt).toBeLessThan(SCROLL_CEILING_MS)
    expect(isScrollEventFromAutoScroll(now, lastAutoScrollAt, autoScrollStartedAt)).toBe(false)
  })

  it('respects custom refreshWindowMs/ceilingMs overrides', () => {
    expect(isScrollEventFromAutoScroll(50, 0, 0, 100, 200)).toBe(true)
    expect(isScrollEventFromAutoScroll(150, 0, 0, 100, 200)).toBe(false)
    expect(isScrollEventFromAutoScroll(50, 0, 0, 100, 40)).toBe(false)
  })
})
