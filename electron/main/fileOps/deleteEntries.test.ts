import { describe, it, expect, vi } from 'vitest'
import { deleteEntries } from './deleteEntries'

describe('deleteEntries', () => {
  it('reports success for every path when trashItem resolves', async () => {
    const trashItem = vi.fn().mockResolvedValue(undefined)

    const results = await deleteEntries(['/a', '/b'], trashItem)

    expect(results).toEqual([
      { path: '/a', success: true },
      { path: '/b', success: true },
    ])
    expect(trashItem).toHaveBeenCalledWith('/a')
    expect(trashItem).toHaveBeenCalledWith('/b')
  })

  it('continues past a per-item failure instead of aborting the batch', async () => {
    const trashItem = vi.fn().mockImplementation((path: string) => {
      if (path === '/bad') return Promise.reject(new Error('permission denied'))
      return Promise.resolve()
    })

    const results = await deleteEntries(['/a', '/bad', '/c'], trashItem)

    expect(results).toEqual([
      { path: '/a', success: true },
      { path: '/bad', success: false, error: 'permission denied' },
      { path: '/c', success: true },
    ])
  })
})
