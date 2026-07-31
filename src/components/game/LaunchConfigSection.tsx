import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import {
  useListExecutables,
  useLocaleEmulatorAvailable,
  useSetLaunchConfig,
} from '../../services/launchService'
import { useBackupSaveNow, usePickSaveFolder, useSetSavePath } from '../../services/saveService'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { LaunchConfigDto } from '../../../shared/types/ipc'

interface LaunchConfigSectionProps {
  game: ScannedEntry
}

// Collapsible, starts collapsed (see DetailSidebar's per-game key resetting
// this section's local `expanded` state on every selection change). Field
// set and explicit-save behavior mirror LaunchConfigDialog.tsx exactly -
// this is used less often than rating/memo, so an explicit save button
// stays appropriate here.
export function LaunchConfigSection({ game }: LaunchConfigSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const folderPath = game.kind === 'folder' ? game.path : ''
  const { data: executables } = useListExecutables(folderPath)
  const { data: leAvailable } = useLocaleEmulatorAvailable()
  const setLaunchConfig = useSetLaunchConfig()
  const pickSaveFolder = usePickSaveFolder()
  const setSavePath = useSetSavePath()
  const backupSaveNow = useBackupSaveNow()

  const [selectedExe, setSelectedExe] = useState('')
  const [launchMode, setLaunchMode] = useState<LaunchConfigDto['launchMode']>('normal')

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
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        실행 설정
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-3">
          {game.kind !== 'folder' ? (
            <p className="text-xs text-muted-foreground">
              압축파일은 실행 설정을 지원하지 않습니다. 먼저 압축을 해제해 주세요.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium">실행파일</p>
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
                  <p className="text-xs text-muted-foreground">exe 파일을 찾을 수 없습니다.</p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium">실행 방식</p>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="launchMode"
                    checked={launchMode === 'normal'}
                    onChange={() => setLaunchMode('normal')}
                  />
                  일반 실행
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="launchMode"
                    checked={launchMode === 'locale-emulator'}
                    onChange={() => setLaunchMode('locale-emulator')}
                    disabled={!leAvailable}
                  />
                  Locale Emulator로 실행{!leAvailable && ' (설치되어 있지 않음)'}
                </label>
              </div>

              <Button size="sm" onClick={handleSaveLaunchConfig} disabled={!selectedExe}>
                실행 설정 저장
              </Button>

              <div className="border-t border-border pt-3">
                <p className="text-xs font-medium">세이브 파일 백업 위치</p>
                <div className="mt-1 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={handlePickSaveFolder}>
                    세이브 폴더 지정
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleBackupNow}
                    disabled={backupSaveNow.isPending}
                  >
                    지금 백업
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
