// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  owner: null as 'media' | 'user' | null,
  playback: null as unknown,
  release: vi.fn(),
}))

vi.mock('../../hooks/useWindowFullscreen', () => ({
  useWindowFullscreen: () => ({
    fullscreen: h.owner !== null,
    owner: h.owner,
    toggle: vi.fn(),
    release: h.release,
  }),
}))
vi.mock('../../hooks/useMediaPlayerSync', () => ({ useMediaPlayerSync: () => {} }))
vi.mock('../../components/media/useMediaPlayback', () => ({
  useMediaPlayback: () => ({ canvasRef: () => {}, playback: h.playback }),
}))
vi.mock('../../components/media/useMediaLyrics', () => ({
  useMediaLyrics: () => ({ data: undefined }),
}))
vi.mock('../../hooks/useBroadcastActiveSubtitleLine', () => ({
  useBroadcastActiveSubtitleLine: () => {},
}))
vi.mock('../../i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'ko' }),
}))
vi.mock('../../components/media/FullscreenPlayerView', () => ({
  FullscreenPlayerView: () => createElement('div', { 'data-testid': 'view' }),
}))
vi.mock('../../components/media/MediaPlaylistPanel', () => ({ MediaPlaylistPanel: () => null }))

const { PlayerWindowPage } = await import('./PlayerWindowPage')

describe('PlayerWindowPage fullscreen release', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }

  function render(): void {
    act(() => {
      root.render(createElement(PlayerWindowPage))
    })
  }

  beforeEach(() => {
    globals.IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    h.owner = null
    h.playback = { track: { path: 'a.mp4', name: 'a.mp4' } }
    ;(window as unknown as { api: unknown }).api = {
      media: { onSubtitlePipOpened: () => () => {}, onSubtitlePipClosed: () => () => {} },
    }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('releases media-owned fullscreen once when playback empties', () => {
    h.owner = 'media'
    render()
    expect(container.querySelector('[data-testid="view"]')).not.toBeNull()
    expect(h.release).not.toHaveBeenCalled()
    h.playback = null
    render()
    render()
    expect(container.textContent).toContain('media.noTrackPlaying')
    expect(h.release).toHaveBeenCalledTimes(1)
  })

  it('leaves user (F11) fullscreen alone when playback empties', () => {
    h.owner = 'user'
    render()
    h.playback = null
    render()
    expect(h.release).not.toHaveBeenCalled()
  })

  it('does not release when nothing is fullscreen', () => {
    h.playback = null
    render()
    expect(h.release).not.toHaveBeenCalled()
  })
})
