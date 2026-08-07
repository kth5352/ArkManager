import { describe, expect, it } from 'vitest'
import { getActiveLyricLine, parseLrc } from './lrc'

describe('parseLrc', () => {
  it('parses synced LRC timestamps', () => {
    expect(parseLrc('[00:10.50]hello')).toEqual({
      kind: 'synced',
      lines: [{ time: 10.5, text: 'hello' }],
    })
  })

  it('parses multiple timestamps on one line', () => {
    expect(parseLrc('[00:01.00][00:02.00]repeat').lines).toEqual([
      { time: 1, text: 'repeat' },
      { time: 2, text: 'repeat' },
    ])
  })

  it('returns static lyrics when no timestamp exists', () => {
    expect(parseLrc('line one\nline two')).toEqual({
      kind: 'static',
      lines: ['line one', 'line two'],
    })
  })

  it('sorts synced lines and drops empty metadata-only lines', () => {
    expect(parseLrc('[ar:Artist]\n[00:02.00]second\n[00:01.00]first')).toEqual({
      kind: 'synced',
      lines: [
        { time: 1, text: 'first' },
        { time: 2, text: 'second' },
      ],
    })
  })
})

describe('getActiveLyricLine', () => {
  it('returns the latest line at or before the playback time', () => {
    const lyrics = parseLrc('[00:01.00]first\n[00:02.00]second')
    expect(getActiveLyricLine(lyrics, 1.5)).toEqual({ time: 1, text: 'first' })
  })
})
