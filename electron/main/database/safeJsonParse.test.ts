import { describe, expect, it, vi } from 'vitest'
import { parseJsonSafely } from './safeJsonParse'

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

describe('parseJsonSafely', () => {
  it('returns the parsed value when it is valid JSON of the expected shape', () => {
    expect(parseJsonSafely('["a","b"]', isStringArray, 'test')).toEqual(['a', 'b'])
  })

  it('returns null (not a thrown error) for syntactically invalid JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseJsonSafely('{not valid json', isStringArray, 'test')).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns null (not the wrongly-shaped value) for valid JSON of the wrong shape', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseJsonSafely('{"a":1}', isStringArray, 'test')).toBeNull()
    expect(parseJsonSafely('[1,2,3]', isStringArray, 'test')).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('logs the corruption with the caller-supplied context, for diagnosing a real report', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    parseJsonSafely('not json', isStringArray, 'game_metadata.genres (code=RJ01234567)')
    expect(warn.mock.calls[0]?.[0]).toContain('game_metadata.genres (code=RJ01234567)')
    warn.mockRestore()
  })
})
