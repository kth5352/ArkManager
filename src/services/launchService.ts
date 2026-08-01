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

export const LOCALE_EMULATOR_AVAILABLE_QUERY_KEY = ['locale-emulator-available'] as const

export function useLocaleEmulatorAvailable() {
  return useQuery<boolean>({
    queryKey: LOCALE_EMULATOR_AVAILABLE_QUERY_KEY,
    queryFn: () => window.api.launch.isLocaleEmulatorAvailable(),
    staleTime: Infinity,
  })
}

export function usePickLocaleEmulatorPath() {
  return useMutation({
    mutationFn: () => window.api.launch.pickLocaleEmulatorPath(),
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
      const updated = queryClient.setQueryData<GameUserDataDto | null>(
        userDataQueryKey(entry),
        (prev) =>
          prev ? { ...prev, totalPlaytimeMs: prev.totalPlaytimeMs + result.sessionMs } : prev
      )
      // A game launched for the first time ever has no existing cache entry
      // (prev is null/undefined) - the update above silently no-ops then,
      // since there's no safe way to guess the other fields (isFavorite/
      // rating/memo/launchConfig) well enough to fabricate a whole object.
      // Force a refetch instead of leaving the UI showing no playtime at all
      // until the next natural 5-minute staleTime refetch - this is exactly
      // the case that made tracking look broken on a game's first launch.
      if (updated === undefined || updated === null) {
        queryClient.invalidateQueries({ queryKey: userDataQueryKey(entry) })
      }
      queryClient.invalidateQueries({ queryKey: ['game-user-data', 'recently-played'] })
    },
  })
}
