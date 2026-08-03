import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMediaThumbnailResponse } from './mediaThumbnailProtocol'

describe('buildMediaThumbnailResponse', () => {
  let libraryDir: string
  let filePath: string
  let cacheDir: string

  beforeEach(async () => {
    libraryDir = await mkdtemp(join(tmpdir(), 'ark-manager-mediathumb-'))
    filePath = join(libraryDir, 'clip.mp4')
    await writeFile(filePath, '')
    cacheDir = join(libraryDir, 'cache')
  })

  afterEach(async () => {
    await rm(libraryDir, { recursive: true, force: true })
  })

  it('returns 404 for a path outside every allowed root', async () => {
    const response = await buildMediaThumbnailResponse(
      filePath,
      ['D:\\SomeOtherLibrary'],
      cacheDir,
      () => null
    )
    expect(response.status).toBe(404)
  })

  it('serves the manual override without calling resolve', async () => {
    const overrideImage = join(libraryDir, 'override.webp')
    await writeFile(overrideImage, 'fake-webp-bytes')
    let resolveCalls = 0
    const resolve = async () => {
      resolveCalls++
      return null
    }

    const response = await buildMediaThumbnailResponse(
      filePath,
      [libraryDir],
      cacheDir,
      () => overrideImage,
      resolve
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(await response.text()).toBe('fake-webp-bytes')
    expect(resolveCalls).toBe(0)
  })

  it('falls back to resolve() when no override exists', async () => {
    const resolvedImage = join(libraryDir, 'frame.webp')
    await writeFile(resolvedImage, 'fake-frame-bytes')
    const resolve = async () => resolvedImage

    const response = await buildMediaThumbnailResponse(
      filePath,
      [libraryDir],
      cacheDir,
      () => null,
      resolve
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('fake-frame-bytes')
  })

  it('serves a non-webp directory-image fallback with the correct content type', async () => {
    const jpgImage = join(libraryDir, 'cover.jpg')
    await writeFile(jpgImage, 'fake-jpg-bytes')
    const resolve = async () => jpgImage

    const response = await buildMediaThumbnailResponse(
      filePath,
      [libraryDir],
      cacheDir,
      () => null,
      resolve
    )

    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
  })

  it('returns 404 when neither an override nor resolve() produces a thumbnail', async () => {
    const resolve = async () => null
    const response = await buildMediaThumbnailResponse(
      filePath,
      [libraryDir],
      cacheDir,
      () => null,
      resolve
    )
    expect(response.status).toBe(404)
  })

  it('returns 404 when the resolved path cannot actually be read', async () => {
    const resolve = async () => join(libraryDir, 'does-not-exist.webp')
    const response = await buildMediaThumbnailResponse(
      filePath,
      [libraryDir],
      cacheDir,
      () => null,
      resolve
    )
    expect(response.status).toBe(404)
  })
})
