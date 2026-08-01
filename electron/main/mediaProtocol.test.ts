import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildMediaResponse } from './mediaProtocol'

describe('buildMediaResponse', () => {
  let libraryDir: string
  let filePath: string
  const fileContent = 'abcdefghij'

  beforeEach(async () => {
    libraryDir = await mkdtemp(join(tmpdir(), 'ark-manager-media-'))
    filePath = join(libraryDir, 'track.mp3')
    await writeFile(filePath, fileContent)
  })

  afterEach(async () => {
    await rm(libraryDir, { recursive: true, force: true })
  })

  it('returns a full 200 response with Content-Length when no Range header is sent', async () => {
    const response = await buildMediaResponse(filePath, [libraryDir], null)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(response.headers.get('Content-Length')).toBe(String(fileContent.length))
    expect(await response.text()).toBe(fileContent)
  })

  it('returns a 206 partial response for a satisfiable Range request', async () => {
    const response = await buildMediaResponse(filePath, [libraryDir], 'bytes=2-4')
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe(`bytes 2-4/${fileContent.length}`)
    expect(await response.text()).toBe('cde')
  })

  it('returns 416 for an unsatisfiable Range request', async () => {
    const response = await buildMediaResponse(filePath, [libraryDir], 'bytes=9999-')
    expect(response.status).toBe(416)
  })

  it('returns 404 for a path outside every allowed root', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'ark-manager-outside-'))
    const outsideFile = join(outsideDir, 'secret.mp3')
    await writeFile(outsideFile, 'secret')
    try {
      const response = await buildMediaResponse(outsideFile, [libraryDir], null)
      expect(response.status).toBe(404)
    } finally {
      await rm(outsideDir, { recursive: true, force: true })
    }
  })

  it('returns 404 for a file that does not exist', async () => {
    const response = await buildMediaResponse(join(libraryDir, 'missing.mp3'), [libraryDir], null)
    expect(response.status).toBe(404)
  })

  it('returns 404 for a directory path instead of an EISDIR stream error', async () => {
    const subDir = join(libraryDir, 'subfolder')
    await mkdir(subDir)
    const response = await buildMediaResponse(subDir, [libraryDir], null)
    expect(response.status).toBe(404)
  })
})
