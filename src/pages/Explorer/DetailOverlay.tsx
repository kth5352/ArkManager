import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { useThumbnail } from '../../services/thumbnailService'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface DetailOverlayProps {
  game: ScannedEntry | null
  onClose: () => void
}

export function DetailOverlay({ game, onClose }: DetailOverlayProps) {
  const { data: thumbnail } = useThumbnail(game?.path ?? '', game?.kind ?? 'file')

  return (
    <Dialog open={game !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {game && game.code && (
          <>
            <DialogHeader>
              <DialogTitle>{game.name}</DialogTitle>
            </DialogHeader>
            <div className="flex gap-4">
              <div className="h-40 w-32 shrink-0 overflow-hidden rounded bg-muted">
                {thumbnail && (
                  <img
                    src={thumbnail}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <p>작품번호: {game.code.value}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => console.log('open dlsite page', game.code?.value)}>
                DLsite 열기
              </Button>
              <Button variant="secondary" onClick={() => console.log('open folder', game.path)}>
                폴더 열기
              </Button>
              <Button variant="secondary" onClick={() => console.log('launch', game.path)}>
                실행
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
