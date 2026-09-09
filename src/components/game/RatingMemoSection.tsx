import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { useGameUserData, useSetRatingAndMemo } from '../../services/gameUserDataService'
import { useTranslation } from '../../i18n/useTranslation'
import { appToast } from '../../lib/appToast'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface RatingMemoSectionProps {
  game: ScannedEntry
}

// Always-expanded (see DetailSidebar) - rating saves instantly on click
// (mirrors the existing favorite-heart toggle's immediate-save pattern),
// memo saves on blur. Both go through the same setRatingAndMemo mutation
// (there's no separate "rating only" endpoint), so each save sends
// whichever field didn't just change alongside the one that did.
export function RatingMemoSection({ game }: RatingMemoSectionProps) {
  const { t } = useTranslation()
  const { data: userData, isError, refetch } = useGameUserData(game)
  const setRatingAndMemo = useSetRatingAndMemo()

  const [rating, setRating] = useState<number | null>(userData?.rating ?? null)
  const [memo, setMemo] = useState(userData?.memo ?? '')
  // Hydrates local state from userData exactly once - the first time it
  // becomes available after mount (userData arrives asynchronously; it may
  // still be undefined on the very first render). After that, local state
  // is authoritative: it's already updated synchronously on every user edit
  // (star click, textarea onChange), with the write already sent via
  // mutate(). Re-syncing from every subsequent userData cache update (as
  // RatingMemoDialog.tsx does, safely, since that dialog closes after its
  // one save) would clobber a fresher local edit with a stale echo whenever
  // this section's own rating-save and memo-save race each other - both go
  // through the same combined useSetRatingAndMemo mutation, so a save
  // triggered by one field can resolve after the user has already changed
  // the other. handleRatingClick and handleMemoChange also set hydrated =
  // true immediately on any user edit (not just on the first userData
  // arrival), so an edit made before the initial load resolves can't be
  // clobbered by that load's stale pre-edit response arriving afterward.
  const [hydrated, setHydrated] = useState(userData !== undefined)
  const [justSaved, setJustSaved] = useState(false)

  // canEdit gates every read/write against the one window where using local
  // state would be unsafe: before the initial GET resolves (or if it fails
  // outright). Before that, `rating`/`memo` are still their un-hydrated
  // defaults (null/'') - a save triggered from that state sends the OTHER,
  // not-yet-loaded field's default alongside whichever one the user just
  // touched, silently overwriting a real saved value with null. This is the
  // exact data-loss path a real user could hit: click a star, then blur out
  // of an untouched memo textarea, before the GET for an existing memo has
  // resolved.
  const canEdit = userData !== undefined && !isError

  if (!hydrated && userData !== undefined) {
    setHydrated(true)
    setRating(userData?.rating ?? null)
    setMemo(userData?.memo ?? '')
  }

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [justSaved])

  const handleRatingClick = (value: number): void => {
    if (!canEdit) return
    const nextRating = value === rating ? null : value
    setRating(nextRating)
    setHydrated(true)
    setJustSaved(false)
    setRatingAndMemo.mutate(
      { entry: game, rating: nextRating, memo: memo.trim() === '' ? null : memo },
      {
        onSuccess: () => setJustSaved(true),
        onError: () => appToast.error(t('ratingMemo.saveFailed')),
      }
    )
  }

  const handleMemoChange = (value: string): void => {
    if (!canEdit) return
    setMemo(value)
    setHydrated(true)
  }

  const handleMemoBlur = (): void => {
    if (!canEdit) return
    if (memo === (userData?.memo ?? '')) return // 변경 없으면 저장 생략
    setJustSaved(false)
    setRatingAndMemo.mutate(
      { entry: game, rating, memo: memo.trim() === '' ? null : memo },
      {
        onSuccess: () => setJustSaved(true),
        onError: () => appToast.error(t('ratingMemo.saveFailed')),
      }
    )
  }

  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">{t('ratingMemo.rating')}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            onClick={() => handleRatingClick(value)}
            disabled={!canEdit}
            className="transition-transform duration-120 active:scale-[0.9] motion-reduce:transform-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Star
              className="h-5 w-5 text-yellow-500"
              fill={rating !== null && value <= rating ? 'currentColor' : 'none'}
            />
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{t('ratingMemo.memo')}</p>
      <textarea
        value={memo}
        onChange={(e) => handleMemoChange(e.target.value)}
        onBlur={handleMemoBlur}
        disabled={!canEdit}
        placeholder={t('ratingMemo.memoPlaceholder')}
        className="min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <p className="h-4 text-xs text-muted-foreground">
        {setRatingAndMemo.isPending
          ? t('ratingMemo.saving')
          : justSaved
            ? t('ratingMemo.saved')
            : ''}
      </p>
      {isError && (
        <p className="flex items-center gap-2 text-xs text-destructive">
          <span>{t('ratingMemo.loadFailed')}</span>
          <button
            data-testid="rating-memo-retry"
            onClick={() => refetch()}
            className="underline hover:no-underline"
          >
            {t('ratingMemo.retry')}
          </button>
        </p>
      )}
    </div>
  )
}
