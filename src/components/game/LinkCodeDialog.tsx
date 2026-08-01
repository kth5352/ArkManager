import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useLinkCode } from '../../services/gameUserDataService'
import { useCrawlGameMetadata } from '../../services/metadataService'
import { parseCodeInput } from '../../pages/DlsiteSearch/parseCodeInput'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface LinkCodeDialogProps {
  entry: ScannedEntry | null
  onClose: () => void
}

export function LinkCodeDialog({ entry, onClose }: LinkCodeDialogProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  // A linked code is hard to correct once committed (see DetailOverlay -
  // the "코드 연동" button only shows while the entry is still code-less), so
  // a typo shouldn't be a single click away. This confirmation step reduces
  // the chance of that happening; it does not add a way to re-link/undo an
  // already-linked entry - that's a separate, larger design question.
  const [confirming, setConfirming] = useState(false)
  const linkCode = useLinkCode()
  const crawlMetadata = useCrawlGameMetadata()

  const parsedCode = parseCodeInput(input)

  const handleConfirm = (): void => {
    if (!entry || !parsedCode) return
    linkCode.mutate(
      { path: entry.path, code: parsedCode },
      {
        onSuccess: () => {
          crawlMetadata.mutate(parsedCode)
          onClose()
        },
        onError: () => {
          // Deliberately no-op beyond leaving linkCode.isError true - the
          // confirmation view below reads it to show a message instead of
          // silently doing nothing, without closing the dialog (so the user
          // can just retry the same "연동 확정" click).
        },
      }
    )
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('codeLink.dialogTitle')} {entry ? `- ${entry.name}` : ''}
          </DialogTitle>
        </DialogHeader>
        {!confirming ? (
          <>
            <p className="text-xs text-muted-foreground">{t('codeLink.linkHint')}</p>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('codeLink.codePlaceholder')}
            />
            <Button onClick={() => setConfirming(true)} disabled={!parsedCode}>
              {t('codeLink.next')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm">
              {t('codeLink.confirmLinkMessage', { code: parsedCode?.value ?? '' })}
            </p>
            {linkCode.isError && (
              <p className="text-xs text-destructive">{t('codeLink.linkFailed')}</p>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {t('codeLink.back')}
              </Button>
              <Button onClick={handleConfirm} disabled={!parsedCode || linkCode.isPending}>
                {t('codeLink.confirmLink')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
