import { useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { useExcludedEntries, useRestoreEntry } from '../../services/excludedEntriesService'
import { useExcludedEntriesDialogStore } from '../../stores/excludedEntriesDialogStore'
import { useTranslation } from '../../i18n/useTranslation'

// Mounted once in AppLayout (matching MediaPlayerHost/BulkCrawlProgressBanner's
// own always-mounted-but-usually-renders-little pattern) - has no visible
// trigger of its own anywhere in the UI, only the View menu's "제외 항목
// 관리..." item opens it, via the MENU_OPEN_EXCLUDED_ENTRIES_DIALOG push
// channel below.
export function ExcludedEntriesDialog() {
  const { t } = useTranslation()
  const isOpen = useExcludedEntriesDialogStore((s) => s.isOpen)
  const open = useExcludedEntriesDialogStore((s) => s.open)
  const close = useExcludedEntriesDialogStore((s) => s.close)
  const { data: excludedEntries } = useExcludedEntries()
  const restoreEntry = useRestoreEntry()

  useEffect(() => {
    return window.api.gameEntry.onOpenExcludedEntriesDialog(() => open())
  }, [open])

  return (
    <Dialog open={isOpen} onOpenChange={(next) => (next ? open() : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('exclude.dialogTitle')}</DialogTitle>
        </DialogHeader>
        {!excludedEntries || excludedEntries.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {t('exclude.empty')}
          </div>
        ) : (
          <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {excludedEntries.map((entry) => (
              <div
                key={entry.key}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                {entry.keyType === 'code' && (
                  <span className="shrink-0 truncate text-xs text-muted-foreground">
                    {entry.key}
                  </span>
                )}
                <Button variant="outline" size="sm" onClick={() => restoreEntry.mutate(entry.key)}>
                  {t('exclude.restore')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
