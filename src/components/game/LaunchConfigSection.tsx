import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import {
  useListExecutables,
  useLocaleEmulatorAvailable,
  useSetLaunchConfig,
} from '../../services/launchService'
import { useGameUserData } from '../../services/gameUserDataService'
import { useBackupSaveNow, usePickSaveFolder, useSetSavePath } from '../../services/saveService'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { LaunchConfigDto } from '../../../shared/types/ipc'

interface LaunchConfigSectionProps {
  game: ScannedEntry
}

// Collapsible, starts collapsed - `expanded` is local (DetailSidebar's
// per-game key already resets this section's whole local state on every
// selection change). A failed launch attempt (no saved config yet) opens
// LaunchConfigDialog as a centered modal instead of forcing this section
// open, so `expanded` no longer needs to be controlled by the parent. Field
// set and explicit-save behavior mirror LaunchConfigDialog.tsx exactly -
// this is used less often than rating/memo, so an explicit save button
// stays appropriate here.
export function LaunchConfigSection({ game }: LaunchConfigSectionProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const folderPath = game.kind === 'folder' ? game.path : ''
  const { data: executables } = useListExecutables(folderPath)
  const { data: leAvailable } = useLocaleEmulatorAvailable()
  const { data: userData } = useGameUserData(game)
  const setLaunchConfig = useSetLaunchConfig()
  const pickSaveFolder = usePickSaveFolder()
  const setSavePath = useSetSavePath()
  const backupSaveNow = useBackupSaveNow()

  const [selectedExe, setSelectedExe] = useState(userData?.launchConfig?.executablePath ?? '')
  const [launchMode, setLaunchMode] = useState<LaunchConfigDto['launchMode']>(
    userData?.launchConfig?.launchMode ?? 'normal'
  )
  // Hydrates from the already-saved config exactly once, the first time
  // userData becomes available after mount (mirrors RatingMemoSection's
  // hydrate-once pattern) - this section is remounted per game (keyed by
  // path in DetailSidebar), so mount-time hydration is sufficient; unlike
  // rating/memo there's no separate-field-save race to guard against since
  // both fields commit together via one explicit save button.
  const [hydrated, setHydrated] = useState(userData !== undefined)
  if (!hydrated && userData !== undefined) {
    setHydrated(true)
    setSelectedExe(userData?.launchConfig?.executablePath ?? '')
    setLaunchMode(userData?.launchConfig?.launchMode ?? 'normal')
  }

  const handleSaveLaunchConfig = (): void => {
    if (!selectedExe) return
    setLaunchConfig.mutate({ entry: game, config: { executablePath: selectedExe, launchMode } })
  }

  const handlePickSaveFolder = async (): Promise<void> => {
    const path = await pickSaveFolder.mutateAsync()
    if (path) setSavePath.mutate({ entry: game, savePath: path })
  }

  const handleBackupNow = (): void => {
    backupSaveNow.mutate(game)
  }

  return (
    <div className="border-t border-border pt-3">
      <button
        className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        {t('launchConfig.title')}
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-3">
          {game.kind !== 'folder' ? (
            <p className="text-xs text-muted-foreground">{t('launchConfig.archiveNotSupported')}</p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium">{t('launchConfig.executable')}</p>
                {(executables ?? []).map((exe) => (
                  <label key={exe} className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="executable"
                      checked={selectedExe === exe}
                      onChange={() => setSelectedExe(exe)}
                    />
                    {exe}
                  </label>
                ))}
                {(executables ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">{t('launchConfig.noExeFound')}</p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium">{t('launchConfig.launchMode')}</p>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="launchMode"
                    checked={launchMode === 'normal'}
                    onChange={() => setLaunchMode('normal')}
                  />
                  {t('launchConfig.normalLaunch')}
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="launchMode"
                    checked={launchMode === 'locale-emulator'}
                    onChange={() => setLaunchMode('locale-emulator')}
                    disabled={!leAvailable}
                  />
                  {t('launchConfig.localeEmulatorLaunch')}
                  {!leAvailable && t('launchConfig.notInstalled')}
                </label>
              </div>

              <Button size="sm" onClick={handleSaveLaunchConfig} disabled={!selectedExe}>
                {t('launchConfig.saveLaunchConfig')}
              </Button>

              <div className="border-t border-border pt-3">
                <p className="text-xs font-medium">{t('launchConfig.saveBackupLocation')}</p>
                <div className="mt-1 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={handlePickSaveFolder}>
                    {t('launchConfig.pickSaveFolder')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleBackupNow}
                    disabled={backupSaveNow.isPending}
                  >
                    {t('launchConfig.backupNow')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
