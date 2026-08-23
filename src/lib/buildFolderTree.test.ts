import { describe, it, expect } from 'vitest'
import { buildFolderTree, getFolderAncestorPaths } from './buildFolderTree'

describe('buildFolderTree', () => {
  it('returns a childless root when given no folder paths', () => {
    expect(buildFolderTree('D:\\Media', [])).toEqual({
      path: 'D:\\Media',
      name: 'D:\\Media',
      children: [],
    })
  })

  it('attaches a direct child folder under root', () => {
    const tree = buildFolderTree('D:\\Media', ['D:\\Media\\WorkA'])
    expect(tree.children).toEqual([{ path: 'D:\\Media\\WorkA', name: 'WorkA', children: [] }])
  })

  it('synthesizes intermediate ancestor folders that never appear in the flat list', () => {
    // Only the deep leaf "WorkA" is returned by the scan (matches
    // scanLibraryRecursive collapsing a pure category chain down to its
    // leaf) - the "Circle"/"Series" category folders in between must still
    // appear as their own tree nodes.
    const tree = buildFolderTree('D:\\Media', ['D:\\Media\\Circle\\Series\\WorkA'])
    expect(tree.children).toEqual([
      {
        path: 'D:\\Media\\Circle',
        name: 'Circle',
        children: [
          {
            path: 'D:\\Media\\Circle\\Series',
            name: 'Series',
            children: [{ path: 'D:\\Media\\Circle\\Series\\WorkA', name: 'WorkA', children: [] }],
          },
        ],
      },
    ])
  })

  it('merges two paths that share an ancestor instead of duplicating it', () => {
    const tree = buildFolderTree('D:\\Media', [
      'D:\\Media\\Circle\\WorkA',
      'D:\\Media\\Circle\\WorkB',
    ])
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0].name).toBe('Circle')
    expect(tree.children[0].children.map((c) => c.name)).toEqual(['WorkA', 'WorkB'])
  })

  it('ignores a path equal to root itself', () => {
    const tree = buildFolderTree('D:\\Media', ['D:\\Media'])
    expect(tree.children).toEqual([])
  })

  it('ignores a path outside of root', () => {
    const tree = buildFolderTree('D:\\Media', ['E:\\Other\\WorkA'])
    expect(tree.children).toEqual([])
  })

  it('is tolerant of forward-slash paths mixed with the root\'s own separator', () => {
    const tree = buildFolderTree('D:\\Media', ['D:/Media/WorkA'])
    expect(tree.children).toEqual([{ path: 'D:\\Media\\WorkA', name: 'WorkA', children: [] }])
  })
})

describe('getFolderAncestorPaths', () => {
  it('returns just the root when path equals root', () => {
    expect(getFolderAncestorPaths('D:\\Media', 'D:\\Media')).toEqual(['D:\\Media'])
  })

  it('returns the full chain from root down to a nested path, inclusive', () => {
    expect(getFolderAncestorPaths('D:\\Media', 'D:\\Media\\Circle\\WorkA')).toEqual([
      'D:\\Media',
      'D:\\Media\\Circle',
      'D:\\Media\\Circle\\WorkA',
    ])
  })

  it('falls back to just the root when path is outside of root', () => {
    expect(getFolderAncestorPaths('D:\\Media', 'E:\\Other\\WorkA')).toEqual(['D:\\Media'])
  })
})
