import { describe, expect, it } from 'vitest'
import { parseAss } from './ass'

const HEADER = `[Script Info]
Title: Example

[V4+ Styles]
Format: Name, Fontname, Fontsize
Style: Default,Arial,20

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

describe('parseAss', () => {
  it('parses a basic dialogue line', () => {
    const text = HEADER + 'Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello world\n'
    expect(parseAss(text)).toEqual({
      kind: 'synced',
      lines: [{ time: 1, text: 'Hello world' }],
    })
  })

  it('strips override tags and converts \\N to a newline', () => {
    const text =
      HEADER + 'Dialogue: 0,0:00:05.50,0:00:08.00,Default,,0,0,0,,{\\pos(100,200)}Line one\\NLine two\n'
    expect(parseAss(text)).toEqual({
      kind: 'synced',
      lines: [{ time: 5.5, text: 'Line one\nLine two' }],
    })
  })

  it('preserves commas inside the Text field', () => {
    const text = HEADER + 'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello, world\n'
    expect(parseAss(text)).toEqual({
      kind: 'synced',
      lines: [{ time: 1, text: 'Hello, world' }],
    })
  })

  it('sorts dialogue lines by start time', () => {
    const text =
      HEADER +
      'Dialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,second\n' +
      'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,first\n'
    expect(parseAss(text)).toEqual({
      kind: 'synced',
      lines: [
        { time: 1, text: 'first' },
        { time: 5, text: 'second' },
      ],
    })
  })

  it('returns static lines when no Events/Dialogue section is found', () => {
    const text = '[Script Info]\nTitle: Empty\n'
    expect(parseAss(text)).toEqual({
      kind: 'static',
      lines: ['[Script Info]', 'Title: Empty', ''],
    })
  })
})
