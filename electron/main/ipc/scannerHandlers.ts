import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  ScanRecursiveRequestSchema,
  ScanShallowRequestSchema,
} from '../../../shared/types/ipc'
import { scanFolderShallow, scanLibraryRecursive } from '../scanner/folderScanner'
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

// Sending an IPC message per scanned item would flood the renderer on a
// large library (thousands of stat() calls a second) - only push a progress
// update every PROGRESS_INTERVAL items, plus one final update with the true
// end count so the UI never lags behind by up to PROGRESS_INTERVAL - 1.
const PROGRESS_INTERVAL = 25

export function registerScannerHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SCANNER_SCAN_RECURSIVE, async (event, payload: unknown) => {
    const { libraryPaths } = ScanRecursiveRequestSchema.parse(payload)
    const overrides = listPathCodeOverrides(db)

    let scanned = 0
    const onProgress = (): void => {
      scanned += 1
      if (scanned % PROGRESS_INTERVAL === 0) {
        event.sender.send(IPC_CHANNELS.SCANNER_SCAN_PROGRESS, { scanned })
      }
    }

    // A single-path request is Explorer's "search from here down" shape
    // (see useFolderScanRecursive in src/services/scannerService.ts, which
    // always calls scanRecursive([path])) - the renderer wants to know if
    // THIS scan failed (folder deleted/unmounted mid-search) rather than
    // seeing a result indistinguishable from "no matches", so let the
    // failure propagate here instead of being swallowed below.
    if (libraryPaths.length === 1) {
      const result = await scanLibraryRecursive(libraryPaths[0], overrides, onProgress)
      event.sender.send(IPC_CHANNELS.SCANNER_SCAN_PROGRESS, { scanned })
      return result
    }

    const results = await Promise.all(
      libraryPaths.map(async (libraryPath): Promise<ScannedEntry[]> => {
        try {
          return await scanLibraryRecursive(libraryPath, overrides, onProgress)
        } catch {
          // Library path no longer exists (deleted/unmounted drive) - skip it,
          // the rest of the registered libraries still scan normally.
          return []
        }
      })
    )
    event.sender.send(IPC_CHANNELS.SCANNER_SCAN_PROGRESS, { scanned })
    return results.flat()
  })

  ipcMain.handle(IPC_CHANNELS.SCANNER_SCAN_SHALLOW, async (_event, payload: unknown) => {
    const { dirPath } = ScanShallowRequestSchema.parse(payload)
    const overrides = listPathCodeOverrides(db)
    return scanFolderShallow(dirPath, overrides)
  })
}
