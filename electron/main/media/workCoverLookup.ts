import { access } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import type { AppDatabase } from '../database/client'
import { normalizeLibraryPath } from '../database/librariesRepository'
import { getPathCodeOverride } from '../database/pathCodeOverridesRepository'
import { getGameUserData } from '../database/gameUserDataRepository'
import { getGameMetadata } from '../database/gameMetadataRepository'
import { resolveGameEntryKey } from '../ipc/resolveGameEntryKey'
import { extractCode } from '../scanner/codeRecognition'
import { isPathWithinAnyLibrary } from '../thumbnailProtocol'
import { computeMediaAllowedRoots } from './mediaTrustBoundary'

export interface WorkCoverLookupDeps {
  allowedRoots: () => string[]
  getOverrideCode: (normalizedFolder: string) => string | null
  getCustomCover: (key: string) => string | null
  getCrawledCover: (code: string) => string | null
  fileExists: (p: string) => Promise<boolean>
}

// Finds a work's cover for a media file by walking from its folder up to (and
// including) the outermost allowed root that contains it. Only the walk is
// bounded by roots - a file trusted solely by exact path (playlist/liked
// track) lies in no root, so it returns null before any DB lookup.
export function createWorkCoverLookup(
  deps: WorkCoverLookupDeps
): (filePath: string) => Promise<string | null> {
  return async (filePath) => {
    const containing = deps
      .allowedRoots()
      .filter((root) => isPathWithinAnyLibrary(filePath, [root]))
    if (containing.length === 0) return null
    const outermost = containing.reduce((best, root) =>
      normalizeLibraryPath(resolve(root)).length < normalizeLibraryPath(resolve(best)).length
        ? root
        : best
    )

    let folder = dirname(resolve(filePath))
    for (;;) {
      const code =
        deps.getOverrideCode(normalizeLibraryPath(folder)) ??
        extractCode(basename(folder))?.value ??
        null
      const { key } = resolveGameEntryKey({ code: code ? { value: code } : null, path: folder })
      const candidates = [deps.getCustomCover(key), code ? deps.getCrawledCover(code) : null]
      for (const candidate of candidates) {
        if (candidate && (await deps.fileExists(candidate))) return candidate
      }

      // The root folder itself is the last folder checked - never go above it.
      if (isPathWithinAnyLibrary(outermost, [folder])) return null
      const parent = dirname(folder)
      if (parent === folder) return null
      folder = parent
    }
  }
}

async function defaultFileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

export function workCoverLookupFromDb(
  db: AppDatabase
): (filePath: string) => Promise<string | null> {
  return createWorkCoverLookup({
    allowedRoots: () => computeMediaAllowedRoots(db),
    getOverrideCode: (folder) => getPathCodeOverride(db, folder),
    getCustomCover: (key) => getGameUserData(db, key)?.customCoverPath ?? null,
    getCrawledCover: (code) => getGameMetadata(db, code)?.coverImagePath ?? null,
    fileExists: defaultFileExists,
  })
}
