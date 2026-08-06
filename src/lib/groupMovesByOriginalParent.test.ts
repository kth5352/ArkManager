import { describe, it, expect } from 'vitest'
import { groupMovesByOriginalParent } from './groupMovesByOriginalParent'

describe('groupMovesByOriginalParent', () => {
  it('groups items that all came from the same folder into one group', () => {
    const result = groupMovesByOriginalParent([
      { path: 'D:\\games\\a.zip', newPath: 'D:\\archive\\a.zip' },
      { path: 'D:\\games\\b.zip', newPath: 'D:\\archive\\b.zip' },
    ])
    expect(result).toEqual([
      { destDir: 'D:\\games', paths: ['D:\\archive\\a.zip', 'D:\\archive\\b.zip'] },
    ])
  })

  it('splits a batch spanning different original folders into separate groups', () => {
    const result = groupMovesByOriginalParent([
      { path: 'D:\\games\\a.zip', newPath: 'D:\\archive\\a.zip' },
      { path: 'D:\\other\\b.zip', newPath: 'D:\\archive\\b.zip' },
    ])
    expect(result).toEqual([
      { destDir: 'D:\\games', paths: ['D:\\archive\\a.zip'] },
      { destDir: 'D:\\other', paths: ['D:\\archive\\b.zip'] },
    ])
  })

  it('reconstructs a drive-root parent with a trailing separator', () => {
    const result = groupMovesByOriginalParent([{ path: 'D:\\a.zip', newPath: 'D:\\sub\\a.zip' }])
    expect(result).toEqual([{ destDir: 'D:\\', paths: ['D:\\sub\\a.zip'] }])
  })

  it('returns an empty array for no moves', () => {
    expect(groupMovesByOriginalParent([])).toEqual([])
  })
})
