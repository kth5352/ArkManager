import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useUnlinkCode } from '../../services/gameUserDataService'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface UnlinkCodeDialogProps {
  entry: ScannedEntry | null
  onClose: () => void
}

export function UnlinkCodeDialog({ entry, onClose }: UnlinkCodeDialogProps) {
  const { t } = useTranslation()
  const unlinkCode = useUnlinkCode()

  const handleConfirm = (): void => {
    if (!entry) return
    unlinkCode.mutate({ path: entry.path }, { onSuccess: onClose })
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('codeLink.unlinkDialogTitle')} {entry ? `- ${entry.name}` : ''}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          {t('codeLink.confirmUnlinkMessage1', { code: entry?.code?.value ?? '' })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('codeLink.confirmUnlinkMessage2', { code: entry?.code?.value ?? '' })}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={unlinkCode.isPending}>
            {t('codeLink.unlink')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
