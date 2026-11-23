// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaPlaybackState } from './useMediaPlayback'

const fs = vi.hoisted(() => ({
  state: { fullscreen: false, owner: null as 'media' | 'user' | null },
  toggle: vi.fn(),
  release: vi.fn(),
}))

vi.mock('../../hooks/useWindowFullscreen', () => ({
  useWindowFullscreen: () => ({ ...fs.state, toggle: fs.toggle, release: fs.release }),
}))
vi.mock('../../i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'ko' }),
}))
vi.mock('./MediaLikeButton', () => ({ MediaLikeButton: () => null }))
// The real transport bar needs react-query + mpv; the stub exposes the two
// hold callbacks the view wires into it and renders the trailing buttons.
vi.mock('./MediaTransportBar', () => ({
  MediaTransportBar: (props: {
    onDraggingChange?: (dragging: boolean) => void
    onPopoverOpenChange?: (open: boolean) => void
    trailing?: ReactNode
  }) =>
    createElement(
      'div',
      null,
      createElement('button', {
        'data-testid': 'drag-start',
        onClick: () => props.onDraggingChange?.(true),
      }),
      createElement('button', {
        'data-testid': 'drag-end',
        onClick: () => props.onDraggingChange?.(false),
      }),
      createElement('button', {
        'data-testid': 'eq-open',
        onClick: () => props.onPopoverOpenChange?.(true),
      }),
      createElement('button', {
        'data-testid': 'eq-close',
        onClick: () => props.onPopoverOpenChange?.(false),
      }),
      props.trailing
    ),
}))

const { FullscreenPlayerView } = await import('./FullscreenPlayerView')

type ViewProps = Parameters<typeof FullscreenPlayerView>[0]

function makePlayback(overrides: Partial<MediaPlaybackState> = {}): MediaPlaybackState {
  return {
    track: { path: 'D:/v/03_ending.mp4', name: '03_ending.mp4' },
    isVideo: true,
    currentTime: 30,
    duration: 120,
    isPlaying: true,
    error: null,
    title: 'Ending',
    loadGeneration: 1,
    loadedPath: 'D:/v/03_ending.mp4',
    handleSeek: () => {},
    ...overrides,
  }
}

