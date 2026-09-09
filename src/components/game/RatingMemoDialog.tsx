import { useState } from 'react'
import { Star } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useGameUserData, useSetRatingAndMemo } from '../../services/gameUserDataService'
import { useTranslation } from '../../i18n/useTranslation'
import { appToast } from '../../lib/appToast'
import type { GameUserDataDto } from '../../../shared/types/ipc'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface RatingMemoDialogProps {
  entry: ScannedEntry | null
  onClose: () => void
}

export function RatingMemoDialog({ entry, onClose }: RatingMemoDialogProps) {
  const { t } = useTranslation()
  const { data: userData, isError, refetch } = useGameUserData(entry ?? { code: null, path: '' })
  const setRatingAndMemo = useSetRatingAndMemo()

  const [rating, setRating] = useState<number | null>(userData?.rating ?? null)
  const [memo, setMemo] = useState(userData?.memo ?? '')
  const [syncedUserData, setSyncedUserData] = useState<GameUserDataDto | null | undefined>(userData)

  // canEdit gates every control and the save button against the one window
  // where local state would be unsafe: before the initial GET resolves (or
  // if it fails). Before that, rating/memo are still their un-hydrated
  // null/'' defaults - unlike RatingMemoSection.tsx, this dialog re-syncs
  // from userData on EVERY cache update (safe here, since it always closes
  // right after its one save via handleSave's onClose() - there's no
  // in-flight-edit-vs-stale-echo race to protect against). But that re-sync
  // alone doesn't stop a Save click that fires BEFORE the first fetch ever
  // resolves: the button and Save handler were previously always live,
  // so clicking Save on a freshly-opened dialog (GET still in flight) sent
  // rating: null, memo: null straight to the combined mutation, silently
  // overwriting whatever was actually saved.
  const canEdit = userData !== undefined && !isError

  if (userData !== syncedUserData) {
    setSyncedUserData(userData)
    setRating(userData?.rating ?? null)
    setMemo(userData?.memo ?? '')
  }

  const handleSave = (): void => {
    if (!entry || !canEdit) return
    setRatingAndMemo.mutate(
      { entry, rating, memo: memo.trim() === '' ? null : memo },
      { onError: () => appToast.error(t('ratingMemo.saveFailed')) }
    )
    onClose()
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('ratingMemo.dialogTitle')} {entry ? `- ${entry.name}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              onClick={() => canEdit && setRating(value === rating ? null : value)}
              disabled={!canEdit}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Star
                className="h-6 w-6 text-yellow-500"
                fill={rating !== null && value <= rating ? 'currentColor' : 'none'}
              />
            </button>
          ))}
        </div>
        <textarea
          value={memo}
          onChange={(e) => canEdit && setMemo(e.target.value)}
          disabled={!canEdit}
          placeholder={t('ratingMemo.memoPlaceholder')}
          className="min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        />
        {isError && (
          <p className="flex items-center gap-2 text-xs text-destructive">
            <span>{t('ratingMemo.loadFailed')}</span>
            <button onClick={() => refetch()} className="underline hover:no-underline">
              {t('common.retry')}
            </button>
          </p>
        )}
        <Button onClick={handleSave} disabled={!canEdit}>
          {t('common.save')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
