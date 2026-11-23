// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaPlaybackState } from './useMediaPlayback'
import type { MediaCoverInfo } from '../../../shared/types/ipc'

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
const cover = vi.hoisted(() => ({
  info: undefined as MediaCoverInfo | undefined,
  useMediaCoverInfo: vi.fn(),
}))
vi.mock('../../services/mediaArtworkService', () => ({
  useMediaCoverInfo: (filePath: string | null) => {
    cover.useMediaCoverInfo(filePath)
    return { data: filePath === null ? undefined : cover.info }
  },
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
const { useMediaPlayerStore } = await import('../../stores/mediaPlayerStore')

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
    cover.info = undefined
    useMediaPlayerStore.setState({ coverExpanded: false })
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

  describe('audio', () => {
    const audio = (
      path = 'D:/a/03_mimikaki.flac',
      title = 'おやすみ前の耳かき'
    ): MediaPlaybackState =>
      makePlayback({
        track: { path, name: path.split('/').pop()! },
        isVideo: false,
        title,
        loadedPath: path,
      })
    const withCover: MediaCoverInfo = {
      hasCover: true,
      accent: '#d9825b',
      aspectRatio: 4 / 3,
      version: '1-1',
    }
    const q = <T extends Element = HTMLElement>(selector: string): T | null =>
      container.querySelector<T>(selector)
    const fireError = (img: Element): void => {
      act(() => {
        img.dispatchEvent(new Event('error'))
      })
    }

    it('video never queries cover info', () => {
      render()
      expect(cover.useMediaCoverInfo).toHaveBeenCalled()
      expect(cover.useMediaCoverInfo.mock.calls.every(([path]) => path === null)).toBe(true)
      expect(q('[data-testid="audio-artwork"]')).toBeNull()
    })

    it('default layout: cover button, now-playing label, title and file name', () => {
      cover.info = withCover
      render({ playback: audio() })
      expect(cover.useMediaCoverInfo).toHaveBeenLastCalledWith('D:/a/03_mimikaki.flac')
      expect(q('[data-testid="audio-title"]')!.textContent).toBe('おやすみ前の耳かき')
      expect(q('[data-testid="audio-file-name"]')!.textContent).toBe('03_mimikaki.flac')
      expect(container.textContent).toContain('media.nowPlaying')
      const button = q('button[aria-label="media.expandCover"]')!
      expect(button.hasAttribute('aria-pressed')).toBe(false)
      const coverImg = button.querySelector('img')!
      expect(coverImg.getAttribute('src')).toBe(
        `mediathumb://cover/${encodeURIComponent('D:/a/03_mimikaki.flac')}?v=1-1`
      )
      // The blurred background uses the cheaper 512px thumbnail.
      const bg = q('[data-testid="audio-artwork"] > img')!
      expect(bg.getAttribute('src')).toBe(
        `mediathumb://thumbnail/${encodeURIComponent('D:/a/03_mimikaki.flac')}?v=1-1`
      )
      expect((bg as HTMLElement).style.filter).toContain('blur(40px)')
    })

    it('sets --media-accent from the cover, and not without one', () => {
      cover.info = withCover
      render({ playback: audio() })
      const root = container.firstElementChild as HTMLElement
      expect(root.style.getPropertyValue('--media-accent')).toBe('#d9825b')
      cover.info = { hasCover: false, accent: null, aspectRatio: null, version: '1-1' }
      render({ playback: audio('D:/a/04.flac') })
      expect(root.style.getPropertyValue('--media-accent')).toBe('')
    })

    it('no cover: Music placeholder, no expand button, same text layout', () => {
      cover.info = { hasCover: false, accent: null, aspectRatio: null, version: '0-1' }
      render({ playback: audio() })
      expect(q('[data-testid="audio-cover-placeholder"] svg')).not.toBeNull()
      expect(q('button[aria-label="media.expandCover"]')).toBeNull()
      expect(q('[data-testid="audio-artwork"] > img')).toBeNull()
      expect(q('[data-testid="audio-title"]')!.textContent).toBe('おやすみ前の耳かき')
      expect(q('[data-testid="audio-artwork"]')!.getAttribute('style')).toContain('radial-gradient')
    })

    it('pending cover info shows an empty slot (no icon flash)', () => {
      render({ playback: audio() })
      expect(q('[data-testid="audio-cover-placeholder"]')).not.toBeNull()
      expect(q('[data-testid="audio-cover-placeholder"] svg')).toBeNull()
    })

    it('clicking the cover toggles the enlarged view; it survives a track change', () => {
      cover.info = withCover
      render({ playback: audio() })
      act(() => q('button[aria-label="media.expandCover"]')!.click())
      expect(useMediaPlayerStore.getState().coverExpanded).toBe(true)
      const collapse = q('button[aria-label="media.collapseCover"]')!
      expect(collapse.hasAttribute('aria-pressed')).toBe(false)
      expect(collapse.querySelector('img')!.className).toContain('object-contain')
      // Title block moves into the (80% opaque, blurred) bottom band.
      expect(band('bottom').querySelector('[data-testid="audio-title"]')).not.toBeNull()
      expect(band('bottom').className).toContain('bg-[rgba(12,6,12,0.8)]')
      expect(band('bottom').className).toContain('backdrop-blur')

      render({ playback: audio('D:/a/04_next.flac', 'Next') })
      expect(q('button[aria-label="media.collapseCover"]')).not.toBeNull()
      expect(band('bottom').querySelector('[data-testid="audio-title"]')!.textContent).toBe('Next')

      act(() => q('button[aria-label="media.collapseCover"]')!.click())
      expect(useMediaPlayerStore.getState().coverExpanded).toBe(false)
      expect(q('button[aria-label="media.expandCover"]')).not.toBeNull()
      expect(band('bottom').querySelector('[data-testid="audio-title"]')).toBeNull()
      expect(band('bottom').className).not.toContain('backdrop-blur')
    })

    it('an image load error falls back to the placeholder for that track only', () => {
      cover.info = withCover
      render({ playback: audio() })
      fireError(q('button[aria-label="media.expandCover"] img')!)
      expect(q('button[aria-label="media.expandCover"]')).toBeNull()
      expect(q('[data-testid="audio-cover-placeholder"] svg')).not.toBeNull()
      const root = container.firstElementChild as HTMLElement
      expect(root.style.getPropertyValue('--media-accent')).toBe('')

      render({ playback: audio('D:/a/04_next.flac') })
      expect(q('button[aria-label="media.expandCover"]')).not.toBeNull()
    })

    it('a replaced cover (new version) retries after a load error', () => {
      cover.info = withCover
      render({ playback: audio() })
      fireError(q('[data-testid="audio-artwork"] > img')!)
      expect(q('button[aria-label="media.expandCover"]')).toBeNull()
      cover.info = { ...withCover, version: '2-1' }
      render({ playback: audio() })
      expect(q('button[aria-label="media.expandCover"] img')!.getAttribute('src')).toContain(
        '?v=2-1'
      )
    })

    it('enlarged flag is ignored (no collapse button) on a track without a cover', () => {
      useMediaPlayerStore.setState({ coverExpanded: true })
      cover.info = { hasCover: false, accent: null, aspectRatio: null, version: '0-1' }
      render({ playback: audio() })
      expect(q('button[aria-label="media.collapseCover"]')).toBeNull()
      expect(q('[data-testid="audio-cover-placeholder"] svg')).not.toBeNull()
      expect(useMediaPlayerStore.getState().coverExpanded).toBe(true)
    })
  })
})
