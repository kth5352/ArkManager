import { useState } from 'react'
import { Button } from '../ui/button'
import {
  useClearCustomCover,
  usePickCustomCoverFile,
  useSetCustomCoverFromClipboard,
  useSetCustomCoverFromFile,
} from '../../services/gameUserDataService'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface CustomCoverSectionProps {
  game: ScannedEntry
  hasCustomCover: boolean
}

// Works for code-linked entries too, not just code-less ones - a linked
// game can still have the "wrong" cover crawled (wrong edition, a title
// screen instead of box art) with no other way to override it, and
// GameThumbnail.tsx's own priority already puts a custom cover ahead of the
// crawled DLsite cover regardless of game.code. CodeLinkSection can turn an
// entry code-less <-> coded without this component remounting (both share
// DetailSidebar's game.path key), so this stays mounted either way.
export function CustomCoverSection({ game, hasCustomCover }: CustomCoverSectionProps) {
  const { t } = useTranslation()
  const pickFile = usePickCustomCoverFile()
  const setFromFile = useSetCustomCoverFromFile()
  const setFromClipboard = useSetCustomCoverFromClipboard()
  const clearCover = useClearCustomCover()
  const [error, setError] = useState<string | null>(null)

  const handlePickFile = async (): Promise<void> => {
    setError(null)
    const sourcePath = await pickFile.mutateAsync()
    if (!sourcePath) return
    setFromFile.mutate({ entry: game, sourcePath })
  }

  const handlePasteFromClipboard = (): void => {
    setError(null)
    setFromClipboard.mutate(game, {
      onError: () => setError(t('customCover.noImageInClipboard')),
    })
  }

  const isPending = pickFile.isPending || setFromFile.isPending || setFromClipboard.isPending

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">{t('customCover.title')}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={handlePickFile} disabled={isPending}>
          {t('customCover.pickFile')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handlePasteFromClipboard}
          disabled={isPending}
        >
          {t('customCover.paste')}
        </Button>
        {hasCustomCover && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => clearCover.mutate(game)}
            disabled={clearCover.isPending}
          >
            {t('customCover.remove')}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
