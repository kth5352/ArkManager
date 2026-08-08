import { describe, expect, it, vi } from 'vitest'
import {
  installZoomInShortcut,
  isZoomInShortcut,
  type ZoomInput,
  type ZoomableWebContents,
} from './zoomShortcuts'

type BeforeInputListener = (event: { preventDefault: () => void }, input: ZoomInput) => void

function createWebContents(destroyed = false): {
  webContents: ZoomableWebContents
  getRegisteredListener: () => BeforeInputListener
  getZoomLevel: ReturnType<typeof vi.fn>
  setZoomLevel: ReturnType<typeof vi.fn>
} {
  let listener: BeforeInputListener | undefined
  const getZoomLevel = vi.fn(() => 0)
  const setZoomLevel = vi.fn()
  const webContents: ZoomableWebContents = {
    on: vi.fn((_event, callback: BeforeInputListener) => {
      listener = callback
    }),
    isDestroyed: vi.fn(() => destroyed),
    getZoomLevel,
    setZoomLevel,
  }

  return {
    webContents,
    getRegisteredListener: () => {
      if (!listener) throw new Error('before-input-event listener was not registered')
      return listener
    },
    getZoomLevel,
    setZoomLevel,
  }
}

describe('isZoomInShortcut', () => {
  it.each([
    { key: '=', code: 'Equal', control: true, meta: false, shift: false },
    { key: '+', code: 'Equal', control: true, meta: false, shift: true },
    { key: '+', code: 'NumpadAdd', control: true, meta: false, shift: false },
    { key: '=', code: 'Equal', control: false, meta: true, shift: false },
  ])('recognizes zoom-in input %#', (input) => {
    expect(isZoomInShortcut({ type: 'keyDown', alt: false, ...input })).toBe(true)
  })

  it.each([
    { type: 'keyDown', key: '-', code: 'Minus', control: true, meta: false, alt: false },
    { type: 'keyDown', key: '=', code: 'Equal', control: false, meta: false, alt: false },
    { type: 'keyDown', key: '=', code: 'Equal', control: true, meta: false, alt: true },
    { type: 'keyUp', key: '+', code: 'Equal', control: true, meta: false, alt: false },
  ])('rejects non-zoom input %#', (input) => {
    expect(isZoomInShortcut(input)).toBe(false)
  })
})

describe('installZoomInShortcut', () => {
  it('prevents recognized input and increases zoom by exactly 0.5', () => {
    const fake = createWebContents()
    const event = { preventDefault: vi.fn() }

    installZoomInShortcut(fake.webContents)
    fake.getRegisteredListener()(event, {
      type: 'keyDown',
      key: '+',
      code: 'Equal',
      control: true,
      meta: false,
      alt: false,
    })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(fake.getZoomLevel).toHaveBeenCalledOnce()
    expect(fake.setZoomLevel).toHaveBeenCalledExactlyOnceWith(0.5)
  })

  it('leaves rejected input to native handling without changing zoom', () => {
    const fake = createWebContents()
    const event = { preventDefault: vi.fn() }

    installZoomInShortcut(fake.webContents)
    fake.getRegisteredListener()(event, {
      type: 'keyDown',
      key: '-',
      code: 'Minus',
      control: true,
      meta: false,
      alt: false,
    })

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(fake.getZoomLevel).not.toHaveBeenCalled()
    expect(fake.setZoomLevel).not.toHaveBeenCalled()
  })

  it('does not access zoom APIs after web contents is destroyed', () => {
    const fake = createWebContents(true)
    const event = { preventDefault: vi.fn() }

    installZoomInShortcut(fake.webContents)
    fake.getRegisteredListener()(event, {
      type: 'keyDown',
      key: '+',
      code: 'NumpadAdd',
      control: true,
      meta: false,
      alt: false,
    })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(fake.getZoomLevel).not.toHaveBeenCalled()
    expect(fake.setZoomLevel).not.toHaveBeenCalled()
  })
})
