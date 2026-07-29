import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { RatingMemoDialog } from '../../components/game/RatingMemoDialog'
import { LaunchConfigDialog } from '../../components/game/LaunchConfigDialog'
import { useThumbnail } from '../../services/thumbnailService'
import { useOpenExternal } from '../../services/shellService'
import { useLaunchGame } from '../../services/launchService'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface DetailOverlayProps {
  game: ScannedEntry | null
  onClose: () => void
}

export function DetailOverlay({ game, onClose }: DetailOverlayProps) {
  const { data: thumbnail } = useThumbnail(game?.path ?? '', game?.kind ?? 'file')
  const openExternal = useOpenExternal()
  const launchGame = useLaunchGame()
  const [editingRating, setEditingRating] = useState(false)
  const [configuringLaunch, setConfiguringLaunch] = useState(false)

  useEffect(() => {
    if (!game) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key === 'Enter' && game.kind === 'folder') {
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return // 메모 입력 중엔 무시
        event.preventDefault()
        launchGame.mutate(game)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [game, launchGame])

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
                <button
                  className="text-left underline-offset-2 hover:underline"
                  onClick={() => game.code && openExternal.mutate(game.code)}
                >
                  작품번호: {game.code.value}
                </button>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => game.code && openExternal.mutate(game.code)}>
                DLsite 열기
              </Button>
              <Button variant="secondary" onClick={() => console.log('open folder', game.path)}>
                폴더 열기
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (game.kind === 'folder') launchGame.mutate(game)
                }}
              >
                실행
              </Button>
              <Button variant="secondary" onClick={() => setConfiguringLaunch(true)}>
                실행 설정
              </Button>
              <Button variant="secondary" onClick={() => setEditingRating(true)}>
                평점/메모
              </Button>
            </div>
          </>
        )}
      </DialogContent>
      <RatingMemoDialog
        key={editingRating && game ? (game.code ? game.code.value : game.path) : 'closed'}
        entry={editingRating ? game : null}
        onClose={() => setEditingRating(false)}
      />
      <LaunchConfigDialog
        key={configuringLaunch && game ? (game.code ? game.code.value : game.path) : 'closed'}
        entry={configuringLaunch ? game : null}
        onClose={() => setConfiguringLaunch(false)}
      />
    </Dialog>
  )
}
