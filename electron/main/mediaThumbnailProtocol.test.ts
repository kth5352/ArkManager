import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildMediaThumbnailResponse,
  buildPlaylistCoverResponse,
  decodeMediaThumbnailPath,
} from './mediaThumbnailProtocol'

describe('buildMediaThumbnailResponse', () => {
  let libraryDir: string
  let filePath: string

  beforeEach(async () => {
    libraryDir = await mkdtemp(join(tmpdir(), 'ark-manager-mediathumb-'))
    filePath = join(libraryDir, 'clip.mp4')
    await writeFile(filePath, '')
  })

  afterEach(async () => {
    await rm(libraryDir, { recursive: true, force: true })
  })

  it('returns 404 for a path outside every allowed root', async () => {
    const response = await buildMediaThumbnailResponse(
      filePath,
      ['D:\\SomeOtherLibrary'],
      [],
      () => null,
      async () => null
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
      () => null,
      async () => null
    )
    expect(response.status).toBe(404)
  })
})

describe('decodeMediaThumbnailPath', () => {
  it('decodes the path ignoring the version query', () => {
    const original = 'D:\\音声\\#1 ?.flac'
    const url = `mediathumb://cover/${encodeURIComponent(original)}?v=3-2`
    expect(decodeMediaThumbnailPath(url)).toBe(original)
    expect(
      decodeMediaThumbnailPath(`mediathumb://thumbnail/${encodeURIComponent(original)}?v=1-1`)
    ).toBe(original)
    expect(decodeMediaThumbnailPath(`mediathumb://thumbnail/${encodeURIComponent(original)}`)).toBe(
      original
    )
  })
})

describe('buildMediaThumbnailResponse cover kind', () => {
  let libraryDir: string
  let filePath: string

  beforeEach(async () => {
    libraryDir = await mkdtemp(join(tmpdir(), 'ark-manager-mediacover-'))
    filePath = join(libraryDir, 'song.mp3')
    await writeFile(filePath, '')
  })

  afterEach(async () => {
    await rm(libraryDir, { recursive: true, force: true })
  })

  it('serves the 2048px cover file from resolve', async () => {
    const cover = join(libraryDir, 'cover-2048.webp')
    await writeFile(cover, 'big-cover')
    const response = await buildMediaThumbnailResponse(
      filePath,
      [libraryDir],
      [],
      () => null,
      async () => cover,
      'cover'
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('big-cover')
  })

  it('returns 404 outside the boundary', async () => {
    const response = await buildMediaThumbnailResponse(
      filePath,
      ['D:\\Other'],
      [],
      () => null,
      async () => filePath,
      'cover'
    )
    expect(response.status).toBe(404)
  })

  it('prefers the large override, then the 512 override, then the resolved cover', async () => {
    const override = join(libraryDir, 'key.webp')
    const large = join(libraryDir, 'key.large.webp')
    const resolved = join(libraryDir, 'resolved.webp')
    await writeFile(override, 'small-override')
    await writeFile(resolved, 'resolved')
    const call = (getOverride: () => string | null) =>
      buildMediaThumbnailResponse(
        filePath,
        [libraryDir],
        [],
        getOverride,
        async () => resolved,
        'cover'
      )

    expect(await (await call(() => override)).text()).toBe('small-override')
    await writeFile(large, 'large-override')
    expect(await (await call(() => override)).text()).toBe('large-override')
    expect(await (await call(() => null)).text()).toBe('resolved')
  })

  it('thumbnail kind never uses the large override', async () => {
    const override = join(libraryDir, 'key.webp')
    await writeFile(override, 'small-override')
    await writeFile(join(libraryDir, 'key.large.webp'), 'large-override')
    const response = await buildMediaThumbnailResponse(
      filePath,
      [libraryDir],
      [],
      () => override,
      async () => null
    )
    expect(await response.text()).toBe('small-override')
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
