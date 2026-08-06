import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DeleteResultDto, MoveResultDto, RenameResultDto } from '../../shared/types/ipc'

// Explorer's own folder listing (useFolderScan/useFolderScanRecursive in
// scannerService.ts, queried by ['folder-scan', path]/['folder-scan-recursive',
// path]) is a separate cache from ['games'] (Gallery/List's aggregate view) -
// invalidating only ['games'] left Explorer showing already-renamed/deleted/
// moved entries for as long as useFolderScan's 5-minute staleTime allowed.
// invalidateQueries matches by key PREFIX by default (no `exact: true`), so
// omitting the path segment here invalidates every currently-cached folder,
// not just whichever one happens to be the active Explorer tab right now -
// necessary since a move can affect two folders (source and destination) at
// once, and any other open tab showing either one is just as stale.
function invalidateFolderScans(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: ['folder-scan'] })
  queryClient.invalidateQueries({ queryKey: ['folder-scan-recursive'] })
}

export function useRenameEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (renames: { path: string; newName: string }[]): Promise<RenameResultDto[]> =>
      window.api.fileOps.renameEntries(renames),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      invalidateFolderScans(queryClient)
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
      invalidateFolderScans(queryClient)
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
      invalidateFolderScans(queryClient)
    },
  })
}
