// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFullscreenKeys } from './useFullscreenKeys'

describe('useFullscreenKeys', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  const toggleFullscreen = vi.fn()
  const exitFullscreen = vi.fn()
  const bubble = vi.fn()

  type KeyState = { overlayVisible: boolean; windowFullscreen: boolean }
  // Stable component type so a re-mount() is a re-render, not a remount.
  function Probe({ state }: { state: KeyState }): null {
    useFullscreenKeys(state, { toggleFullscreen, exitFullscreen })
    return null
  }
  function mount(state: KeyState): void {
    act(() => {
      root.render(createElement(Probe, { state }))
    })
  }

  function press(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    return event
  }

  beforeEach(() => {
    globals.IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    window.addEventListener('keydown', bubble)
  })

  afterEach(() => {
    window.removeEventListener('keydown', bubble)
    act(() => root.unmount())
    container.remove()
  })

  it('consumes Escape in fullscreen so bubble-phase listeners never see it', () => {
    mount({ overlayVisible: true, windowFullscreen: true })
    const event = press('Escape')
    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    expect(bubble).not.toHaveBeenCalled()
  })

  it('consumes F when the overlay is visible', () => {
    mount({ overlayVisible: true, windowFullscreen: false })
    const event = press('f')
    expect(toggleFullscreen).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    expect(bubble).not.toHaveBeenCalled()
  })

  it('lets unhandled keys through to bubble listeners', () => {
    mount({ overlayVisible: true, windowFullscreen: false })
    const event = press('Escape')
    expect(exitFullscreen).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    expect(bubble).toHaveBeenCalledTimes(1)
  })

  it('uses the latest state without re-registering', () => {
    const add = vi.spyOn(window, 'addEventListener')
    mount({ overlayVisible: false, windowFullscreen: false })
    mount({ overlayVisible: true, windowFullscreen: true })
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1)
    press('Escape')
    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    add.mockRestore()
  })

  it('removes the listener on unmount', () => {
    mount({ overlayVisible: true, windowFullscreen: true })
    act(() => root.unmount())
    press('Escape')
    expect(exitFullscreen).not.toHaveBeenCalled()
    expect(bubble).toHaveBeenCalledTimes(1)
    root = createRoot(container)
  })
})
