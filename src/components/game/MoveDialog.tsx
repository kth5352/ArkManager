import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useMoveEntries, usePickMoveDestination } from '../../services/fileOpsService'
import { useTranslation } from '../../i18n/useTranslation'
import type { MoveResultDto } from '../../../shared/types/ipc'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface MoveDialogProps {
  targets: ScannedEntry[]
  onClose: () => void
}

// A manually-linked code and any favorite/rating/memo/playtime/custom cover
// for a code-less entry both move with it automatically (see
// EXPLORER_MOVE_ENTRIES's rekeyPathCodeOverride/rekeyPath) - nothing extra
// for the user to do here beyond picking the destination.
export function MoveDialog({ targets, onClose }: MoveDialogProps) {
  const { t } = useTranslation()
  const [destDir, setDestDir] = useState<string | null>(null)
  const [results, setResults] = useState<MoveResultDto[] | null>(null)
  const pickDestination = usePickMoveDestination()
  const moveEntries = useMoveEntries()

  const handlePickDestination = async (): Promise<void> => {
    const dir = await pickDestination.mutateAsync()
    if (dir) setDestDir(dir)
  }

  const handleMove = (): void => {
    if (!destDir) return
    moveEntries.mutate(
      { paths: targets.map((target) => target.path), destDir },
      { onSuccess: setResults }
    )
  }

  return (
    <Dialog open={targets.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('fileOps.moveCount', { count: targets.length })}</DialogTitle>
        </DialogHeader>

        {results ? (
          <div className="flex flex-col gap-2">
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-xs">
              {results.map((r) => (
                <li
                  key={r.path}
                  className={r.success ? 'text-muted-foreground' : 'text-destructive'}
                >
                  {r.success ? t('fileOps.done') : t('fileOps.failed', { error: r.error ?? '' })} -{' '}
                  {targets.find((target) => target.path === r.path)?.name ?? r.path}
                </li>
              ))}
            </ul>
            <Button onClick={onClose}>{t('common.close')}</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
              {targets.map((target) => (
                <li key={target.path} className="truncate text-muted-foreground">
                  {target.name}
                </li>
              ))}
            </ul>
            <Button variant="secondary" onClick={handlePickDestination}>
              {t('fileOps.pickDestination')}
            </Button>
            {destDir && (
              <p className="truncate text-xs text-muted-foreground">
                {t('fileOps.destination', { dir: destDir })}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleMove} disabled={!destDir || moveEntries.isPending}>
                {moveEntries.isPending ? t('fileOps.movingEllipsis') : t('fileOps.move')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
