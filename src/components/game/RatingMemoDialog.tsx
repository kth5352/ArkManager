import { useState } from 'react'
import { Star } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useGameUserData, useSetRatingAndMemo } from '../../services/gameUserDataService'
import { useTranslation } from '../../i18n/useTranslation'
import type { GameUserDataDto } from '../../../shared/types/ipc'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface RatingMemoDialogProps {
  entry: ScannedEntry | null
  onClose: () => void
}

export function RatingMemoDialog({ entry, onClose }: RatingMemoDialogProps) {
  const { t } = useTranslation()
  const { data: userData } = useGameUserData(entry ?? { code: null, path: '' })
  const setRatingAndMemo = useSetRatingAndMemo()

  const [rating, setRating] = useState<number | null>(userData?.rating ?? null)
  const [memo, setMemo] = useState(userData?.memo ?? '')
  const [syncedUserData, setSyncedUserData] = useState<GameUserDataDto | null | undefined>(userData)

  if (userData !== syncedUserData) {
    setSyncedUserData(userData)
    setRating(userData?.rating ?? null)
    setMemo(userData?.memo ?? '')
  }

  const handleSave = (): void => {
    if (!entry) return
    setRatingAndMemo.mutate({ entry, rating, memo: memo.trim() === '' ? null : memo })
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
            <button key={value} onClick={() => setRating(value === rating ? null : value)}>
              <Star
                className="h-6 w-6 text-yellow-500"
                fill={rating !== null && value <= rating ? 'currentColor' : 'none'}
              />
            </button>
          ))}
        </div>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder={t('ratingMemo.memoPlaceholder')}
          className="min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm"
        />
        <Button onClick={handleSave}>{t('common.save')}</Button>
      </DialogContent>
    </Dialog>
  )
}
