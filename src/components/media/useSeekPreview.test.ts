// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MpvPreviewFrame, MpvPreviewFrameRequest } from '../../../shared/types/ipc'
import { useSeekPreview, type SeekPreviewFrame } from './useSeekPreview'

interface Pending {
  request: MpvPreviewFrameRequest
  resolve: (frame: MpvPreviewFrame | null) => void
  reject: (err: unknown) => void
}

function frameFor(req: MpvPreviewFrameRequest, overrides: Partial<MpvPreviewFrame> = {}) {
  const data = new Uint8Array(240 * 135 * 4)
  data[0] = req.requestId
  return {
    generation: req.generation,
    requestId: req.requestId,
    seconds: req.seconds,
    width: 240,
    height: 135,
    data,
    ...overrides,
  } as MpvPreviewFrame
}

describe('useSeekPreview', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let pending: Pending[]
  let previewFrame: ReturnType<typeof vi.fn>
  let latest: { onHover: (s: number | null) => void; frame: SeekPreviewFrame | null }
  let renders: number
  const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  const errors = vi.spyOn(console, 'error')

  interface Props {
    trackPath: string | null
    isVideo: boolean
    duration: number
    generation: number | null
  }
  const base: Props = { trackPath: 'D:/v/a.mp4', isVideo: true, duration: 100, generation: 1 }

  // One component type for every render, so a re-mount() is a prop change of
  // the same hook instance (not a remount).
  function Probe(props: Props): null {
    latest = useSeekPreview(props)
    renders += 1
    return null
  }
  function mount(props: Partial<Props> = {}): void {
    act(() => {
      root.render(createElement(Probe, { ...base, ...props }))
    })
  }
  const hover = (s: number | null): void => {
    act(() => latest.onHover(s))
  }
  async function answer(index: number, frame?: MpvPreviewFrame | null): Promise<void> {
    const p = pending[index]
    await act(async () => {
      p.resolve(frame === undefined ? frameFor(p.request) : frame)
    })
  }

  beforeEach(() => {
    globals.IS_REACT_ACT_ENVIRONMENT = true
    pending = []
    renders = 0
    previewFrame = vi.fn(
      (request: MpvPreviewFrameRequest) =>
        new Promise<MpvPreviewFrame | null>((resolve, reject) => {
          pending.push({ request, resolve, reject })
        })
    )
    ;(window as unknown as { api: unknown }).api = { mpv: { previewFrame } }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    errors.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('hover sends one request for the bucket start and draws the answer', async () => {
    mount()
    hover(42.6)
    hover(42.9) // same 1s bucket - no second request
    expect(previewFrame).toHaveBeenCalledTimes(1)
    expect(pending[0].request).toEqual({ seconds: 42, generation: 1, requestId: 1 })
    expect(latest.frame).toBeNull()
    await answer(0)
    expect(latest.frame?.bucket).toBe(42)
    expect(latest.frame?.width).toBe(240)
    expect(latest.frame?.data[0]).toBe(1)
  })

  it('keeps one request in flight and then requests the newest hovered bucket', async () => {
    mount()
    hover(10)
    hover(20)
    hover(30)
    expect(previewFrame).toHaveBeenCalledTimes(1)
    await answer(0)
    // The answer for 10 is cached, not drawn; 30 is requested next (20 skipped).
    expect(latest.frame).toBeNull()
    expect(previewFrame).toHaveBeenCalledTimes(2)
    expect(pending[1].request.seconds).toBe(30)
    await answer(1)
    expect(latest.frame?.bucket).toBe(30)
    // Back to 10: served from the cache instantly, no new request.
    hover(10)
    expect(latest.frame?.bucket).toBe(10)
    expect(previewFrame).toHaveBeenCalledTimes(2)
  })

  it('discards an answer of a stale generation without caching it', async () => {
    mount()
    hover(10)
    await answer(0, frameFor(pending[0].request, { generation: 0 }))
    expect(latest.frame).toBeNull()
    // Not cached: hovering away and back asks again.
    hover(20)
    await answer(1)
    hover(10)
    expect(previewFrame).toHaveBeenCalledTimes(3)
    expect(pending[2].request.seconds).toBe(10)
  })

  it('a track change clears the cache and never draws the previous track answer', async () => {
    mount()
    hover(10)
    await answer(0)
    expect(latest.frame?.bucket).toBe(10)
    hover(20) // in flight for the old track
    mount({ trackPath: 'D:/v/b.mp4', generation: null })
    expect(latest.frame).toBeNull()
    await answer(1)
    expect(latest.frame).toBeNull()
    // generation null: nothing is requested while hovering.
    hover(30)
    expect(previewFrame).toHaveBeenCalledTimes(2)
    // New generation for the new track: the hovered bucket is requested and
    // bucket 10 is not served from the old cache.
    mount({ trackPath: 'D:/v/b.mp4', generation: 2 })
    expect(previewFrame).toHaveBeenCalledTimes(3)
    expect(pending[2].request).toEqual({ seconds: 30, generation: 2, requestId: 3 })
    await answer(2)
    hover(10)
    expect(latest.frame).toBeNull()
    expect(previewFrame).toHaveBeenCalledTimes(4)
  })

  it('null or failed answers show no frame and are not retried in place', async () => {
    mount()
    hover(10)
    await answer(0, null)
    expect(latest.frame).toBeNull()
    expect(previewFrame).toHaveBeenCalledTimes(1)
    hover(20)
    expect(previewFrame).toHaveBeenCalledTimes(2)
    await act(async () => {
      pending[1].reject(new Error('boom'))
    })
    expect(latest.frame).toBeNull()
    hover(10) // moved on, so 10 may be tried again
    expect(previewFrame).toHaveBeenCalledTimes(3)
  })

  it('leaving the bar hides the frame; the late answer is cached but not drawn', async () => {
    mount()
    hover(10)
    hover(null)
    await answer(0)
    expect(latest.frame).toBeNull()
    hover(10)
    expect(latest.frame?.bucket).toBe(10)
    expect(previewFrame).toHaveBeenCalledTimes(1)
  })

  it('never requests for audio or an unknown duration', () => {
    mount({ isVideo: false })
    hover(10)
    mount({ duration: 0 })
    hover(10)
    mount({ duration: Infinity })
    hover(10)
    expect(previewFrame).not.toHaveBeenCalled()
  })

  it('does not update state after unmount', async () => {
    mount()
    hover(10)
    const before = renders
    act(() => root.unmount())
    await act(async () => {
      pending[0].resolve(frameFor(pending[0].request))
    })
    expect(renders).toBe(before)
    expect(errors).not.toHaveBeenCalled()
    // Re-create the root so afterEach can unmount it.
    root = createRoot(container)
  })
})
