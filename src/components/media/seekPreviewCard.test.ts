// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaPlaybackState } from './useMediaPlayback'

vi.mock('../../i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'ko' }),
}))
// The real EQ popover needs react-query.
vi.mock('./EqualizerPopover', () => ({ EqualizerPopover: () => null }))

const { SeekPreviewCard } = await import('./SeekPreviewCard')
const { MediaTransportBar } = await import('./MediaTransportBar')

const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

const card = (): HTMLElement | null => container.querySelector('[data-seek-preview]')

describe('SeekPreviewCard', () => {
  const frame = {
    bucket: 10,
    data: new Uint8ClampedArray(240 * 135 * 4),
    width: 240,
    height: 135,
  }

  it('renders nothing while not hovering', () => {
    act(() => root.render(createElement(SeekPreviewCard, { hover: null, frame })))
    expect(card()).toBeNull()
  })

  it('is decorative, ignores the pointer and shows the time pill without a frame', () => {
    act(() =>
      root.render(
        createElement(SeekPreviewCard, {
          hover: { seconds: 75, clientX: 500, wrapperLeft: 100, viewportWidth: 1920 },
          frame: null,
        })
      )
    )
    const el = card()!
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.style.pointerEvents).toBe('none')
    expect(el.querySelector('canvas')).toBeNull()
    expect(el.textContent).toBe('1:15')
    // 64px pill centred on x=500, relative to the wrapper at 100.
    expect(el.style.left).toBe('368px')
    expect(el.style.width).toBe('64px')
  })

  it('draws the frame and clamps the card inside the window edges', () => {
    const putImageData = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData,
    } as unknown as CanvasRenderingContext2D)
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number
        ) {}
      }
    )
    act(() =>
      root.render(
        createElement(SeekPreviewCard, {
          hover: { seconds: 10, clientX: 1915, wrapperLeft: 0, viewportWidth: 1920 },
          frame,
        })
      )
    )
    const el = card()!
    expect(el.querySelector('canvas')).not.toBeNull()
    expect(putImageData).toHaveBeenCalledTimes(1)
    // 240 + 8 padding, kept 8px from the right edge.
    expect(el.style.width).toBe('248px')
    expect(el.style.left).toBe(`${1920 - 8 - 248}px`)

    act(() =>
      root.render(
        createElement(SeekPreviewCard, {
          hover: { seconds: 10, clientX: 2, wrapperLeft: 40, viewportWidth: 500 },
          frame,
        })
      )
    )
    // Narrow window: 192 + 8, pinned 8px from the left window edge.
    expect(card()!.style.width).toBe('200px')
    expect(card()!.style.left).toBe('-32px')
    vi.unstubAllGlobals()
  })

  it('a frame whose length does not match its size does not throw out of the draw', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.stubGlobal(
      'ImageData',
      class {
        constructor(data: Uint8ClampedArray, width: number, height: number) {
          if (data.length !== width * height * 4) throw new Error('length mismatch')
        }
      }
    )
    const bad = { bucket: 10, data: new Uint8ClampedArray(16), width: 240, height: 135 }
    expect(() =>
      act(() =>
        root.render(
          createElement(SeekPreviewCard, {
            hover: { seconds: 10, clientX: 500, wrapperLeft: 0, viewportWidth: 1920 },
            frame: bad,
          })
        )
      )
    ).not.toThrow()
    expect(card()).not.toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('MediaTransportBar seek preview', () => {
  function makePlayback(overrides: Partial<MediaPlaybackState> = {}): MediaPlaybackState {
    return {
      track: { path: 'D:/v/a.mp4', name: 'a.mp4' },
      isVideo: true,
      currentTime: 0,
      duration: 100,
      isPlaying: false,
      error: null,
      title: 'a',
      loadGeneration: null,
      loadedPath: null,
      handleSeek: () => {},
      ...overrides,
    }
  }

  function renderBar(playback: MediaPlaybackState, variant: 'default' | 'band' = 'default') {
    act(() => root.render(createElement(MediaTransportBar, { playback, variant })))
  }

  function hoverSeek(clientX: number): void {
    const input = container.querySelector('input[type="range"]') as HTMLInputElement
    const wrapper = input.parentElement as HTMLElement
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 200,
      top: 0,
      bottom: 10,
      right: 300,
      height: 10,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    })
    act(() => {
      wrapper.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX }))
    })
  }

  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = {
      mpv: { previewFrame: vi.fn(() => new Promise(() => {})) },
    }
  })

  it.each(['default', 'band'] as const)('shows the time for a video with a duration (%s)', (v) => {
    renderBar(makePlayback(), v)
    hoverSeek(200)
    expect(card()?.textContent).toBe('0:50')
  })

  it('requests a frame only once the load generation is known', () => {
    renderBar(makePlayback({ loadGeneration: 3, loadedPath: 'D:/v/a.mp4' }))
    hoverSeek(200)
    const api = (window as unknown as { api: { mpv: { previewFrame: ReturnType<typeof vi.fn> } } })
      .api
    expect(api.mpv.previewFrame).toHaveBeenCalledWith({ seconds: 50, generation: 3, requestId: 1 })
  })

  it('shows nothing for audio or an unknown duration', () => {
    renderBar(makePlayback({ isVideo: false, track: { path: 'D:/a.mp3', name: 'a.mp3' } }))
    hoverSeek(200)
    expect(card()).toBeNull()
    renderBar(makePlayback({ duration: 0 }))
    hoverSeek(200)
    expect(card()).toBeNull()
    renderBar(makePlayback({ duration: Infinity }))
    hoverSeek(200)
    expect(card()).toBeNull()
  })

  it('a track change clears the hover card', () => {
    renderBar(makePlayback())
    hoverSeek(200)
    expect(card()).not.toBeNull()
    renderBar(makePlayback({ track: { path: 'D:/v/b.mp4', name: 'b.mp4' } }))
    expect(card()).toBeNull()
  })

  it('hides when the pointer leaves the bar', () => {
    renderBar(makePlayback())
    hoverSeek(200)
    expect(card()).not.toBeNull()
    const wrapper = (container.querySelector('input[type="range"]') as HTMLElement).parentElement!
    act(() => {
      wrapper.dispatchEvent(
        new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })
      )
    })
    expect(card()).toBeNull()
  })
})
