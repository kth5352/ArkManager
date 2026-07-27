import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import type { MockFolderEntry } from './mockFolderEntries'

interface DetailOverlayProps {
  game: MockFolderEntry | null
  onClose: () => void
}

export function DetailOverlay({ game, onClose }: DetailOverlayProps) {
  return (
    <Dialog open={game !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {game && (
          <>
            <DialogHeader>
              <DialogTitle>{game.title}</DialogTitle>
            </DialogHeader>
            <div className="flex gap-4">
              <div className="h-40 w-32 shrink-0 rounded bg-muted" />
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <p>제작사: 샘플 서클</p>
                <p>발매일: 2026-01-01</p>
                <p>작품번호: {game.rjCode}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => console.log('open dlsite page', game.rjCode)}>
                DLsite 열기
              </Button>
              <Button variant="secondary" onClick={() => console.log('open folder', game.id)}>
                폴더 열기
              </Button>
              <Button variant="secondary" onClick={() => console.log('launch', game.id)}>
                실행
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
