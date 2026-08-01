import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DeleteResultDto, RenameResultDto } from '../../shared/types/ipc'

export function useRenameEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (renames: { path: string; newName: string }[]): Promise<RenameResultDto[]> =>
      window.api.fileOps.renameEntries(renames),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
    },
  })
}

export function useDeleteEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (paths: string[]): Promise<DeleteResultDto[]> =>
      window.api.fileOps.deleteEntries(paths),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
    },
  })
}
