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

  // A live user found raw vector-path text (from a real .ass file's
  // decorative shape/karaoke-background line) showing up in the subtitle
  // log, even though the actual on-screen subtitle (rendered natively by
  // mpv/libass, which understands ASS drawing mode) looked fine. \pN (N>=1)
  // switches the DIALOGUE TEXT ITSELF into a vector-path mini-language until
  // reset by \p0 - this app's own log re-parses the raw file with no
  // equivalent drawing renderer, so a drawing-mode line must be dropped
  // entirely rather than shown as garbage text.
  it('drops a dialogue line that is entirely drawing-mode vector path data', () => {
    const text =
      HEADER +
      'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,' +
      '{\\p1}m 689 147 l 716 144 1209 149 b 1213 152 1223 150 1228 151{\\p0}\n'
    expect(parseAss(text)).toEqual({ kind: 'static', lines: expect.any(Array) })
  })

  it('keeps real text before and after a drawing-mode segment, drops only the drawing part', () => {
    const text =
      HEADER +
      'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello{\\p1}m 1 2 l 3 4{\\p0} world\n'
    expect(parseAss(text)).toEqual({
      kind: 'synced',
      lines: [{ time: 1, text: 'Hello world' }],
    })
  })

  it('drops a drawing-mode line even without an explicit {\\p0} reset (mode ends at the line anyway)', () => {
    const text =
      HEADER + 'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\p1}m 1 2 l 3 4 5 6\n'
    expect(parseAss(text)).toEqual({ kind: 'static', lines: expect.any(Array) })
  })

  it('does not confuse \\pos(...) (a position tag) with \\pN (drawing mode)', () => {
    const text =
      HEADER + 'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\pos(100,200)}Hello world\n'
    expect(parseAss(text)).toEqual({
      kind: 'synced',
      lines: [{ time: 1, text: 'Hello world' }],
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
