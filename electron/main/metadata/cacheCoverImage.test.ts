import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { cacheCoverImage } from './cacheCoverImage'

describe('cacheCoverImage', () => {
  let server: Server
  let baseUrl: string
  let cacheDir: string

  beforeEach(async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer()

    server = createServer((req, res) => {
      if (req.url === '/missing.jpg') {
        res.writeHead(404).end()
        return
      }
      if (req.url === '/invalid.jpg') {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end('not an image')
        return
      }
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(png)
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('server not listening')
    baseUrl = `http://127.0.0.1:${address.port}`

    cacheDir = await mkdtemp(join(tmpdir(), 'ark-manager-cover-'))
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(cacheDir, { recursive: true, force: true })
  })

  it('downloads an image, converts it to webp, and saves it under cacheDir/code.webp', async () => {
    const savedPath = await cacheCoverImage(cacheDir, 'RJ01169914', `${baseUrl}/cover.jpg`)
    expect(savedPath).toBe(join(cacheDir, 'RJ01169914.webp'))
    const buffer = await readFile(savedPath!)
    expect(buffer.subarray(8, 12).toString('ascii')).toBe('WEBP')
  })

  it('returns null when the download fails', async () => {
    const savedPath = await cacheCoverImage(cacheDir, 'RJ00000000', `${baseUrl}/missing.jpg`)
    expect(savedPath).toBeNull()
  })

  it('creates cacheDir if it does not exist', async () => {
    const nonExistentDir = join(cacheDir, 'nested', 'cache', 'dir')
    const savedPath = await cacheCoverImage(nonExistentDir, 'RJ01169914', `${baseUrl}/cover.jpg`)
    expect(savedPath).toBe(join(nonExistentDir, 'RJ01169914.webp'))
    const buffer = await readFile(savedPath!)
    expect(buffer.subarray(8, 12).toString('ascii')).toBe('WEBP')
  })

  it('returns null when image parsing fails', async () => {
    const savedPath = await cacheCoverImage(cacheDir, 'RJ00000000', `${baseUrl}/invalid.jpg`)
    expect(savedPath).toBeNull()
  })

  it('hashes a code containing path-traversal segments instead of writing outside cacheDir', async () => {
    const savedPath = await cacheCoverImage(cacheDir, '../../evil', `${baseUrl}/cover.jpg`)
    expect(savedPath).not.toBeNull()
    expect(savedPath!.startsWith(cacheDir)).toBe(true)
    expect(savedPath).not.toContain('evil')
  })
})
