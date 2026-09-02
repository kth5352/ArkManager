import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMediaResponse } from './mediaProtocol'

describe('buildMediaResponse', () => {
  let libraryDir: string
  let filePath: string
  let cacheDir: string
  const fileContent = 'abcdefghij'

  beforeEach(async () => {
    libraryDir = await mkdtemp(join(tmpdir(), 'ark-manager-media-'))
    filePath = join(libraryDir, 'track.mp3')
    await writeFile(filePath, fileContent)
    cacheDir = join(libraryDir, 'cache')
  })

  afterEach(async () => {
    await rm(libraryDir, { recursive: true, force: true })
  })

  it('returns a full 200 response with Content-Length when no Range header is sent', async () => {
    const response = await buildMediaResponse(filePath, [libraryDir], [], cacheDir, null)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(response.headers.get('Content-Length')).toBe(String(fileContent.length))
    expect(await response.text()).toBe(fileContent)
  })

  it('returns a 206 partial response for a satisfiable Range request', async () => {
    const response = await buildMediaResponse(filePath, [libraryDir], [], cacheDir, 'bytes=2-4')
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe(`bytes 2-4/${fileContent.length}`)
    expect(await response.text()).toBe('cde')
  })

  it('returns 416 for an unsatisfiable Range request', async () => {
    const response = await buildMediaResponse(filePath, [libraryDir], [], cacheDir, 'bytes=9999-')
    expect(response.status).toBe(416)
  })

  it('returns 404 for a path outside every allowed root', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'ark-manager-outside-'))
    const outsideFile = join(outsideDir, 'secret.mp3')
    await writeFile(outsideFile, 'secret')
    try {
      const response = await buildMediaResponse(outsideFile, [libraryDir], [], cacheDir, null)
      expect(response.status).toBe(404)
    } finally {
      await rm(outsideDir, { recursive: true, force: true })
    }
  })

  it('returns 404 for a file that does not exist', async () => {
    const response = await buildMediaResponse(
      join(libraryDir, 'missing.mp3'),
      [libraryDir],
      [],
      cacheDir,
      null
    )
    expect(response.status).toBe(404)
  })

  it('returns 404 for a directory path instead of an EISDIR stream error', async () => {
    const subDir = join(libraryDir, 'subfolder')
    await mkdir(subDir)
    const response = await buildMediaResponse(subDir, [libraryDir], [], cacheDir, null)
    expect(response.status).toBe(404)
  })

  it('returns 200 for a path outside allowedRoots but present in trustedPaths', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'ark-manager-outside-'))
    const outsideFile = join(outsideDir, 'playlist-track.mp3')
    await writeFile(outsideFile, fileContent)
    try {
      const response = await buildMediaResponse(outsideFile, [libraryDir], [outsideFile], cacheDir, null)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(fileContent)
    } finally {
      await rm(outsideDir, { recursive: true, force: true })
    }
  })

  it('returns 404 for a path outside both allowedRoots and trustedPaths', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'ark-manager-outside-'))
    const outsideFile = join(outsideDir, 'secret.mp3')
    await writeFile(outsideFile, 'secret')
    try {
      const response = await buildMediaResponse(
        outsideFile,
        [libraryDir],
        ['D:\\SomeOther\\unrelated-track.mp3'],
        cacheDir,
        null
      )
      expect(response.status).toBe(404)
    } finally {
      await rm(outsideDir, { recursive: true, force: true })
    }
  })

  it("serves the resolver's returned path's bytes, but still uses the ORIGINAL path's extension for Content-Type", async () => {
    const remuxedPath = join(libraryDir, 'remuxed.mp4')
    await writeFile(remuxedPath, 'remuxed-bytes')
    const videoPath = join(libraryDir, 'clip.mp4')
    await writeFile(videoPath, 'original-bytes')

    const response = await buildMediaResponse(
      videoPath,
      [libraryDir],
      [],
      cacheDir,
      null,
      async () => remuxedPath
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('video/mp4')
    expect(await response.text()).toBe('remuxed-bytes')
  })

  it('never calls the resolver for a path outside every allowed root and trusted path', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'ark-manager-outside-'))
    const outsideFile = join(outsideDir, 'secret.mp3')
    await writeFile(outsideFile, 'secret')
    let resolveCalls = 0
    try {
      const response = await buildMediaResponse(
        outsideFile,
        [libraryDir],
        [],
        cacheDir,
        null,
        async () => {
          resolveCalls++
          return outsideFile
        }
      )
      expect(response.status).toBe(404)
      expect(resolveCalls).toBe(0)
    } finally {
      await rm(outsideDir, { recursive: true, force: true })
    }
  })
})
