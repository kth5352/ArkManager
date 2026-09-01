import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMediaThumbnailResponse, buildPlaylistCoverResponse } from './mediaThumbnailProtocol'

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
      [],
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
      [],
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
      [],
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
      [],
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
      [],
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
      [],
      cacheDir,
      () => null,
      resolve
    )
    expect(response.status).toBe(404)
  })

  it('returns 200 for a path outside allowedRoots but present in trustedPaths', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'ark-manager-mediathumb-outside-'))
    const outsideFile = join(outsideDir, 'clip.mp4')
    await writeFile(outsideFile, '')
    const resolvedImage = join(libraryDir, 'frame.webp')
    await writeFile(resolvedImage, 'fake-frame-bytes')
    const resolve = async () => resolvedImage
    try {
      const response = await buildMediaThumbnailResponse(
        outsideFile,
        [libraryDir],
        [outsideFile],
        cacheDir,
        () => null,
        resolve
      )
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('fake-frame-bytes')
    } finally {
      await rm(outsideDir, { recursive: true, force: true })
    }
  })

  it('returns 404 for a path outside both allowedRoots and trustedPaths', async () => {
    const response = await buildMediaThumbnailResponse(
      filePath,
      ['D:\\SomeOtherLibrary'],
      ['D:\\SomeOther\\unrelated-track.mp3'],
      cacheDir,
      () => null
    )
    expect(response.status).toBe(404)
  })
})

describe('buildPlaylistCoverResponse', () => {
  let coverDir: string

  beforeEach(async () => {
    coverDir = await mkdtemp(join(tmpdir(), 'ark-manager-playlist-cover-'))
  })

  afterEach(async () => {
    await rm(coverDir, { recursive: true, force: true })
  })

  it('returns 404 when no cover path is stored', async () => {
    const response = await buildPlaylistCoverResponse('pl-1', () => null)
    expect(response.status).toBe(404)
  })

  it('serves the stored cover file with the correct content type', async () => {
    const coverPath = join(coverDir, 'pl-1.webp')
    await writeFile(coverPath, 'fake-webp-bytes')
    const response = await buildPlaylistCoverResponse('pl-1', () => coverPath)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/webp')
    expect(await response.text()).toBe('fake-webp-bytes')
  })

  it('returns 404 when the stored path cannot actually be read', async () => {
    const response = await buildPlaylistCoverResponse('pl-1', () => join(coverDir, 'missing.webp'))
    expect(response.status).toBe(404)
  })
})
