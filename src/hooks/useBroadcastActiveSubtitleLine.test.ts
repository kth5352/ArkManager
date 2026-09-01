import { describe, it, expect } from 'vitest'
import { computeSubtitleLinePayload, payloadsEqual } from './useBroadcastActiveSubtitleLine'
import type { ParsedLyrics } from '../lib/lrc'

const SYNCED: ParsedLyrics = {
  kind: 'synced',
  lines: [
    { time: 1, text: 'first line' },
    { time: 5, text: 'second line' },
  ],
}

const STATIC: ParsedLyrics = { kind: 'static', lines: ['plain lyrics, not synced'] }

describe('computeSubtitleLinePayload', () => {
  it('returns no-track when there is no current track', () => {
    expect(computeSubtitleLinePayload(SYNCED, 10, false)).toEqual({ kind: 'no-track' })
  })

  it('returns no-lyrics when there are no parsed lyrics at all', () => {
    expect(computeSubtitleLinePayload(null, 10, true)).toEqual({ kind: 'no-lyrics' })
  })

  it('returns no-lyrics when the lyrics are static (not time-synced)', () => {
    expect(computeSubtitleLinePayload(STATIC, 10, true)).toEqual({ kind: 'no-lyrics' })
  })

  it('returns no-active-line before the first timestamp', () => {
    expect(computeSubtitleLinePayload(SYNCED, 0, true)).toEqual({ kind: 'no-active-line' })
  })

  it('returns the active line text at/after its timestamp', () => {
    expect(computeSubtitleLinePayload(SYNCED, 1, true)).toEqual({ kind: 'line', text: 'first line' })
    expect(computeSubtitleLinePayload(SYNCED, 4.9, true)).toEqual({ kind: 'line', text: 'first line' })
    expect(computeSubtitleLinePayload(SYNCED, 5, true)).toEqual({ kind: 'line', text: 'second line' })
  })
})

describe('payloadsEqual', () => {
  it('treats two non-line payloads of the same kind as equal', () => {
    expect(payloadsEqual({ kind: 'no-track' }, { kind: 'no-track' })).toBe(true)
    expect(payloadsEqual({ kind: 'no-lyrics' }, { kind: 'no-lyrics' })).toBe(true)
    expect(payloadsEqual({ kind: 'no-active-line' }, { kind: 'no-active-line' })).toBe(true)
  })

  it('treats payloads of different kinds as unequal', () => {
    expect(payloadsEqual({ kind: 'no-track' }, { kind: 'no-lyrics' })).toBe(false)
    expect(payloadsEqual({ kind: 'no-active-line' }, { kind: 'line', text: 'x' })).toBe(false)
  })

  it('compares line payloads by text', () => {
    expect(payloadsEqual({ kind: 'line', text: 'a' }, { kind: 'line', text: 'a' })).toBe(true)
    expect(payloadsEqual({ kind: 'line', text: 'a' }, { kind: 'line', text: 'b' })).toBe(false)
  })
})
