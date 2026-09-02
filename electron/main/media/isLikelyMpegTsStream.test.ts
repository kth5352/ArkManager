import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isLikelyMpegTsStream } from './isLikelyMpegTsStream'

function buildFakeMpegTsBuffer(packetCount: number): Buffer {
  const buffer = Buffer.alloc(188 * packetCount)
  for (let i = 0; i < packetCount; i++) {
    buffer[i * 188] = 0x47
  }
  return buffer
}

describe('isLikelyMpegTsStream', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-mpegts-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('recognizes a file with repeating MPEG-TS sync bytes', async () => {
    const filePath = join(dir, 'stream.mp4')
    await writeFile(filePath, buildFakeMpegTsBuffer(4))

    await expect(isLikelyMpegTsStream(filePath)).resolves.toBe(true)
  })

  it('rejects a genuine mp4-like file that does not start with the TS sync byte', async () => {
    const filePath = join(dir, 'real.mp4')
    // A real ISO-BMFF file's first bytes are a box size + 'ftyp', not 0x47.
    const buffer = Buffer.alloc(188 * 4)
    buffer.write('ftypisom', 4)
    await writeFile(filePath, buffer)

    await expect(isLikelyMpegTsStream(filePath)).resolves.toBe(false)
  })

  it('rejects a file that only has the sync byte once, not repeating at the 188-byte stride', async () => {
    const filePath = join(dir, 'coincidence.mp4')
    const buffer = Buffer.alloc(188 * 4)
    buffer[0] = 0x47
    // Byte 188 deliberately NOT 0x47 - a single leading 0x47 (ASCII 'G')
    // must not be enough on its own to look like MPEG-TS.
    await writeFile(filePath, buffer)

    await expect(isLikelyMpegTsStream(filePath)).resolves.toBe(false)
  })

  it('rejects a file shorter than the probe length', async () => {
    const filePath = join(dir, 'short.mp4')
    await writeFile(filePath, Buffer.from([0x47, 0x47, 0x47]))

    await expect(isLikelyMpegTsStream(filePath)).resolves.toBe(false)
  })

  it('rejects an empty file', async () => {
    const filePath = join(dir, 'empty.mp4')
    await writeFile(filePath, Buffer.alloc(0))

    await expect(isLikelyMpegTsStream(filePath)).resolves.toBe(false)
  })

  it('returns false for a file that does not exist, instead of throwing', async () => {
    await expect(isLikelyMpegTsStream(join(dir, 'missing.mp4'))).resolves.toBe(false)
  })

  it('returns false for a directory path, instead of throwing EISDIR', async () => {
    const subDir = join(dir, 'subfolder')
    await mkdir(subDir)

    await expect(isLikelyMpegTsStream(subDir)).resolves.toBe(false)
  })
})
