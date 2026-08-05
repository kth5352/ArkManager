import { describe, it, expect } from 'vitest'
import { parseCodeInput } from './parseCodeInput'

describe('parseCodeInput', () => {
  it('recognizes an RJ code typed directly', () => {
    expect(parseCodeInput('RJ01169914')).toEqual({ type: 'RJ', value: 'RJ01169914' })
  })

  it('recognizes an RJ code case-insensitively', () => {
    expect(parseCodeInput('rj01169914')).toEqual({ type: 'RJ', value: 'RJ01169914' })
  })

  it('recognizes a VN code typed directly', () => {
    expect(parseCodeInput('VN17')).toEqual({ type: 'VN', value: 'VN17' })
  })

  it('returns null for free-text title search input', () => {
    expect(parseCodeInput('シニシスタ2')).toBeNull()
  })

  it('recognizes an ST (Steam) code typed directly', () => {
    expect(parseCodeInput('ST413150')).toEqual({ type: 'ST', value: 'ST413150' })
  })
})
