import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { UnsupportedImageError, openRasterImage } from './rasterImage'

describe('openRasterImage', () => {
  it('accepts png/jpeg/webp', async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#f00' } })
      .png()
      .toBuffer()
    const jpg = await sharp(png).jpeg().toBuffer()
    const webp = await sharp(png).webp().toBuffer()
    for (const buf of [png, jpg, webp]) {
      const out = await (await openRasterImage(buf)).webp().toBuffer()
      expect(out.length).toBeGreaterThan(0)
    }
  })

  it('rejects SVG (librsvg), empty and garbage input', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>')
    await expect(openRasterImage(svg)).rejects.toBeInstanceOf(UnsupportedImageError)
    await expect(openRasterImage(Buffer.alloc(0))).rejects.toBeInstanceOf(UnsupportedImageError)
    await expect(openRasterImage(Buffer.from('not an image at all'))).rejects.toBeInstanceOf(UnsupportedImageError)
  })

  it('rejects a decompression bomb by pixel count', async () => {
    const big = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: '#000' } })
      .png({ compressionLevel: 9 })
      .toBuffer()
    await expect(openRasterImage(big)).rejects.toBeInstanceOf(UnsupportedImageError)
  }, 30000)
})
