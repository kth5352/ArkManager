import sharp, { type Sharp } from 'sharp'

// Untrusted image bytes (downloaded cover art, user-picked files, ffmpeg
// output of a hostile media file) are decoded by native libraries (libvips
// with libheif / librsvg / ...), which have had memory-safety CVEs. Reduce
// that attack surface: only common raster formats are accepted - never SVG,
// HEIF/AVIF, PDF, TIFF, ... - and decoding is bounded in pixels and size.

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 50_000_000
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif'])

export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedImageError'
  }
}

/** Validates the buffer and returns a sharp pipeline for it. Throws UnsupportedImageError. */
export async function openRasterImage(buffer: Buffer): Promise<Sharp> {
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new UnsupportedImageError('Image size is out of range')
  }
  const options = { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' as const }
  let format: string | undefined
  try {
    format = (await sharp(buffer, options).metadata()).format
  } catch {
    throw new UnsupportedImageError('Image could not be decoded')
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw new UnsupportedImageError(`Image format "${format ?? 'unknown'}" is not allowed`)
  }
  return sharp(buffer, options)
}
