import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userDataQueryKey } from './gameUserDataService'
import type { ScannedEntry } from '../../shared/types/scanner'
import type {
  GameUserDataDto,
  GameWithSavePathDto,
  SaveDiffEntryDto,
  SaveSnapshotDto,
} from '../../shared/types/ipc'

function identifierKey(entry: Pick<ScannedEntry, 'code' | 'path'>): string {
  return entry.code ? entry.code.value : entry.path
}

export function usePickSaveFolder() {
  return useMutation({ mutationFn: () => window.api.save.pickFolder() })
}

export function useSetSavePath() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      entry,
      savePath,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      savePath: string
    }) => window.api.save.setPath(entry.code, entry.path, savePath),
    onSuccess: (_result, { entry, savePath }) => {
      queryClient.setQueryData<GameUserDataDto | null>(userDataQueryKey(entry), (prev) => ({
        isFavorite: prev?.isFavorite ?? false,
        isCleared: prev?.isCleared ?? false,
        rating: prev?.rating ?? null,
        memo: prev?.memo ?? null,
        totalPlaytimeMs: prev?.totalPlaytimeMs ?? 0,
        launchConfig: prev?.launchConfig ?? null,
        customCoverPath: prev?.customCoverPath ?? null,
        savePath,
      }))
      queryClient.invalidateQueries({ queryKey: ['games-with-save-path'] })
    },
  })
}

export function useSaveSnapshots(entry: Pick<ScannedEntry, 'code' | 'path'> | null) {
  return useQuery<SaveSnapshotDto[]>({
    queryKey: ['save-snapshots', entry ? identifierKey(entry) : 'none'],
    queryFn: () => window.api.save.listSnapshots(entry!.code, entry!.path),
    enabled: entry !== null,
  })
}

// timestamp: the snapshot to diff the live save folder against, or null to
// diff against "no prior snapshot" (i.e. treat every live file as new) -
// see saveHandlers.ts's SAVE_DIFF handler.
export function useSaveDiff(
  entry: Pick<ScannedEntry, 'code' | 'path'> | null,
  timestamp: string | null,
  enabled: boolean
) {
  return useQuery<SaveDiffEntryDto[]>({
    queryKey: ['save-diff', entry ? identifierKey(entry) : 'none', timestamp ?? '__none__'],
    queryFn: () => window.api.save.diff(entry!.code, entry!.path, timestamp),
    enabled: enabled && entry !== null,
  })
}

export function useCreateSaveSnapshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entry: Pick<ScannedEntry, 'code' | 'path'>) =>
      window.api.save.createSnapshot(entry.code, entry.path),
    onSuccess: (_result, entry) => {
      queryClient.invalidateQueries({ queryKey: ['save-snapshots', identifierKey(entry)] })
      queryClient.invalidateQueries({ queryKey: ['save-diff', identifierKey(entry)] })
    },
  })
}

export function useRestoreSaveSnapshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      entry,
      timestamp,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      timestamp: string
    }) => window.api.save.restoreSnapshot(entry.code, entry.path, timestamp),
    onSuccess: (_result, { entry }) => {
      queryClient.invalidateQueries({ queryKey: ['save-snapshots', identifierKey(entry)] })
      queryClient.invalidateQueries({ queryKey: ['save-diff', identifierKey(entry)] })
    },
  })
}

export function useGamesWithSavePath() {
  return useQuery<GameWithSavePathDto[]>({
    queryKey: ['games-with-save-path'],
    queryFn: () => window.api.save.listGamesWithSavePath(),
  })
}
