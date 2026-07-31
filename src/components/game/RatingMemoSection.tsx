import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { useGameUserData, useSetRatingAndMemo } from '../../services/gameUserDataService'
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
  const { data: userData } = useGameUserData(game)
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
    const nextRating = value === rating ? null : value
    setRating(nextRating)
    setHydrated(true)
    setRatingAndMemo.mutate(
      { entry: game, rating: nextRating, memo: memo.trim() === '' ? null : memo },
      { onSuccess: () => setJustSaved(true) }
    )
  }

  const handleMemoChange = (value: string): void => {
    setMemo(value)
    setHydrated(true)
  }

  const handleMemoBlur = (): void => {
    if (memo === (userData?.memo ?? '')) return // 변경 없으면 저장 생략
    setRatingAndMemo.mutate(
      { entry: game, rating, memo: memo.trim() === '' ? null : memo },
      { onSuccess: () => setJustSaved(true) }
    )
  }

  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">평점</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} onClick={() => handleRatingClick(value)}>
            <Star
              className="h-5 w-5 text-yellow-500"
              fill={rating !== null && value <= rating ? 'currentColor' : 'none'}
            />
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs font-medium text-muted-foreground">메모</p>
      <textarea
        value={memo}
        onChange={(e) => handleMemoChange(e.target.value)}
        onBlur={handleMemoBlur}
        placeholder="메모"
        className="min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      <p className="h-4 text-xs text-muted-foreground">
        {setRatingAndMemo.isPending ? '저장 중...' : justSaved ? '저장됨' : ''}
      </p>
    </div>
  )
}
