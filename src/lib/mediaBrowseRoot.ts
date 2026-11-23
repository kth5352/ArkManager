function comparable(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function isSameOrInsideFolder(path: string, folder: string): boolean {
  const p = comparable(path)
  const f = comparable(folder)
  return p === f || p.startsWith(`${f}/`)
}

export interface AsmrFolderBrowsePlan {
  /** Session-only Media-tab root; null = use the saved media folder. */
  temporaryRoot: string | null
  /** Root the Media tab should browse from. */
  root: string
  /** Folder to show first. */
  browseTo: string
}

// Playing an ASMR/voice work folder must never change the saved media
// folder (a user setting). If the work already lives under it, just browse
// there; otherwise browse the work as a temporary, unsaved root.
export function planAsmrFolderBrowse(
  folderPath: string,
  savedMediaFolder: string | null
): AsmrFolderBrowsePlan {
  if (savedMediaFolder && isSameOrInsideFolder(folderPath, savedMediaFolder)) {
    return { temporaryRoot: null, root: savedMediaFolder, browseTo: folderPath }
  }
  return { temporaryRoot: folderPath, root: folderPath, browseTo: folderPath }
}
