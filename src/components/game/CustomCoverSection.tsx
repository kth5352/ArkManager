import { useState } from 'react'
import { Button } from '../ui/button'
import {
  useClearCustomCover,
  usePickCustomCoverFile,
  useSetCustomCoverFromClipboard,
  useSetCustomCoverFromFile,
} from '../../services/gameUserDataService'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface CustomCoverSectionProps {
  game: ScannedEntry
  hasCustomCover: boolean
}

// Only meaningful for code-less entries (nothing to crawl from DLsite for a
// cover) - CodeLinkSection can turn an entry code-less <-> coded without
// this component remounting (both share DetailSidebar's game.path key), so
// this stays mounted either way and just hides its own UI, keeping its
// hook calls unconditional rather than being conditionally rendered by its
// caller.
export function CustomCoverSection({ game, hasCustomCover }: CustomCoverSectionProps) {
  const pickFile = usePickCustomCoverFile()
  const setFromFile = useSetCustomCoverFromFile()
  const setFromClipboard = useSetCustomCoverFromClipboard()
  const clearCover = useClearCustomCover()
  const [error, setError] = useState<string | null>(null)

  if (game.code) return null

  const handlePickFile = async (): Promise<void> => {
    setError(null)
    const sourcePath = await pickFile.mutateAsync()
    if (!sourcePath) return
    setFromFile.mutate({ entry: game, sourcePath })
  }

  const handlePasteFromClipboard = (): void => {
    setError(null)
    setFromClipboard.mutate(game, {
      onError: () => setError('클립보드에 이미지가 없습니다.'),
    })
  }

  const isPending = pickFile.isPending || setFromFile.isPending || setFromClipboard.isPending

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">표지 이미지</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={handlePickFile} disabled={isPending}>
          파일에서 선택
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handlePasteFromClipboard}
          disabled={isPending}
        >
          붙여넣기
        </Button>
        {hasCustomCover && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => clearCover.mutate(game)}
            disabled={clearCover.isPending}
          >
            제거
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
