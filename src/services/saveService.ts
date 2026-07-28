import { useMutation } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'

export function usePickSaveFolder() {
  return useMutation({ mutationFn: () => window.api.save.pickFolder() })
}

export function useSetSavePath() {
  return useMutation({
    mutationFn: ({
      entry,
      savePath,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      savePath: string
    }) => window.api.save.setPath(entry.code, entry.path, savePath),
  })
}

export function useBackupSaveNow() {
  return useMutation({
    mutationFn: (entry: Pick<ScannedEntry, 'code' | 'path'>) =>
      window.api.save.backupNow(entry.code, entry.path),
  })
}
