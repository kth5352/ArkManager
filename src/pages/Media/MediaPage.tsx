import { useState } from 'react'
import { Play, Plus } from 'lucide-react'
import { usePickLibraryFolder } from '../../services/librariesService'
import { useFolderScanRecursive } from '../../services/scannerService'
import { useMediaPlayerStore, type MediaTrack } from '../../stores/mediaPlayerStore'
import { isMediaFile } from '../../../shared/isMediaFile'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'

// A dedicated browse-and-queue page, separate from Explorer's per-folder
// "click to play" entry point (see FolderView.tsx) - this one is for
// picking any folder (not necessarily a registered library) and building up
// a playlist from everything media-shaped found in it, recursively.
export function MediaPage() {
  const [folder, setFolder] = useState<string | null>(null)
  const pickFolder = usePickLibraryFolder()
  const { data: entries, isLoading } = useFolderScanRecursive(folder ?? '', {
    enabled: folder !== null,
  })
  const playNow = useMediaPlayerStore((s) => s.playNow)
  const addToPlaylist = useMediaPlayerStore((s) => s.addToPlaylist)

  const tracks: MediaTrack[] = (entries ?? [])
    .filter((e) => e.kind === 'file' && isMediaFile(e.name))
    .map((e) => ({ path: e.path, name: e.name }))

  const handlePickFolder = async (): Promise<void> => {
    const dir = await pickFolder.mutateAsync()
    if (dir) setFolder(dir)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button size="sm" variant="secondary" onClick={handlePickFolder}>
          폴더 선택
        </Button>
        {folder && <span className="truncate text-xs text-muted-foreground">{folder}</span>}
        {tracks.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => addToPlaylist(tracks)}
          >
            전체 재생목록에 추가
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {folder === null ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            폴더를 선택하면 동영상/음성 파일을 찾아 보여줍니다.
          </div>
        ) : isLoading ? (
          <div className="flex flex-col gap-1 p-4">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            이 폴더에서 동영상/음성 파일을 찾지 못했습니다.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tracks.map((track) => (
              <li
                key={track.path}
                className="flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => playNow(track, tracks)}
                >
                  <Play className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{track.name}</span>
                </button>
                <button
                  aria-label="재생목록에 추가"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => addToPlaylist([track])}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
