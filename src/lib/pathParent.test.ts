import { describe, expect, it } from 'vitest'
import { getParentPath } from './pathParent'

describe('getParentPath', () => {
  it('returns drive root with trailing slash for a drive child', () => {
    expect(getParentPath('C:\\Games')).toBe('C:\\')
  })

  it('returns UNC share root for a UNC child', () => {
    expect(getParentPath('\\\\server\\share\\Games')).toBe('\\\\server\\share\\')
  })

  it('returns malformed UNC server root defensively when share is missing', () => {
    expect(getParentPath('\\\\server')).toBe('\\\\server\\')
  })

  it('returns the bare UNC root defensively', () => {
    expect(getParentPath('\\\\')).toBe('\\\\')
  })
})
