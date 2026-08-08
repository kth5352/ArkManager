import { describe, it, expect } from 'vitest'
import { parseCodeInput } from './parseCodeInput'

describe('parseCodeInput', () => {
  it('recognizes an RJ code typed directly', () => {
    expect(parseCodeInput('RJ01169914')).toEqual({ type: 'RJ', value: 'RJ01169914' })
  })

  it('recognizes an RJ code case-insensitively', () => {
    expect(parseCodeInput('rj01169914')).toEqual({ type: 'RJ', value: 'RJ01169914' })
  })

  it('recognizes a canonical VNV code typed directly', () => {
    expect(parseCodeInput('VNV45775')).toEqual({ type: 'VNV', value: 'VNV45775' })
  })

  it('recognizes a VNDB visual novel id typed with v prefix', () => {
    expect(parseCodeInput('v45775')).toEqual({ type: 'VNV', value: 'VNV45775' })
  })

  it('recognizes a VNDB release id typed with r prefix', () => {
    expect(parseCodeInput('r45775')).toEqual({ type: 'VNR', value: 'VNR45775' })
  })

  it('recognizes a canonical VNR code typed directly', () => {
    expect(parseCodeInput('VNR45775')).toEqual({ type: 'VNR', value: 'VNR45775' })
  })

  it('rejects legacy VNDB prefixes', () => {
    expect(parseCodeInput('VN45775')).toBeNull()
    expect(parseCodeInput('VR45775')).toBeNull()
  })

  it('returns null for free-text title search input', () => {
    expect(parseCodeInput('シニシスタ2')).toBeNull()
  })

  it('recognizes an ST (Steam) code typed directly', () => {
    expect(parseCodeInput('ST413150')).toEqual({ type: 'ST', value: 'ST413150' })
  })

  it('recognizes a GC (getchu) code typed directly', () => {
    expect(parseCodeInput('GC1370494')).toEqual({ type: 'GC', value: 'GC1370494' })
  })
})
