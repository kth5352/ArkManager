import { describe, expect, it } from 'vitest'
import { numericGameCodeId, parseCanonicalGameCode } from './gameCode'

describe('parseCanonicalGameCode', () => {
  it('normalizes canonical VNDB codes', () => {
    expect(parseCanonicalGameCode('VNV45775')).toEqual({ type: 'VNV', value: 'VNV45775' })
    expect(parseCanonicalGameCode('vnr45775')).toEqual({ type: 'VNR', value: 'VNR45775' })
  })

  it('rejects legacy and ambiguous VNDB codes', () => {
    expect(parseCanonicalGameCode('VN45775')).toBeNull()
    expect(parseCanonicalGameCode('VR45775')).toBeNull()
    expect(parseCanonicalGameCode('v45775')).toBeNull()
  })
})

describe('numericGameCodeId', () => {
  it('removes the complete canonical prefix', () => {
    expect(numericGameCodeId({ type: 'VNV', value: 'VNV45775' })).toBe('45775')
  })
})
