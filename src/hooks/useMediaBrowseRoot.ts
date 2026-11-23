import { useMediaFolderQuery } from '../services/settingsService'
import { useMediaPlayerStore } from '../stores/mediaPlayerStore'

// The Media tab's effective browse root: a session-only temporary root (set
// when an ASMR work outside the saved media folder is played) or else the
// saved 'media-folder' setting. Shared by MediaPage and FolderTreeTab so the
// page and the sidebar tree always agree on the root.
export function useMediaBrowseRoot(): {
  root: string | null
  savedFolder: string | null
  isTemporary: boolean
  isLoading: boolean
} {
  const { data: savedFolder = null, isLoading } = useMediaFolderQuery()
  const temporaryRoot = useMediaPlayerStore((s) => s.temporaryMediaRoot)
  return {
    root: temporaryRoot ?? savedFolder,
    savedFolder,
    isTemporary: temporaryRoot !== null,
    isLoading: temporaryRoot === null && isLoading,
  }
}
