import { describe, it, expect } from 'vitest'
import { parseRangeHeader } from './parseRangeHeader'

describe('parseRangeHeader', () => {
  it('parses an explicit start-end range', () => {
    expect(parseRangeHeader('bytes=0-499', 1000)).toEqual({ start: 0, end: 499 })
  })

  it('parses an open-ended range (start to end of file)', () => {
    expect(parseRangeHeader('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
  })

  it('parses a suffix range (last N bytes)', () => {
    expect(parseRangeHeader('bytes=-200', 1000)).toEqual({ start: 800, end: 999 })
  })

  it('clamps a suffix range longer than the file to the whole file', () => {
    expect(parseRangeHeader('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('clamps an end past the file size down to the last byte', () => {
    expect(parseRangeHeader('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('returns null for a malformed header', () => {
    expect(parseRangeHeader('nonsense', 1000)).toBeNull()
  })

  it('returns null when neither start nor end is given', () => {
    expect(parseRangeHeader('bytes=-', 1000)).toBeNull()
  })

  it('returns null when start is past the end of the file', () => {
    expect(parseRangeHeader('bytes=1000-1500', 1000)).toBeNull()
  })

  it('returns null when start is after end', () => {
    expect(parseRangeHeader('bytes=500-100', 1000)).toBeNull()
  })
})
