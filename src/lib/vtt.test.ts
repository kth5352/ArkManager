import { describe, expect, it } from 'vitest'
import { parseVtt } from './vtt'

describe('parseVtt', () => {
  it('parses a basic cue with hours', () => {
    const text = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello world\n'
    expect(parseVtt(text)).toEqual({
      kind: 'synced',
      lines: [{ time: 1, text: 'Hello world' }],
    })
  })

  it('parses cue timings without an hours component', () => {
    const text = 'WEBVTT\n\n00:01.500 --> 00:04.000\nShort form\n'
    expect(parseVtt(text)).toEqual({
      kind: 'synced',
      lines: [{ time: 1.5, text: 'Short form' }],
    })
  })

  it('joins multi-line cue text with newlines', () => {
    const text = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nLine one\nLine two\n'
    expect(parseVtt(text)).toEqual({
      kind: 'synced',
      lines: [{ time: 1, text: 'Line one\nLine two' }],
    })
  })

  it('sorts multiple cues by start time and skips a cue identifier line', () => {
    const text =
      'WEBVTT\n\n2\n00:00:05.000 --> 00:00:06.000\nsecond\n\n1\n00:00:01.000 --> 00:00:02.000\nfirst\n'
    expect(parseVtt(text)).toEqual({
      kind: 'synced',
      lines: [
        { time: 1, text: 'first' },
        { time: 5, text: 'second' },
      ],
    })
  })

  it('returns static lines when the file has no cue timings', () => {
    expect(parseVtt('WEBVTT\n\nNOTE just a note\n')).toEqual({
      kind: 'static',
      lines: ['WEBVTT', '', 'NOTE just a note', ''],
    })
  })
})
