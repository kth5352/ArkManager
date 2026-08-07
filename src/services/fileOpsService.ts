import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from '../i18n/useTranslation'
import { groupMovesByOriginalParent } from '../lib/groupMovesByOriginalParent'
import { useLastMoveStore } from '../stores/lastMoveStore'
import type { DeleteResultDto, MoveResultDto, RenameResultDto } from '../../shared/types/ipc'

// invalidateQueries matches query-key prefixes, so this updates every cached
// Explorer folder as well as the aggregate library listing without reloading
// the renderer and interrupting media playback.
export function invalidateFileListQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['games'] })
  queryClient.invalidateQueries({ queryKey: ['folder-scan'] })
  queryClient.invalidateQueries({ queryKey: ['folder-scan-recursive'] })
}

export function useRenameEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (renames: { path: string; newName: string }[]): Promise<RenameResultDto[]> =>
      window.api.fileOps.renameEntries(renames),
    onSuccess: () => {
      invalidateFileListQueries(queryClient)
    },
  })
}

export function useDeleteEntries() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (paths: string[]): Promise<DeleteResultDto[]> =>
      window.api.fileOps.deleteEntries(paths),
    onSuccess: () => {
      invalidateFileListQueries(queryClient)
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
      invalidateFileListQueries(queryClient)
      queryClient.invalidateQueries({ queryKey: ['game-user-data'] })

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
