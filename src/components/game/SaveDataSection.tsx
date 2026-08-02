import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import { useGameUserData } from '../../services/gameUserDataService'
import { usePickSaveFolder, useSetSavePath } from '../../services/saveService'
import { useShowItemInFolder } from '../../services/shellService'
import { SaveManagerDialog } from './SaveManagerDialog'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface SaveDataSectionProps {
  game: ScannedEntry
}

// Collapsible, starts collapsed - split out from LaunchConfigSection so
// save-data management isn't buried inside "실행 설정". Unlike
// LaunchConfigSection this never gates on game.kind === 'folder': a save
// folder is independent of whether the game itself has been extracted from
// its archive yet.
export function SaveDataSection({ game }: SaveDataSectionProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [showSaveManager, setShowSaveManager] = useState(false)
  const { data: userData } = useGameUserData(game)
  const pickSaveFolder = usePickSaveFolder()
  const setSavePath = useSetSavePath()
  const showItemInFolder = useShowItemInFolder()

  const handlePickSaveFolder = async (): Promise<void> => {
    const path = await pickSaveFolder.mutateAsync(game.path)
    if (path) setSavePath.mutate({ entry: game, savePath: path })
  }

  return (
    <div className="border-t border-border pt-3">
      <button
        className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground"
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        {t('saveManager.sectionTitle')}
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {userData?.savePath && (
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs text-muted-foreground" title={userData.savePath}>
                {userData.savePath}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => showItemInFolder.mutate(userData.savePath!)}
              >
                {t('game.openFolder')}
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={handlePickSaveFolder}>
              {t('launchConfig.pickSaveFolder')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowSaveManager(true)}>
              {t('launchConfig.manageSaves')}
            </Button>
          </div>
        </div>
      )}
      <SaveManagerDialog
        entry={showSaveManager ? game : null}
        savePath={userData?.savePath ?? null}
        onClose={() => setShowSaveManager(false)}
      />
    </div>
  )
}
