import { useNavigate } from '@tanstack/react-router'
import { isMediaFile } from '../../shared/isMediaFile'
import { useMediaPlayerStore } from '../stores/mediaPlayerStore'
import { useSetMediaFolderMutation } from '../services/settingsService'

// Shared by GameEntryContextMenu, DetailSidebar, and DetailOverlay - the
// three places a user can trigger "재생" on an ASMR-classified folder from.
// Sets the folder as the Media tab's anchor, auto-plays if files exist
// directly at its root (no auto-play if only subfolders exist - the user
// navigates via the Media tab's own folder browser in that case), then
// navigates to /media either way.
export function usePlayAsmrFolder() {
  const navigate = useNavigate()
  const setMediaFolder = useSetMediaFolderMutation()

  return async (folderPath: string): Promise<void> => {
    await setMediaFolder.mutateAsync(folderPath)
    const shallowEntries = await window.api.scanner.scanShallow(folderPath)
    const directFiles = shallowEntries
      .filter((e) => e.kind === 'file' && isMediaFile(e.name))
      .map((e) => ({ path: e.path, name: e.name }))
    // 자동재생 규칙: 루트에 파일이 직접 있으면 즉시 재생, 하위 폴더뿐이면
    // 탐색만 (MediaPage로 이동해서 사용자가 직접 고르게 함).
    if (directFiles.length > 0) {
      useMediaPlayerStore.getState().playNow(directFiles[0], directFiles)
    }
    // MediaPage의 useEffect가 useMediaFolderQuery 변경을 감지해
    // resetMediaBrowseRoot를 자동 호출하므로, 여기서 라우팅만 하면 된다.
    navigate({ to: '/media' })
  }
}
