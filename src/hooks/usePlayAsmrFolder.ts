import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { isMediaFile } from '../../shared/isMediaFile'
import { useMediaPlayerStore } from '../stores/mediaPlayerStore'
import { MEDIA_FOLDER_QUERY_KEY } from '../services/settingsService'
import { planAsmrFolderBrowse } from '../lib/mediaBrowseRoot'

// Shared by GameEntryContextMenu, DetailSidebar, and DetailOverlay - the
// three places a user can trigger "재생" on an ASMR-classified folder from.
// Points the Media tab at the folder, auto-plays if files exist directly at
// its root (no auto-play if only subfolders exist - the user navigates via
// the Media tab's own folder browser in that case), then navigates to
// /media either way.
//
// This used to overwrite the saved 'media-folder' setting with the played
// folder, silently replacing the folder the user had chosen. It now leaves
// the setting alone: a work inside the saved folder is just browsed to, and
// one outside it becomes a session-only temporary root (see
// planAsmrFolderBrowse / useMediaBrowseRoot). Playback itself is allowed
// either way, since the folder is inside a registered library.
export function usePlayAsmrFolder() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return async (folderPath: string): Promise<void> => {
    const savedMediaFolder =
      queryClient.getQueryData<string | null>(MEDIA_FOLDER_QUERY_KEY) ??
      (await window.api.settings.getMediaFolder()) ??
      null
    const plan = planAsmrFolderBrowse(folderPath, savedMediaFolder)
    const store = useMediaPlayerStore.getState()
    store.setTemporaryMediaRoot(plan.temporaryRoot)
    store.resetMediaBrowseRoot(plan.root)
    if (plan.browseTo !== plan.root) store.navigateMediaBrowseTo(plan.browseTo)

    const shallowEntries = await window.api.scanner.scanShallow(folderPath)
    const directFiles = shallowEntries
      .filter((e) => e.kind === 'file' && isMediaFile(e.name))
      .map((e) => ({ path: e.path, name: e.name }))
    // 자동재생 규칙: 루트에 파일이 직접 있으면 즉시 재생, 하위 폴더뿐이면
    // 탐색만 (MediaPage로 이동해서 사용자가 직접 고르게 함).
    if (directFiles.length > 0) {
      useMediaPlayerStore.getState().playNow(directFiles[0], directFiles)
    }
    // resetMediaBrowseRoot is deliberately selection-agnostic (see its own
    // comment in mediaPlayerStore.ts), and MediaPage remounts fresh on every
    // /media navigation. ASMR folder playback SHOULD land on the folder
    // browser rather than a stale PlaylistDetailView, so clear it here.
    useMediaPlayerStore.getState().closePlaylistDetail()
    navigate({ to: '/media' })
  }
}
