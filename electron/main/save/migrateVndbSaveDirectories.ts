import type { Dirent } from 'node:fs'
import { cp, lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { legacyVndbCodeToCanonical } from '../database/migrateVndbCodePrefixes'

export async function migrateVndbSaveDirectories(savesRoot: string): Promise<void> {
  let entries: Dirent<string>[]
  try {
    entries = await readdir(savesRoot, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const canonicalName = legacyVndbCodeToCanonical(entry.name)
    if (!canonicalName) continue

    const source = join(savesRoot, entry.name)
    const destination = join(savesRoot, canonicalName)
    try {
      await lstat(destination)
      continue
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    await cp(source, destination, { recursive: true, force: false, errorOnExist: true })
  }
}
