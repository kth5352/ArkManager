import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { ipcMain } from 'electron'
import {
  GetThumbnailRequestSchema,
  IPC_CHANNELS,
  ScanRecursiveRequestSchema,
  ScanShallowRequestSchema,
} from '../../../shared/types/ipc'
import { scanFolderShallow, scanLibraryRecursive } from '../scanner/folderScanner'
import { findThumbnailPath } from '../scanner/thumbnail'
import { listPathCodeOverrides } from '../database/pathCodeOverridesRepository'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { AppDatabase } from '../database/client'

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

export async function encodeThumbnail(imagePath: string): Promise<string> {
  const buffer = await readFile(imagePath)
  const mimeType = MIME_TYPES[extname(imagePath).toLowerCase()] ?? 'application/octet-stream'
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export function registerScannerHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SCANNER_SCAN_RECURSIVE, async (_event, payload: unknown) => {
    const { libraryPaths } = ScanRecursiveRequestSchema.parse(payload)
    const overrides = listPathCodeOverrides(db)
    const results = await Promise.all(
      libraryPaths.map(async (libraryPath): Promise<ScannedEntry[]> => {
        try {
          return await scanLibraryRecursive(libraryPath, overrides)
        } catch {
          // Library path no longer exists (deleted/unmounted drive) - skip it,
          // the rest of the registered libraries still scan normally.
          return []
        }
      })
    )
    return results.flat()
  })

  ipcMain.handle(IPC_CHANNELS.SCANNER_SCAN_SHALLOW, async (_event, payload: unknown) => {
    const { dirPath } = ScanShallowRequestSchema.parse(payload)
    const overrides = listPathCodeOverrides(db)
    return scanFolderShallow(dirPath, overrides)
  })

  ipcMain.handle(IPC_CHANNELS.SCANNER_GET_THUMBNAIL, async (_event, payload: unknown) => {
    const { entryPath } = GetThumbnailRequestSchema.parse(payload)

    const stats = await stat(entryPath).catch(() => null)
    if (!stats || !stats.isDirectory()) return null

    const thumbnailPath = await findThumbnailPath(entryPath)
    if (!thumbnailPath) return null

    return encodeThumbnail(thumbnailPath)
  })
}
