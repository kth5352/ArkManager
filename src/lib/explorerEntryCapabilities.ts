import { isArchiveFile } from '../../shared/isArchiveFile'
import { isMediaFile } from '../../shared/isMediaFile'

type EntryLike = {
  name: string
  kind: 'file' | 'folder'
}

function isExecutableFile(name: string): boolean {
  return name.toLowerCase().endsWith('.exe')
}

export interface ExplorerEntryCapabilities {
  canManageGameData: boolean
  canDirectLaunchFile: boolean
  canPlayMedia: boolean
}

export function getExplorerEntryCapabilities(entry: EntryLike): ExplorerEntryCapabilities {
  const isFile = entry.kind === 'file'
  return {
    canManageGameData: entry.kind === 'folder' || (isFile && isArchiveFile(entry.name)),
    canDirectLaunchFile: isFile && isExecutableFile(entry.name),
    canPlayMedia: isFile && isMediaFile(entry.name),
  }
}
