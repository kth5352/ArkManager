import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { WindowFullscreenRequestSchema } from '../../shared/types/ipc'
import {
  attachFullscreenController,
  createFullscreenOwner,
  type FullscreenWindowLike,
} from './windowFullscreenOwner'

describe('createFullscreenOwner', () => {
  it('media enter then release leaves', () => {
    const o = createFullscreenOwner()
    o.onEnter(true)
    expect(o.owner()).toBe('media')
    expect(o.shouldRelease()).toBe(true)
  })
  it('user enter is not released', () => {
    const o = createFullscreenOwner()
    o.onEnter(false)
    expect(o.owner()).toBe('user')
    expect(o.shouldRelease()).toBe(false)
  })
  it('leave clears owner', () => {
    const o = createFullscreenOwner()
    o.onEnter(true)
    o.onLeave()
    expect(o.owner()).toBeNull()
    expect(o.shouldRelease()).toBe(false)
  })
})

class FakeWin extends EventEmitter implements FullscreenWindowLike {
  full = false
  fullscreenable = true
  destroyed = false
  sent: unknown[] = []
  auto = true
  isFullScreen = (): boolean => this.full
  isFullScreenable = (): boolean => this.fullscreenable
  isDestroyed = (): boolean => this.destroyed
  setFullScreen = vi.fn((v: boolean) => {
    if (this.auto) this.fire(v)
  })
  fire(v: boolean): void {
    this.full = v
    this.emit(v ? 'enter-full-screen' : 'leave-full-screen')
  }
  webContents = { send: (_c: string, p: unknown): void => void this.sent.push(p) }
}

describe('attachFullscreenController', () => {
  it('attributes our own enter to media and release leaves', () => {
    const w = new FakeWin()
    const c = attachFullscreenController(w)
    expect(c.request(true, 'media-toggle')).toEqual({ fullscreen: true, owner: 'media' })
    expect(c.request(false, 'media-release').fullscreen).toBe(false)
    expect(w.sent).toEqual([
      { fullscreen: true, owner: 'media' },
      { fullscreen: false, owner: null },
    ])
  })
  it('user F11 enter: media-release ignored, media-toggle(false) leaves', () => {
    const w = new FakeWin()
    const c = attachFullscreenController(w)
    w.fire(true)
    expect(c.owner()).toBe('user')
    c.request(false, 'media-release')
    expect(w.setFullScreen).not.toHaveBeenCalled()
    expect(c.request(false, 'media-toggle').fullscreen).toBe(false)
    expect(w.setFullScreen).toHaveBeenCalledWith(false)
  })
  it('second enter without a request is user', () => {
    const w = new FakeWin()
    const c = attachFullscreenController(w)
    c.request(true, 'media-toggle')
    w.fire(false)
    w.fire(true)
    expect(c.owner()).toBe('user')
  })
  it('requesting enter while already fullscreen keeps owner and leaves no stale pending flag', () => {
    const w = new FakeWin()
    const c = attachFullscreenController(w)
    w.fire(true)
    c.request(true, 'media-toggle')
    expect(w.setFullScreen).not.toHaveBeenCalled()
    w.fire(false)
    w.fire(true)
    expect(c.owner()).toBe('user')
  })
  it('ignores non-fullscreenable or destroyed windows', () => {
    const w = new FakeWin()
    w.fullscreenable = false
    const c = attachFullscreenController(w)
    c.request(true, 'media-toggle')
    expect(w.setFullScreen).not.toHaveBeenCalled()
    w.fullscreenable = true
    w.destroyed = true
    c.request(true, 'media-toggle')
    expect(w.setFullScreen).not.toHaveBeenCalled()
  })
  it('a refused enter (no-op setFullScreen) does not claim the next F11 for media', () => {
    const w = new FakeWin()
    w.setFullScreen.mockImplementation(() => undefined)
    const c = attachFullscreenController(w)
    c.request(true, 'media-toggle')
    w.fire(true)
    expect(c.owner()).toBe('user')
    c.request(false, 'media-release')
    expect(w.setFullScreen).toHaveBeenCalledTimes(1)
  })
  it('an enter whose event never arrives times out before a later F11', () => {
    vi.useFakeTimers()
    try {
      const w = new FakeWin()
      w.setFullScreen.mockImplementation((v: boolean) => {
        w.full = v
      })
      const c = attachFullscreenController(w, {
        set: (fn, ms) => setTimeout(fn, ms),
        clear: (h) => clearTimeout(h as never),
      })
      c.request(true, 'media-toggle')
      vi.advanceTimersByTime(1500)
      w.fire(true)
      expect(c.owner()).toBe('user')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('WindowFullscreenRequestSchema', () => {
  it('accepts valid and rejects bad reason', () => {
    expect(
      WindowFullscreenRequestSchema.safeParse({ fullscreen: true, reason: 'media-toggle' }).success
    ).toBe(true)
    expect(WindowFullscreenRequestSchema.safeParse({ fullscreen: true, reason: 'x' }).success).toBe(
      false
    )
    expect(
      WindowFullscreenRequestSchema.safeParse({ fullscreen: 1, reason: 'media-release' }).success
    ).toBe(false)
  })
})
