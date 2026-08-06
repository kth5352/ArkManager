import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from '../i18n/useTranslation'
import { groupMovesByOriginalParent } from '../lib/groupMovesByOriginalParent'
import { useLastMoveStore } from '../stores/lastMoveStore'
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

export type MoveEntriesMutation = UseMutationResult<
  MoveResultDto[],
  Error,
  { paths: string[]; destDir: string }
>

// Exported so AppLayout.tsx's global Ctrl+Z listener can trigger the same
// undo the success toast's own action button does - both need a live
// `moveEntries` mutation instance to actually perform the reverse move
// through, since undo is itself just another move. Reads the store at call
// time (not from a captured closure) so it always undoes whatever the most
// recent move actually was, regardless of which toast/listener triggers it.
export function performUndo(moveEntries: MoveEntriesMutation): void {
  const lastMove = useLastMoveStore.getState().lastMove
  if (!lastMove) return
  for (const group of groupMovesByOriginalParent(lastMove)) {
    moveEntries.mutate({ paths: group.paths, destDir: group.destDir })
  }
}

export function useMoveEntries(): MoveEntriesMutation {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const mutation: MoveEntriesMutation = useMutation({
    mutationFn: ({
      paths,
      destDir,
    }: {
      paths: string[]
      destDir: string
    }): Promise<MoveResultDto[]> => window.api.fileOps.moveEntries(paths, destDir),
    onSuccess: (results) => {
      // Paths changed (and possibly a code link / favorite-rating-memo-
      // playtime row moved with them) - the same invalidation rename/delete
      // already do is enough here too.
      queryClient.invalidateQueries({ queryKey: ['games'] })
      queryClient.invalidateQueries({ queryKey: ['game-user-data'] })
      invalidateFolderScans(queryClient)

      // Fires for every successful move regardless of entry point - drag-
      // and-drop, the right-click Move dialog, or the multi-select
      // toolbar's batch move - since this hook's onSuccess is the one place
      // all three funnel through. MoveDialog's own per-item results screen
      // is unchanged and still shown for that entry point; this toast is an
      // additional, lighter-weight confirmation that also carries the undo
      // affordance.
      const moved = results.flatMap((r) =>
        r.success && r.newPath ? [{ path: r.path, newPath: r.newPath }] : []
      )
      if (moved.length > 0) {
        useLastMoveStore.getState().setLastMove(moved)
        toast.success(t('fileOps.movedToast', { count: moved.length }), {
          action: { label: t('fileOps.undo'), onClick: () => performUndo(mutation) },
        })
      }

      const failedCount = results.filter((r) => !r.success).length
      if (failedCount > 0) {
        toast.error(t('fileOps.moveFailedToast', { count: failedCount }))
      }
    },
  })
  return mutation
}
