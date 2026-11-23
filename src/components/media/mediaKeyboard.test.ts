import { describe, expect, it } from 'vitest'
import {
  acceptReportedTime,
  getFullscreenKeyAction,
  getMediaShortcut,
  nextSeekTarget,
  seekBase,
  shouldYieldKeyToMediaOverlay,
  SEEK_SETTLE_TIMEOUT_MS,
  startPendingSeek,
  type ShortcutKeyEvent,
} from './mediaKeyboard'

function key(k: string, extra: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return {
    key: k,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    defaultPrevented: false,
    ...extra,
  }
}

describe('pending seek bookkeeping', () => {
  it('ignores stale pre-seek positions until the seek lands', () => {
    const pending = startPendingSeek(15, 1000)
    // mpv still reports the old position right after the seek command.
    expect(acceptReportedTime(10.2, pending, 1100)).toEqual({ time: null, pending })
    // Then the seek lands.
    expect(acceptReportedTime(15.1, pending, 1300)).toEqual({ time: 15.1, pending: null })
  })

  it('gives up waiting after the timeout so a clamped seek cannot freeze the display', () => {
    const pending = startPendingSeek(9999, 0)
    expect(acceptReportedTime(120, pending, SEEK_SETTLE_TIMEOUT_MS)).toEqual({
      time: 120,
      pending: null,
    })
  })

  it('accepts every report when no seek is pending', () => {
    expect(acceptReportedTime(42, null, 0)).toEqual({ time: 42, pending: null })
  })

  it('chains quick presses from the pending target, not the stale position', () => {
    const pending = startPendingSeek(15, 1000)
    // A stale 10.2 report was ignored, so the display still says 15 - but
    // even if currentTime were stale, the base must be the pending target.
    expect(seekBase(10.2, pending, 1100)).toBe(15)
    expect(nextSeekTarget(seekBase(10.2, pending, 1100), 5, 300)).toBe(20)
    expect(seekBase(10.2, pending, 1000 + SEEK_SETTLE_TIMEOUT_MS)).toBe(10.2)
  })

  it('clamps to [0, duration] and treats an unknown (0) duration as unbounded', () => {
    expect(nextSeekTarget(3, -5, 100)).toBe(0)
    expect(nextSeekTarget(98, 5, 100)).toBe(100)
    expect(nextSeekTarget(98, 5, 0)).toBe(103)
  })
})

describe('getMediaShortcut', () => {
  it('maps the plain arrow keys and space', () => {
    expect(getMediaShortcut(key('ArrowLeft'), null)).toBe('seekBack')
    expect(getMediaShortcut(key('ArrowRight'), null)).toBe('seekForward')
    expect(getMediaShortcut(key('ArrowUp'), null)).toBe('volumeUp')
    expect(getMediaShortcut(key('ArrowDown'), null)).toBe('volumeDown')
    expect(getMediaShortcut(key(' '), null)).toBe('togglePlay')
  })

  it('still works while the seek bar or volume slider has focus', () => {
    const range = { tagName: 'INPUT', isContentEditable: false, type: 'range' }
    expect(getMediaShortcut(key('ArrowRight'), range)).toBe('seekForward')
    expect(getMediaShortcut(key(' '), range)).toBe('togglePlay')
  })

  it('leaves text fields alone', () => {
    const text = { tagName: 'INPUT', isContentEditable: false, type: 'text' }
    expect(getMediaShortcut(key('ArrowLeft'), text)).toBeNull()
    expect(
      getMediaShortcut(key('ArrowLeft'), { tagName: 'TEXTAREA', isContentEditable: false })
    ).toBeNull()
    expect(
      getMediaShortcut(key('ArrowLeft'), { tagName: 'DIV', isContentEditable: true })
    ).toBeNull()
  })

  it('ignores modified chords and keys another handler already consumed', () => {
    expect(getMediaShortcut(key('ArrowUp', { ctrlKey: true }), null)).toBeNull()
    expect(getMediaShortcut(key('ArrowLeft', { altKey: true }), null)).toBeNull()
    expect(getMediaShortcut(key('ArrowUp', { defaultPrevented: true }), null)).toBeNull()
  })

  it('lets space activate a focused button instead of toggling playback', () => {
    expect(getMediaShortcut(key(' '), { tagName: 'BUTTON', isContentEditable: false })).toBeNull()
    expect(
      getMediaShortcut(key('ArrowLeft'), { tagName: 'BUTTON', isContentEditable: false })
    ).toBe('seekBack')
  })
})

describe('getFullscreenKeyAction', () => {
  const states = [
    { overlayVisible: true, windowFullscreen: true },
    { overlayVisible: true, windowFullscreen: false },
    { overlayVisible: false, windowFullscreen: true },
    { overlayVisible: false, windowFullscreen: false },
  ]

  it.each(states)('decision table for %j', (state) => {
    const toggle = state.overlayVisible ? 'toggleFullscreen' : null
    const exit = state.windowFullscreen ? 'exitFullscreen' : null
    expect(getFullscreenKeyAction(key('F'), null, state)).toBe(toggle)
    expect(getFullscreenKeyAction(key('f'), null, state)).toBe(toggle)
    expect(getFullscreenKeyAction(key('Escape'), null, state)).toBe(exit)
    expect(getFullscreenKeyAction(key('f', { ctrlKey: true }), null, state)).toBeNull()
    expect(getFullscreenKeyAction(key('f', { altKey: true }), null, state)).toBeNull()
    expect(getFullscreenKeyAction(key('f', { metaKey: true }), null, state)).toBeNull()
    expect(getFullscreenKeyAction(key('a'), null, state)).toBeNull()
    expect(getFullscreenKeyAction(key('Enter'), null, state)).toBeNull()
  })

  const both = { overlayVisible: true, windowFullscreen: true }

  it('ignores F while typing in a text field but not on a range input', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(
        getFullscreenKeyAction(key('f'), { tagName, isContentEditable: false }, both)
      ).toBeNull()
    }
    expect(
      getFullscreenKeyAction(key('f'), { tagName: 'DIV', isContentEditable: true }, both)
    ).toBeNull()
    expect(
      getFullscreenKeyAction(
        key('f'),
        { tagName: 'INPUT', type: 'range', isContentEditable: false },
        both
      )
    ).toBe('toggleFullscreen')
  })

  it('ignores already-handled events', () => {
    expect(getFullscreenKeyAction(key('f', { defaultPrevented: true }), null, both)).toBeNull()
    expect(getFullscreenKeyAction(key('Escape', { defaultPrevented: true }), null, both)).toBeNull()
  })
})

describe('shouldYieldKeyToMediaOverlay', () => {
  const idle = { mediaExpanded: false, isDetached: false }
  it('yields when already handled or when the attached overlay covers the page', () => {
    expect(shouldYieldKeyToMediaOverlay(key('f'), idle)).toBe(false)
    expect(shouldYieldKeyToMediaOverlay(key('f', { defaultPrevented: true }), idle)).toBe(true)
    expect(shouldYieldKeyToMediaOverlay(key('f'), { mediaExpanded: true, isDetached: false })).toBe(
      true
    )
    expect(shouldYieldKeyToMediaOverlay(key('f'), { mediaExpanded: true, isDetached: true })).toBe(
      false
    )
    expect(shouldYieldKeyToMediaOverlay(key('f'), { mediaExpanded: false, isDetached: true })).toBe(
      false
    )
  })
})
