import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
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

interface LaunchConfigDialogProps {
  entry: ScannedEntry | null
  onClose: () => void
}

export function LaunchConfigDialog({ entry, onClose }: LaunchConfigDialogProps) {
  const { t } = useTranslation()
  const folderPath = entry?.kind === 'folder' ? entry.path : ''
  const { data: executables } = useListExecutables(folderPath)
  const { data: leAvailable } = useLocaleEmulatorAvailable()
  const { data: userData } = useGameUserData(entry ?? { code: null, path: '' })
  const setLaunchConfig = useSetLaunchConfig()
  const pickSaveFolder = usePickSaveFolder()
  const setSavePath = useSetSavePath()
  const backupSaveNow = useBackupSaveNow()

  const [selectedExe, setSelectedExe] = useState(userData?.launchConfig?.executablePath ?? '')
  const [launchMode, setLaunchMode] = useState<LaunchConfigDto['launchMode']>(
    userData?.launchConfig?.launchMode ?? 'normal'
  )
  // Re-syncs from userData on every change (not hydrate-once) - this dialog
  // is remounted per open (keyed by entry in DetailOverlay), and unlike
  // LaunchConfigSection there's no separate-field-save race to guard
  // against, so RatingMemoDialog's simpler always-sync pattern applies here.
  const [syncedUserData, setSyncedUserData] = useState(userData)
  if (userData !== syncedUserData) {
    setSyncedUserData(userData)
    setSelectedExe(userData?.launchConfig?.executablePath ?? '')
    setLaunchMode(userData?.launchConfig?.launchMode ?? 'normal')
  }

  const handleSaveLaunchConfig = (): void => {
    if (!entry || !selectedExe) return
    setLaunchConfig.mutate({ entry, config: { executablePath: selectedExe, launchMode } })
  }

  const handlePickSaveFolder = async (): Promise<void> => {
    if (!entry) return
    const path = await pickSaveFolder.mutateAsync()
    if (path) setSavePath.mutate({ entry, savePath: path })
  }

  const handleBackupNow = (): void => {
    if (!entry) return
    backupSaveNow.mutate(entry)
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('launchConfig.dialogTitle')} {entry ? `- ${entry.name}` : ''}
          </DialogTitle>
        </DialogHeader>

        {entry?.kind !== 'folder' && (
          <p className="text-sm text-muted-foreground">{t('launchConfig.archiveNotSupported')}</p>
        )}

        {entry?.kind === 'folder' && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{t('launchConfig.executable')}</p>
              {(executables ?? []).map((exe) => (
                <label key={exe} className="flex items-center gap-2 text-sm">
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
                <p className="text-sm text-muted-foreground">{t('launchConfig.noExeFound')}</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{t('launchConfig.launchMode')}</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="launchMode"
                  checked={launchMode === 'normal'}
                  onChange={() => setLaunchMode('normal')}
                />
                {t('launchConfig.normalLaunch')}
              </label>
              <label className="flex items-center gap-2 text-sm">
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

            <Button onClick={handleSaveLaunchConfig} disabled={!selectedExe}>
              {t('launchConfig.saveLaunchConfig')}
            </Button>

            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-medium">{t('launchConfig.saveBackupLocation')}</p>
              <Button variant="secondary" onClick={handlePickSaveFolder}>
                {t('launchConfig.pickSaveFolder')}
              </Button>
              <Button
                variant="secondary"
                onClick={handleBackupNow}
                disabled={backupSaveNow.isPending}
                className="ml-2"
              >
                {t('launchConfig.backupNow')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
