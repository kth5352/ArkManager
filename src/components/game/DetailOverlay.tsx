import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { RatingMemoDialog } from './RatingMemoDialog'
import { LaunchConfigDialog } from './LaunchConfigDialog'
import { LinkCodeDialog } from './LinkCodeDialog'
import { UnlinkCodeDialog } from './UnlinkCodeDialog'
import { GameThumbnail } from './GameThumbnail'
import { useOpenExternal } from '../../services/shellService'
import { useLaunchGame } from '../../services/launchService'
import { isNoLaunchConfigError } from '../../../shared/launchErrors'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface DetailOverlayProps {
  game: ScannedEntry | null
  onClose: () => void
}

export function DetailOverlay({ game, onClose }: DetailOverlayProps) {
  const openExternal = useOpenExternal()
  const launchGame = useLaunchGame()
  const [editingRating, setEditingRating] = useState(false)
  const [configuringLaunch, setConfiguringLaunch] = useState(false)
  const [linkingCode, setLinkingCode] = useState(false)
  const [unlinkingCode, setUnlinkingCode] = useState(false)

  const handleLaunch = useCallback(
    (entry: ScannedEntry): void => {
      launchGame.mutate(entry, {
        onError: (error) => {
          if (isNoLaunchConfigError(error)) setConfiguringLaunch(true)
        },
      })
    },
    [launchGame]
  )

  useEffect(() => {
    if (!game) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key === 'Enter' && game.kind === 'folder') {
        const target = event.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return // 메모 입력 중엔 무시
        event.preventDefault()
        handleLaunch(game)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [game, handleLaunch])

  return (
    <Dialog open={game !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {game && (
          <>
            <DialogHeader>
              <DialogTitle>{game.name}</DialogTitle>
            </DialogHeader>
            <div className="flex gap-4">
              <div className="h-40 w-32 shrink-0 overflow-hidden rounded bg-muted">
                <GameThumbnail entry={game} />
              </div>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                {game.code ? (
                  <button
                    className="text-left underline-offset-2 hover:underline"
                    onClick={() => game.code && openExternal.mutate(game.code)}
                  >
                    작품번호: {game.code.value}
                  </button>
                ) : (
                  <p>코드없음</p>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {game.code && (
                <Button onClick={() => game.code && openExternal.mutate(game.code)}>
                  DLsite 열기
                </Button>
              )}
              <Button variant="secondary" onClick={() => console.log('open folder', game.path)}>
                폴더 열기
              </Button>
              {game.kind === 'folder' && (
                <Button variant="secondary" onClick={() => handleLaunch(game)}>
                  실행
                </Button>
              )}
              <Button variant="secondary" onClick={() => setConfiguringLaunch(true)}>
                실행 설정
              </Button>
              <Button variant="secondary" onClick={() => setEditingRating(true)}>
                평점/메모
              </Button>
              {!game.code && (
                <Button variant="secondary" onClick={() => setLinkingCode(true)}>
                  코드 연동
                </Button>
              )}
              {game.code && game.codeSource === 'override' && (
                <Button variant="secondary" onClick={() => setUnlinkingCode(true)}>
                  연동 해제
                </Button>
              )}
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
      <LinkCodeDialog
        key={linkingCode && game ? game.path : 'closed'}
        entry={linkingCode ? game : null}
        onClose={() => setLinkingCode(false)}
      />
      <UnlinkCodeDialog
        key={unlinkingCode && game ? game.path : 'closed'}
        entry={unlinkingCode ? game : null}
        onClose={() => setUnlinkingCode(false)}
      />
    </Dialog>
  )
}
