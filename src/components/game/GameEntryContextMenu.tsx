import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../ui/context-menu'
import { useOpenExternal, useShowItemInFolder } from '../../services/shellService'
import { useCrawlGameMetadata } from '../../services/metadataService'
import { useLaunchGame } from '../../services/launchService'
import {
  useGameUserData,
  useToggleCleared,
  useToggleFavorite,
} from '../../services/gameUserDataService'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { isMediaFile } from '../../../shared/isMediaFile'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface GameEntryContextMenuProps {
  entry: ScannedEntry
  onOpenDetail: (entry: ScannedEntry) => void
  // Explorer-only (folders navigate via tabs there) - Gallery/List/
  // DetailList have no tab concept, so this is simply omitted for them.
  onOpenInNewTab?: (entry: ScannedEntry) => void
  // Gallery/List/DetailList-only - Explorer stays a raw, unfiltered
  // filesystem browser, so its own usage never passes this and the item
  // below never renders there.
  onExclude?: (entry: ScannedEntry) => void
  onRename: (entry: ScannedEntry) => void
  onMove: (entry: ScannedEntry) => void
  onDelete: (entry: ScannedEntry) => void
}

// Shared right-click menu for a single game/file entry, used by Gallery,
// List, DetailList, and Explorer alike so every page offers the same
// organically-connected set of actions instead of Explorer alone having
// one. Delete/rename/move are wired to callbacks rather than owning dialog
// state themselves - see useEntryActionDialogs for why (react-window row
// recycling).
export function GameEntryContextMenu({
  entry,
  onOpenDetail,
  onOpenInNewTab,
  onExclude,
  onRename,
  onMove,
  onDelete,
}: GameEntryContextMenuProps) {
  const { t } = useTranslation()
  const openExternal = useOpenExternal()
  const showItemInFolder = useShowItemInFolder()
  const crawlMetadata = useCrawlGameMetadata()
  const launchGame = useLaunchGame()
  const { data: userData } = useGameUserData(entry)
  const toggleFavorite = useToggleFavorite()
  const toggleCleared = useToggleCleared()
  const playNow = useMediaPlayerStore((s) => s.playNow)
  const addToPlaylist = useMediaPlayerStore((s) => s.addToPlaylist)

  const isMedia = entry.kind === 'file' && isMediaFile(entry.name)

  return (
    <ContextMenuContent>
      {isMedia && (
        <>
          <ContextMenuItem onSelect={() => playNow({ path: entry.path, name: entry.name })}>
            {t('game.playNow')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => addToPlaylist([{ path: entry.path, name: entry.name }])}>
            {t('media.addToPlaylist')}
          </ContextMenuItem>
        </>
      )}
      {entry.kind === 'folder' && (
        <ContextMenuItem onSelect={() => launchGame.mutate(entry)}>
          {t('game.launch')}
        </ContextMenuItem>
      )}
      {entry.code && (
        <ContextMenuItem onSelect={() => entry.code && openExternal.mutate(entry.code)}>
          {t('game.openWeb')}
        </ContextMenuItem>
      )}
      {onOpenInNewTab && entry.kind === 'folder' && (
        <ContextMenuItem onSelect={() => onOpenInNewTab(entry)}>
          {t('explorer.openInNewTab')}
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() => showItemInFolder.mutate(entry.path)}>
        {t('explorer.openInOsExplorer')}
      </ContextMenuItem>
      {entry.code && (
        <>
          <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.code?.value ?? '')}>
            {t('explorer.copyRjNumber')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.name)}>
            {t('explorer.copyTitle')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => entry.code && crawlMetadata.mutate(entry.code)}>
            {t('game.refreshMetadata')}
          </ContextMenuItem>
        </>
      )}
      {!entry.code && entry.kind === 'folder' && (
        <ContextMenuItem onSelect={() => onOpenDetail(entry)}>
          {t('codeLink.dialogTitle')}
        </ContextMenuItem>
      )}
      <ContextMenuItem
        onSelect={() =>
          toggleFavorite.mutate({ entry, isFavorite: !(userData?.isFavorite ?? false) })
        }
      >
        {userData?.isFavorite ? t('explorer.unfavorite') : t('explorer.favorite')}
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => toggleCleared.mutate({ entry, isCleared: !(userData?.isCleared ?? false) })}
      >
        {userData?.isCleared ? t('explorer.unmarkCleared') : t('explorer.markCleared')}
      </ContextMenuItem>
      {onExclude && (
        <ContextMenuItem onSelect={() => onExclude(entry)}>
          {t('exclude.excludeFromView')}
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() => onOpenDetail(entry)}>{t('game.ratingMemo')}</ContextMenuItem>
      <ContextMenuItem onSelect={() => onRename(entry)}>{t('selection.rename')}</ContextMenuItem>
      <ContextMenuItem onSelect={() => onMove(entry)}>{t('selection.move')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => onDelete(entry)} className="text-destructive">
        {t('common.delete')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
