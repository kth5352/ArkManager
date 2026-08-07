import { describe, expect, it } from 'vitest'
import { filterSaveGamesBySnapshotCounts } from './filterSaveGamesBySnapshotCounts'

describe('filterSaveGamesBySnapshotCounts', () => {
  it('hides games after their snapshot count resolves to zero', () => {
    const games = [
      { key: 'RJ01111111', savePath: 'D:\\SaveA' },
      { key: 'RJ02222222', savePath: 'D:\\SaveB' },
    ]
    const counts = new Map([
      ['RJ01111111', 0],
      ['RJ02222222', 2],
    ])

    expect(filterSaveGamesBySnapshotCounts(games, counts).map((game) => game.key)).toEqual([
      'RJ02222222',
    ])
  })

  it('keeps games whose snapshot count has not loaded yet', () => {
    const games = [{ key: 'RJ01111111', savePath: 'D:\\SaveA' }]

    expect(filterSaveGamesBySnapshotCounts(games, new Map())).toEqual(games)
  })
})
