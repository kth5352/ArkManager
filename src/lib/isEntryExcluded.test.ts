import { describe, it, expect } from 'vitest'
import { isEntryExcluded } from './isEntryExcluded'

describe('isEntryExcluded', () => {
  it('returns true for a code-linked entry whose code is in the excluded set', () => {
    const entry = { code: { type: 'RJ' as const, value: 'RJ01234567' }, path: 'd:\\games\\foo' }
    expect(isEntryExcluded(entry, new Set(['RJ01234567']))).toBe(true)
  })

  it('returns false for a code-linked entry whose code is not excluded', () => {
    const entry = { code: { type: 'RJ' as const, value: 'RJ01234567' }, path: 'd:\\games\\foo' }
    expect(isEntryExcluded(entry, new Set(['RJ09999999']))).toBe(false)
  })

  it('returns true for a code-less entry whose normalized path is in the excluded set', () => {
    const entry = { code: null, path: 'D:\\Games\\Some-Folder\\' }
    expect(isEntryExcluded(entry, new Set(['d:\\games\\some-folder']))).toBe(true)
  })

  it('returns false for a code-less entry whose normalized path is not excluded', () => {
    const entry = { code: null, path: 'd:\\games\\other-folder' }
    expect(isEntryExcluded(entry, new Set(['d:\\games\\some-folder']))).toBe(false)
  })

  it('returns false when the excluded set is empty', () => {
    const entry = { code: null, path: 'd:\\games\\foo' }
    expect(isEntryExcluded(entry, new Set())).toBe(false)
  })
})
