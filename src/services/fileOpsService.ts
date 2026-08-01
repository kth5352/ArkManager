import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DeleteResultDto, MoveResultDto, RenameResultDto } from '../../shared/types/ipc'

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

export function usePickMoveDestination() {
  return useMutation({
    mutationFn: (): Promise<string | null> => window.api.fileOps.pickMoveDestination(),
  })
}

export function useMoveEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      paths,
      destDir,
    }: {
      paths: string[]
      destDir: string
    }): Promise<MoveResultDto[]> => window.api.fileOps.moveEntries(paths, destDir),
    onSuccess: () => {
      // Paths changed (and possibly a code link / favorite-rating-memo-
      // playtime row moved with them) - the same invalidation rename/delete
      // already do is enough here too.
      queryClient.invalidateQueries({ queryKey: ['games'] })
      queryClient.invalidateQueries({ queryKey: ['game-user-data'] })
    },
  })
}
