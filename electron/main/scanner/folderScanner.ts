import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { GameEntry, ScannedEntry } from '../../../shared/types/scanner'
import { extractCode } from './codeRecognition'

async function toScannedEntry(parentPath: string, name: string): Promise<ScannedEntry> {
  const path = join(parentPath, name)
  const stats = await stat(path)
  return {
    name,
    path,
    kind: stats.isDirectory() ? 'folder' : 'file',
    mtimeMs: stats.mtimeMs,
    code: extractCode(name),
  }
}

// Explorer: lists dirPath's direct children only, exactly like a real file
// explorer - every entry is shown regardless of whether it's a recognized
// game. Never descends into subfolders (thumbnail lookup is a separate,
// lazy step - see scanner/thumbnail.ts and the get-thumbnail IPC handler).
export async function scanFolderShallow(dirPath: string): Promise<ScannedEntry[]> {
  const names = await readdir(dirPath)
  return Promise.all(names.map((name) => toScannedEntry(dirPath, name)))
}

// Gallery/List: recursively walks the entire library tree and returns only
// entries with a recognized RJ/VJ/ST code, flattened. A folder that is
// itself a recognized game (e.g. an unzipped "RJ01111/" containing cover.jpg
// and data.pak) is treated as a leaf - its contents are not walked or
// listed separately, since they're not games themselves. The return type
// guarantees `code` is non-null (see GameEntry) since non-matching entries
// are never included.
export async function scanLibraryRecursive(libraryPath: string): Promise<GameEntry[]> {
  const names = await readdir(libraryPath)
  const results: GameEntry[] = []

  for (const name of names) {
    const entry = await toScannedEntry(libraryPath, name)

    if (entry.code) {
      results.push({ ...entry, code: entry.code })
      continue
    }

    if (entry.kind === 'folder') {
      const nested = await scanLibraryRecursive(entry.path)
      results.push(...nested)
    }
  }

  return results
}
