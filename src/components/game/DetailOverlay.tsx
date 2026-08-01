import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { RatingMemoDialog } from './RatingMemoDialog'
import { LaunchConfigDialog } from './LaunchConfigDialog'
import { LinkCodeDialog } from './LinkCodeDialog'
import { UnlinkCodeDialog } from './UnlinkCodeDialog'
import { GameThumbnail } from './GameThumbnail'
import { useOpenExternal, useShowItemInFolder } from '../../services/shellService'
import { useLaunchGame } from '../../services/launchService'
import { useCrawlGameMetadata, useGameMetadata } from '../../services/metadataService'
import { IndeterminateProgressBar } from '../ui/progress-bar'
import { useTranslation } from '../../i18n/useTranslation'
import { isNoLaunchConfigError } from '../../../shared/launchErrors'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface DetailOverlayProps {
  game: ScannedEntry | null
  onClose: () => void
}

export function DetailOverlay({ game, onClose }: DetailOverlayProps) {
  const { t } = useTranslation()
  const openExternal = useOpenExternal()
  const showItemInFolder = useShowItemInFolder()
  const launchGame = useLaunchGame()
  const crawlMetadata = useCrawlGameMetadata()
  const { data: metadata } = useGameMetadata(game?.code ?? null)
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
                {metadata?.title && metadata.title !== game.name && <p>{metadata.title}</p>}
                {game.code ? (
                  <button
                    className="text-left underline-offset-2 hover:underline"
                    onClick={() => game.code && openExternal.mutate(game.code)}
                  >
                    {t('game.codeNumber', { code: game.code.value })}
                  </button>
                ) : (
                  <p>{t('game.noCode')}</p>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {game.code && (
                <Button onClick={() => game.code && openExternal.mutate(game.code)}>
                  {t('game.openDlsite')}
                </Button>
              )}
              {game.code && (
                <Button
                  variant="secondary"
                  onClick={() => game.code && crawlMetadata.mutate(game.code)}
                  disabled={crawlMetadata.isPending}
                >
                  {t('game.refreshMetadata')}
                </Button>
              )}
              <Button variant="secondary" onClick={() => showItemInFolder.mutate(game.path)}>
                {t('game.openFolder')}
              </Button>
              {game.kind === 'folder' && (
                <Button variant="secondary" onClick={() => handleLaunch(game)}>
                  {t('game.launch')}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setConfiguringLaunch(true)}>
                {t('launchConfig.title')}
              </Button>
              <Button variant="secondary" onClick={() => setEditingRating(true)}>
                {t('game.ratingMemo')}
              </Button>
              {!game.code && (
                <Button variant="secondary" onClick={() => setLinkingCode(true)}>
                  {t('codeLink.dialogTitle')}
                </Button>
              )}
              {game.code && game.codeSource === 'override' && (
                <Button variant="secondary" onClick={() => setUnlinkingCode(true)}>
                  {t('codeLink.unlink')}
                </Button>
              )}
            </div>
            {crawlMetadata.isPending && (
              <div className="mt-3 flex flex-col gap-1">
                <IndeterminateProgressBar />
                <p className="text-xs text-muted-foreground">{t('game.fetchingMetadata')}</p>
              </div>
            )}
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
