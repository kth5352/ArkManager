import { describe, expect, it, vi } from 'vitest'
import { createMediaArtworkServices } from './mediaArtworkServices'
import type { ArtworkCache } from './mediaArtworkCache'

function fakeCache(): ArtworkCache {
  return {
    invalidate: vi.fn(async () => undefined),
    bumpWorkCoverGeneration: vi.fn(async () => undefined),
  } as unknown as ArtworkCache
}

describe('createMediaArtworkServices', () => {
  it('invalidateTrack invalidates that track then notifies with its path', async () => {
    const cache = fakeCache()
    const notify = vi.fn()
    await createMediaArtworkServices(cache, notify).invalidateTrack('D:/a.mp3')
    expect(cache.invalidate).toHaveBeenCalledWith('D:/a.mp3')
    expect(notify).toHaveBeenCalledWith('D:/a.mp3')
  })

  it('bumpWorkCover bumps the generation then notifies with null', async () => {
    const cache = fakeCache()
    const notify = vi.fn()
    await createMediaArtworkServices(cache, notify).bumpWorkCover()
    expect(cache.bumpWorkCoverGeneration).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledWith(null)
  })

  it('bumpWorkCover still notifies null and resolves when persistence rejects', async () => {
    const cache = fakeCache()
    vi.mocked(cache.bumpWorkCoverGeneration).mockRejectedValue(new Error('disk'))
    const notify = vi.fn()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(createMediaArtworkServices(cache, notify).bumpWorkCover()).resolves.toBeUndefined()
    expect(notify).toHaveBeenCalledWith(null)
    spy.mockRestore()
  })

  it('invalidateTrack still notifies and resolves when invalidation rejects', async () => {
    const cache = fakeCache()
    vi.mocked(cache.invalidate).mockRejectedValue(new Error('disk'))
    const notify = vi.fn()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(
      createMediaArtworkServices(cache, notify).invalidateTrack('x')
    ).resolves.toBeUndefined()
    expect(notify).toHaveBeenCalledWith('x')
    spy.mockRestore()
  })
})
