import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useDeleteMediaPlaylist } from '../../services/mediaPlaylistService'
import { useTranslation } from '../../i18n/useTranslation'

interface DeletePlaylistConfirmDialogProps {
  playlist: { id: string; name: string } | null
  onClose: () => void
}

export function DeletePlaylistConfirmDialog({ playlist, onClose }: DeletePlaylistConfirmDialogProps) {
  const { t } = useTranslation()
  const deleteMutation = useDeleteMediaPlaylist()

  const handleConfirm = (): void => {
    if (!playlist) return
    deleteMutation.mutate(playlist.id, { onSuccess: onClose })
  }

  return (
    <Dialog open={playlist !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
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
