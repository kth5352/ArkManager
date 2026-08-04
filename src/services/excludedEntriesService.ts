import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'
import type { ExcludedEntryDto } from '../../shared/types/ipc'

export function useExcludedEntries() {
  return useQuery<ExcludedEntryDto[]>({
    queryKey: ['excluded-entries'],
    queryFn: () => window.api.gameEntry.listExcluded(),
  })
}

export function useExcludeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entry: Pick<ScannedEntry, 'code' | 'path' | 'name'>) =>
      window.api.gameEntry.exclude(entry.code, entry.path, entry.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['excluded-entries'] })
    },
  })
}

export function useRestoreEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => window.api.gameEntry.restore(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['excluded-entries'] })
    },
  })
}
