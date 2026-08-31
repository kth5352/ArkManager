import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useDeleteMediaPlaylist } from '../../services/mediaPlaylistService'
import { useTranslation } from '../../i18n/useTranslation'

interface DeletePlaylistConfirmDialogProps {
  playlist: { id: string; name: string } | null
  onClose: () => void
  // 취소/배경클릭으로도 호출되는 onClose와 달리, 삭제가 실제로 성공했을
  // 때만 호출된다 - PlaylistDetailView가 삭제 성공시에만 상세 화면을
  // 닫도록(closePlaylistDetail) 구분하기 위해 필요.
  onDeleted?: () => void
}

export function DeletePlaylistConfirmDialog({
  playlist,
  onClose,
  onDeleted,
}: DeletePlaylistConfirmDialogProps) {
  const { t } = useTranslation()
  const deleteMutation = useDeleteMediaPlaylist()

  const handleConfirm = (): void => {
    if (!playlist) return
    deleteMutation.mutate(playlist.id, {
      onSuccess: () => {
        onClose()
        onDeleted?.()
      },
    })
  }

  return (
    <Dialog open={playlist !== null} onOpenChange={(open) => !open && onClose()}>
      {/* MediaSidebar renders at a deliberate z-[60] (see its own comment)
          to stay usable during fullscreen playback, which sits above this
          dialog's default Radix z-50 with nothing in between establishing
          an isolating stacking context. Raise both the content and its
          dimming overlay above that so the sidebar can't visually cover
          this dialog's buttons while it's open. */}
      <DialogContent className="z-[70]" overlayClassName="z-[70]">
        <DialogHeader>
          <DialogTitle>{t('media.deletePlaylistConfirmTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {playlist && t('media.deletePlaylistConfirmBody', { name: playlist.name })}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={deleteMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={deleteMutation.isPending}>
            {t('media.deletePlaylist')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
