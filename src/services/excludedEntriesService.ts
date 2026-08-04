import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'
import type { ExcludedEntryDto } from '../../shared/types/ipc'

export function useExcludedEntries() {
  return useQuery<ExcludedEntryDto[]>({
    queryKey: ['excluded-entries'],
    queryFn: () => window.api.gameEntry.listExcluded(),
  })
}

// Path-only, deliberately not entry.code - excluding hides this specific
// file/folder, not every entry sharing its code (see isEntryExcluded's own
// comment for why keying by code would be wrong here).
export function useExcludeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entry: Pick<ScannedEntry, 'path' | 'name'>) =>
      window.api.gameEntry.exclude(entry.path, entry.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['excluded-entries'] })
    },
  })
}

export function useRestoreEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (path: string) => window.api.gameEntry.restore(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['excluded-entries'] })
    },
  })
}
