import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userDataQueryKey } from './gameUserDataService'
import type { ScannedEntry } from '../../shared/types/scanner'
import type { GameUserDataDto, LaunchConfigDto } from '../../shared/types/ipc'

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
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      entry,
      config,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      config: LaunchConfigDto
    }) => window.api.launch.setConfig(entry.code, entry.path, config),
    onSuccess: (_result, { entry, config }) => {
      queryClient.setQueryData<GameUserDataDto | null>(userDataQueryKey(entry), (prev) =>
        prev ? { ...prev, launchConfig: config } : prev
      )
    },
  })
}

export function useLaunchGame() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (entry: Pick<ScannedEntry, 'code' | 'path'>) =>
      window.api.launch.launch(entry.code, entry.path),
    onSuccess: (result, entry) => {
      // The recently-played list query only carries { key, lastPlayedAt } -
      // it never had this session's playtime to begin with, so invalidating
      // it alone doesn't update what RecentlyPlayedPage shows for
      // totalPlaytimeMs. Update this entry's own cache slot directly with
      // the sessionMs the backend just persisted, so it doesn't wait out
      // useGameUserData's 5-minute staleTime.
      queryClient.setQueryData<GameUserDataDto | null>(userDataQueryKey(entry), (prev) =>
        prev ? { ...prev, totalPlaytimeMs: prev.totalPlaytimeMs + result.sessionMs } : prev
      )
      queryClient.invalidateQueries({ queryKey: ['game-user-data', 'recently-played'] })
    },
  })
}
