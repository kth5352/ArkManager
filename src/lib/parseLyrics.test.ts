import { describe, expect, it } from 'vitest'
import { parseLyrics } from './parseLyrics'

describe('parseLyrics', () => {
  it('dispatches .lrc files to the LRC parser', () => {
    expect(parseLyrics('[00:01.00]hello', 'C:/song.lrc')).toEqual({
      kind: 'synced',
      lines: [{ time: 1, text: 'hello' }],
    })
  })

  it('dispatches .vtt files to the WebVTT parser', () => {
    expect(parseLyrics('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello\n', 'C:/song.vtt')).toEqual({
      kind: 'synced',
      lines: [{ time: 1, text: 'hello' }],
    })
  })

  it('dispatches .ass files to the ASS parser', () => {
    const text =
      '[Events]\nFormat: Layer, Start, End, Text\nDialogue: 0,0:00:01.00,0:00:02.00,hello\n'
    expect(parseLyrics(text, 'C:/song.ass')).toEqual({
      kind: 'synced',
      lines: [{ time: 1, text: 'hello' }],
    })
  })

  it('is case-insensitive on the extension', () => {
    expect(parseLyrics('[00:01.00]hello', 'C:/song.LRC')).toEqual({
      kind: 'synced',
      lines: [{ time: 1, text: 'hello' }],
    })
  })

  it('falls back to the LRC parser for an unrecognized extension', () => {
    expect(parseLyrics('[00:01.00]hello', 'C:/song.txt')).toEqual({
      kind: 'synced',
      lines: [{ time: 1, text: 'hello' }],
    })
  })
})
