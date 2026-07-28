import { describe, it, expect } from 'vitest'
import { extractCode } from './codeRecognition'

describe('extractCode', () => {
  it('recognizes an RJ code anywhere in the name', () => {
    expect(extractCode('[RJ01234567] 게임명.zip')).toEqual({ type: 'RJ', value: 'RJ01234567' })
  })

  it('recognizes a VJ code', () => {
    expect(extractCode('VJ009988 - Some Game')).toEqual({ type: 'VJ', value: 'VJ009988' })
  })

  it('recognizes an ST (Steam) code', () => {
    expect(extractCode('ST4282500')).toEqual({ type: 'ST', value: 'ST4282500' })
  })

  it('is case-insensitive but normalizes the prefix to uppercase', () => {
    expect(extractCode('rj01234567.zip')).toEqual({ type: 'RJ', value: 'RJ01234567' })
  })

  it('returns null when no code is present', () => {
    expect(extractCode('그냥 폴더 이름')).toBeNull()
  })

  it('returns null for a near-miss that is not actually a code (letters not immediately followed by digits)', () => {
    expect(extractCode('STAGE2_backup.txt')).toBeNull()
  })

  it('does not match a code embedded mid-word without a boundary', () => {
    expect(extractCode('COST1234.txt')).toBeNull()
  })
})
