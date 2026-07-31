import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useUnlinkCode } from '../../services/gameUserDataService'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface UnlinkCodeDialogProps {
  entry: ScannedEntry | null
  onClose: () => void
}

export function UnlinkCodeDialog({ entry, onClose }: UnlinkCodeDialogProps) {
  const unlinkCode = useUnlinkCode()

  const handleConfirm = (): void => {
    if (!entry) return
    unlinkCode.mutate({ path: entry.path }, { onSuccess: onClose })
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>연동 해제 {entry ? `- ${entry.name}` : ''}</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          <span className="font-medium">{entry?.code?.value}</span> 연동을 해제합니다. 이후 이
          폴더는 다시 코드없는 항목으로 표시됩니다.
        </p>
        <p className="text-xs text-muted-foreground">
          지금까지 쌓인 즐겨찾기·평점·메모·플레이타임 기록은 삭제되지 않고 {entry?.code?.value}{' '}
          코드에 그대로 남습니다. 같은 코드로 다시 연동하면 기록이 복원되지만, 다른 코드로 연동하면
          이 기록을 다시 찾을 수 없게 됩니다.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={unlinkCode.isPending}>
            연동 해제
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