describe('FullscreenPlayerView', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const globals = globalThis as unknown as {
    IS_REACT_ACT_ENVIRONMENT: boolean
    ResizeObserver: unknown
  }
  let resizeCallbacks: (() => void)[]

  function render(props: Partial<ViewProps> = {}): void {
    act(() => {
      root.render(
        createElement(FullscreenPlayerView, {
          canvasRef: () => {},
          playback: makePlayback(),
          mode: 'overlay',
          lyricsEnabled: false,
          parsedLyrics: null,
          subtitlePipOpen: false,
          playlistLabel: 'media.playlist',
          ...props,
        })
      )
    })
  }

  const band = (which: 'top' | 'bottom'): HTMLElement =>
    container.querySelector(`[data-control-band="${which}"]`) as HTMLElement
  const bandsHidden = (): boolean => band('bottom').className.includes('opacity-0')
  const click = (testId: string): void => {
    act(() => {
      ;(container.querySelector(`[data-testid="${testId}"]`) as HTMLElement).click()
    })
  }
  const idle = (ms = 2000): void => {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }
  const press = (key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    act(() => {
      window.dispatchEvent(event)
    })
    return event
  }

  beforeEach(() => {
    globals.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    vi.clearAllMocks()
    fs.state = { fullscreen: false, owner: null }
    resizeCallbacks = []
    globals.ResizeObserver = class {
      constructor(cb: () => void) {
        resizeCallbacks.push(cb)
      }
      observe(): void {}
      disconnect(): void {}
    }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
    container.remove()
  })

  it('hides the bands after 2s while playing and leaves the progress line', () => {
    render()
    expect(bandsHidden()).toBe(false)
    idle()
    expect(bandsHidden()).toBe(true)
    expect(band('bottom').className).toContain('pointer-events-none')
    expect(band('top').className).toContain('pointer-events-none')
    const line = container.querySelector('[aria-hidden="true"].h-\\[2px\\]') as HTMLElement
    expect(line.className).toContain('opacity-100')
    expect((line.firstElementChild as HTMLElement).style.width).toBe('25%')
  })

  it('keeps the bands while paused', () => {
    render({ playback: makePlayback({ isPlaying: false }) })
    idle(10_000)
    expect(bandsHidden()).toBe(false)
  })

  it('keeps the bands while the pointer is over a band', () => {
    render()
    act(() => {
      band('bottom').dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    })
    idle(10_000)
    expect(bandsHidden()).toBe(false)
    act(() => {
      band('bottom').dispatchEvent(
        new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })
      )
    })
    idle()
    expect(bandsHidden()).toBe(true)
  })

  it('keeps the bands during a slider drag and while the EQ popover is open', () => {
    render()
    click('drag-start')
    idle(10_000)
    expect(bandsHidden()).toBe(false)
    click('drag-end')
    click('eq-open')
    idle(10_000)
    expect(bandsHidden()).toBe(false)
    click('eq-close')
    idle()
    expect(bandsHidden()).toBe(true)
  })

  it('keeps the bands while the main-window media sidebar is open', () => {
    render({ sidebarInset: 320 })
    idle(10_000)
    expect(bandsHidden()).toBe(false)
  })

  it('detached: ☰ opens the side panel, which holds the bands', () => {
    render({
      mode: 'detached',
      sidePanel: createElement('div', { 'data-testid': 'playlist' }),
      playlistLabel: 'media.showPlaylist',
    })
    expect(container.querySelector('[data-testid="playlist"]')).toBeNull()
    act(() => {
      ;(container.querySelector('[aria-label="media.showPlaylist"]') as HTMLElement).click()
    })
    expect(container.querySelector('[data-testid="playlist"]')).not.toBeNull()
    idle(10_000)
    expect(bandsHidden()).toBe(false)
  })

  it('detached: no detach/minimize buttons in the top band', () => {
    render({ mode: 'detached', onMinimize: vi.fn(), onDetach: vi.fn() })
    expect(container.querySelector('[aria-label="media.minimize"]')).toBeNull()
    expect(container.querySelector('[aria-label="media.detachWindow"]')).toBeNull()
  })

  it('double-clicking the video toggles monitor fullscreen', () => {
    render()
    act(() => {
      container
        .querySelector('canvas')!
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(fs.toggle).toHaveBeenCalledTimes(1)
  })

  it('F toggles while shown, Escape only acts when fullscreen', () => {
    render()
    press('f')
    expect(fs.toggle).toHaveBeenCalledTimes(1)
    expect(press('Escape').defaultPrevented).toBe(false)
    expect(fs.toggle).toHaveBeenCalledTimes(1)
    fs.state = { fullscreen: true, owner: 'user' }
    render()
    expect(press('Escape').defaultPrevented).toBe(true)
    expect(fs.toggle).toHaveBeenCalledTimes(2)
  })

  it('ignores F and Escape while the overlay is minimized', () => {
    fs.state = { fullscreen: true, owner: 'user' }
    render({ active: false })
    expect(press('f').defaultPrevented).toBe(false)
    expect(press('Escape').defaultPrevented).toBe(false)
    expect(fs.toggle).not.toHaveBeenCalled()
  })

  it('minimize releases media-owned fullscreen before minimizing', () => {
    const order: string[] = []
    fs.release.mockImplementation(() => order.push('release'))
    render({ onMinimize: () => order.push('minimize') })
    act(() => {
      ;(container.querySelector('[aria-label="media.minimize"]') as HTMLElement).click()
    })
    expect(order).toEqual(['release', 'minimize'])
  })

  it('F and Escape (consumed in the capture phase) still reveal hidden bands', () => {
    render()
    idle()
    expect(bandsHidden()).toBe(true)
    press('f')
    expect(bandsHidden()).toBe(false)
    idle()
    expect(bandsHidden()).toBe(true)
    fs.state = { fullscreen: true, owner: 'media' }
    render()
    idle()
    expect(bandsHidden()).toBe(true)
    press('Escape')
    expect(bandsHidden()).toBe(false)
  })

  it('closing the EQ popover clears a hover hold whose leave never arrived', () => {
    render()
    act(() => {
      band('bottom').dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    })
    click('eq-open')
    // The portaled popover unmounts under the cursor: no pointerout.
    click('eq-close')
    idle()
    expect(bandsHidden()).toBe(true)
  })

  it('never remounts the canvas across minimize/restore and band hide/show', () => {
    render()
    const canvas = container.querySelector('canvas')
    render({ active: false })
    render({ active: true })
    expect(container.querySelector('canvas')).toBe(canvas)
    idle()
    expect(bandsHidden()).toBe(true)
    act(() => {
      container.firstElementChild!.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 40, clientY: 40 })
      )
    })
    expect(bandsHidden()).toBe(false)
    expect(container.querySelector('canvas')).toBe(canvas)
  })

  it('the fullscreen button uses a changing label, not aria-pressed', () => {
    render()
    const enter = container.querySelector('[aria-label="media.enterFullscreen"]') as HTMLElement
    expect(enter.hasAttribute('aria-pressed')).toBe(false)
    fs.state = { fullscreen: true, owner: 'media' }
    render()
    expect(container.querySelector('[aria-label="media.exitFullscreen"]')).not.toBeNull()
  })

  it('reports the bottom band layout height even while hidden', () => {
    const onHeight = vi.fn()
    render({ onBottomBandHeightChange: onHeight })
    vi.spyOn(band('bottom'), 'getBoundingClientRect').mockReturnValue({ height: 88 } as DOMRect)
    idle()
    expect(bandsHidden()).toBe(true)
    act(() => resizeCallbacks.forEach((cb) => cb()))
    expect(onHeight).toHaveBeenLastCalledWith(88)
  })
})
