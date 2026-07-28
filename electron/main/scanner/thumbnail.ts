import { readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'] as const

const PREFERRED_NAMES = ['cover', 'folder', 'thumbnail']

function isImageFile(fileName: string): boolean {
  return IMAGE_EXTENSIONS.includes(
    extname(fileName).toLowerCase() as (typeof IMAGE_EXTENSIONS)[number]
  )
}

export async function findThumbnailPath(folderPath: string): Promise<string | null> {
  let entries: string[]
  try {
    entries = await readdir(folderPath)
  } catch {
    return null
  }

  const images = entries.filter(isImageFile).sort((a, b) => a.localeCompare(b))
  if (images.length === 0) return null

  for (const preferredName of PREFERRED_NAMES) {
    const match = images.find((name) => name.toLowerCase().startsWith(preferredName))
    if (match) return join(folderPath, match)
  }

  return join(folderPath, images[0])
}
