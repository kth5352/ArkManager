import { useState } from 'react'
import { Button } from '../ui/button'
import { CollapsibleSection } from './CollapsibleSection'
import { useGameUserData } from '../../services/gameUserDataService'
import { usePickSaveFolder, useSetSavePath } from '../../services/saveService'
import { useShowItemInFolder } from '../../services/shellService'
import { SaveManagerDialog } from './SaveManagerDialog'
import { appToast } from '../../lib/appToast'
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
    if (!path) return
    setSavePath.mutate(
      { entry: game, savePath: path },
      // Same gap found and fixed across this session's other favorite/
      // cleared/like toggles and SaveManagerDialog's own mutations - no
      // optimistic update here (so a failure already correctly left the
      // old savePath alone), but no onError meant a failure was invisible.
      { onError: () => appToast.error(t('saveManager.setSavePathFailed')) }
    )
  }

  return (
    <>
      <CollapsibleSection
        title={t('saveManager.sectionTitle')}
        expanded={expanded}
        onToggle={() => setExpanded((current) => !current)}
      >
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
      </CollapsibleSection>
      {/* Deliberately a sibling of CollapsibleSection, not inside it - once
          open, the dialog must keep showing even if the user collapses this
          section in the background, and it must never be torn down by
          CollapsibleSection's own AnimatePresence exit animation. */}
      <SaveManagerDialog
        entry={showSaveManager ? game : null}
        savePath={userData?.savePath ?? null}
        onClose={() => setShowSaveManager(false)}
      />
    </>
  )
}
