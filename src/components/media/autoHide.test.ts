// @vitest-environment jsdom
import { createElement, type RefObject } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_HIDE_DELAY_MS,
  isPointerMoveActivity,
  nextHideDelayMs,
  shouldShowControls,
  type HoldReasons,
} from './autoHide'
import { useAutoHideControls } from './useAutoHideControls'

const NONE: HoldReasons = {
  pointerOverControls: false,
  dragging: false,
  paused: false,
  sidebarOpen: false,
  popoverOpen: false,
  focusInControls: false,
}

describe('shouldShowControls', () => {
  it('shows just under the delay and hides at exactly the delay', () => {
    expect(AUTO_HIDE_DELAY_MS).toBe(2000)
    expect(shouldShowControls(1999, 0, NONE)).toBe(true)
    expect(shouldShowControls(2000, 0, NONE)).toBe(false)
    expect(shouldShowControls(0, 0, NONE)).toBe(true)
  })

  it.each(Object.keys(NONE) as (keyof HoldReasons)[])('%s alone keeps it shown when idle', (k) => {
    expect(shouldShowControls(1_000_000, 0, { ...NONE, [k]: true })).toBe(true)
  })

  it('hides when idle with no hold reason', () => {
    expect(shouldShowControls(60_000, 0, NONE)).toBe(false)
  })
})

describe('nextHideDelayMs', () => {
  it('returns remaining time, null when held or already expired', () => {
    expect(nextHideDelayMs(500, 0, NONE)).toBe(1500)
    expect(nextHideDelayMs(0, 0, NONE)).toBe(2000)
    expect(nextHideDelayMs(2000, 0, NONE)).toBeNull()
    expect(nextHideDelayMs(500, 0, { ...NONE, paused: true })).toBeNull()
  })
})

describe('isPointerMoveActivity', () => {
  it('counts the first move and any move to a new position', () => {
    expect(isPointerMoveActivity(null, { x: 10, y: 10 })).toBe(true)
    expect(isPointerMoveActivity({ x: 10, y: 10 }, { x: 11, y: 10 })).toBe(true)
    expect(isPointerMoveActivity({ x: 10, y: 10 }, { x: 10, y: 9 })).toBe(true)
  })

  it('ignores a move that reports the last seen position (synthetic move)', () => {
    expect(isPointerMoveActivity({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false)
  })
})

describe('useAutoHideControls', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let latest: { visible: boolean; bumpActivity: () => void }
  let el: HTMLDivElement
  const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }

  function mount(enabled: boolean, hold: HoldReasons = NONE): void {
    const rootRef = { current: el } as RefObject<HTMLElement | null>
    function Probe(): null {
      latest = useAutoHideControls({ enabled, hold, rootRef })
      return null
    }
    act(() => {
      root.render(createElement(Probe))
    })
  }

  beforeEach(() => {
    globals.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    container = document.createElement('div')
    el = document.createElement('div')
    el.style.cursor = 'crosshair'
    document.body.append(container, el)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
    container.remove()
    el.remove()
  })

  it('is always visible when disabled and installs no timers', () => {
    mount(false)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(latest.visible).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('hides after 2000ms of idleness and restores cursor on activity', () => {
    mount(true)
    expect(latest.visible).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(latest.visible).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(latest.visible).toBe(false)
    expect(el.style.cursor).toBe('none')
    act(() => {
      el.dispatchEvent(new Event('pointermove'))
    })
    expect(latest.visible).toBe(true)
    expect(el.style.cursor).toBe('crosshair')
  })

  it('ignores a synthetic pointermove at the last seen position', () => {
    mount(true)
    const move = (x: number, y: number): void => {
      el.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }))
    }
    act(() => {
      move(5, 5)
      vi.advanceTimersByTime(2000)
    })
    expect(latest.visible).toBe(false)
    // Chromium re-dispatches a move at the same spot when the layout under a
    // still cursor changes (e.g. the bands fading out) - that must not count.
    act(() => move(5, 5))
    expect(latest.visible).toBe(false)
    act(() => move(6, 5))
    expect(latest.visible).toBe(true)
  })

  it('activity postpones hiding', () => {
    mount(true)
    act(() => {
      vi.advanceTimersByTime(1500)
      window.dispatchEvent(new Event('keydown'))
      vi.advanceTimersByTime(1500)
    })
    expect(latest.visible).toBe(true)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(latest.visible).toBe(false)
  })

  it('restarts the countdown when the last hold clears', () => {
    mount(true, { ...NONE, paused: true })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(latest.visible).toBe(true)
    mount(true, NONE)
    expect(latest.visible).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(latest.visible).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(latest.visible).toBe(false)
  })

  it('cleans up timers, listeners and cursor on unmount', () => {
    mount(true)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(el.style.cursor).toBe('none')
    act(() => root.unmount())
    expect(vi.getTimerCount()).toBe(0)
    expect(el.style.cursor).toBe('crosshair')
    root = createRoot(container)
  })
})
