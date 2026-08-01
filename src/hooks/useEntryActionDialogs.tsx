import { useState, type JSX } from 'react'
import { RenameDialog } from '../components/game/RenameDialog'
import { DeleteConfirmDialog } from '../components/game/DeleteConfirmDialog'
import { MoveDialog } from '../components/game/MoveDialog'
import type { ScannedEntry } from '../../shared/types/scanner'

type DialogState = { type: 'rename' | 'move' | 'delete'; entry: ScannedEntry } | null

// Rename/move/delete dialogs for a single entry, triggered from a
// right-click menu - rendered once here at the page level rather than
// inside whichever row/card component opened them, since Gallery/List/
// DetailList all virtualize their rows with react-window, which can
// recycle (unmount) a row mid-dialog if the user scrolls. A dialog owned by
// the page instead survives that.
export function useEntryActionDialogs(): {
  dialogElement: JSX.Element
  openRename: (entry: ScannedEntry) => void
  openMove: (entry: ScannedEntry) => void
  openDelete: (entry: ScannedEntry) => void
} {
  const [dialog, setDialog] = useState<DialogState>(null)
  const close = (): void => setDialog(null)

  return {
    openRename: (entry) => setDialog({ type: 'rename', entry }),
    openMove: (entry) => setDialog({ type: 'move', entry }),
    openDelete: (entry) => setDialog({ type: 'delete', entry }),
    dialogElement: (
      <>
        <RenameDialog
          key={dialog?.type === 'rename' ? dialog.entry.path : 'closed'}
          targets={dialog?.type === 'rename' ? [dialog.entry] : []}
          onClose={close}
        />
        <MoveDialog
          key={dialog?.type === 'move' ? dialog.entry.path : 'closed'}
          targets={dialog?.type === 'move' ? [dialog.entry] : []}
          onClose={close}
        />
        <DeleteConfirmDialog
          key={dialog?.type === 'delete' ? dialog.entry.path : 'closed'}
          targets={dialog?.type === 'delete' ? [dialog.entry] : []}
          onClose={close}
        />
      </>
    ),
  }
}
