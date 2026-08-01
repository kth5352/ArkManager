import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useDeleteEntries } from '../../services/fileOpsService'
import { useTranslation } from '../../i18n/useTranslation'
import type { DeleteResultDto } from '../../../shared/types/ipc'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface DeleteConfirmDialogProps {
  targets: ScannedEntry[]
  onClose: () => void
}

export function DeleteConfirmDialog({ targets, onClose }: DeleteConfirmDialogProps) {
  const { t } = useTranslation()
  const [results, setResults] = useState<DeleteResultDto[] | null>(null)
  const deleteEntries = useDeleteEntries()

  const handleConfirm = (): void => {
    deleteEntries.mutate(
      targets.map((target) => target.path),
      { onSuccess: setResults }
    )
  }

  return (
    <Dialog open={targets.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('fileOps.deleteCount', { count: targets.length })}</DialogTitle>
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
            <p className="text-xs text-muted-foreground">{t('fileOps.trashHint')}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={deleteEntries.isPending}
              >
                {deleteEntries.isPending ? t('fileOps.movingEllipsis') : t('fileOps.moveToTrash')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
