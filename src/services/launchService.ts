import { useMutation, useQuery } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'
import type { LaunchConfigDto } from '../../shared/types/ipc'

export function useListExecutables(folderPath: string) {
  return useQuery<string[]>({
    queryKey: ['executables', folderPath],
    queryFn: () => window.api.launch.listExecutables(folderPath),
    enabled: folderPath !== '',
  })
}

export function useLocaleEmulatorAvailable() {
  return useQuery<boolean>({
    queryKey: ['locale-emulator-available'],
    queryFn: () => window.api.launch.isLocaleEmulatorAvailable(),
    staleTime: Infinity,
  })
}

export function useSetLaunchConfig() {
  return useMutation({
    mutationFn: ({
      entry,
      config,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      config: LaunchConfigDto
    }) => window.api.launch.setConfig(entry.code, entry.path, config),
  })
}

export function useLaunchGame() {
  return useMutation({
    mutationFn: (entry: Pick<ScannedEntry, 'code' | 'path'>) =>
      window.api.launch.launch(entry.code, entry.path),
  })
}
