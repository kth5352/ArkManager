import { describe, it, expect } from 'vitest'
import { formatPlaytime } from './formatPlaytime'

describe('formatPlaytime', () => {
  it('formats zero as 0분', () => {
    expect(formatPlaytime(0)).toBe('0분')
  })

  it('formats under an hour as minutes only', () => {
    expect(formatPlaytime(25 * 60_000)).toBe('25분')
  })

  it('formats an exact hour with no leftover minutes', () => {
    expect(formatPlaytime(60 * 60_000)).toBe('1시간')
  })

  it('formats hours and minutes together', () => {
    expect(formatPlaytime(3 * 60 * 60_000 + 20 * 60_000)).toBe('3시간 20분')
  })

  it('rounds down partial minutes', () => {
    expect(formatPlaytime(90_500)).toBe('1분')
  })
})
