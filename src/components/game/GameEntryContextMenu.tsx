import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '../ui/context-menu'
import { useOpenExternal, useOpenPath, useShowItemInFolder } from '../../services/shellService'
import { useCrawlGameMetadata } from '../../services/metadataService'
import { useLaunchGame } from '../../services/launchService'
import {
  useGameUserData,
  useToggleCleared,
  useToggleFavorite,
} from '../../services/gameUserDataService'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { getExplorerEntryCapabilities } from '../../lib/explorerEntryCapabilities'
import { isAsmrPlayableFolder } from '../../lib/asmrMediaCapability'
import { usePlayAsmrFolder } from '../../hooks/usePlayAsmrFolder'
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
  // All 4 pages pass this - optional only so the prop can be threaded down
  // the same page-owns-the-dialog-state path as onExclude/onOpenInNewTab
  // (see useEntryActionDialogs' own comment on why dialogs live at the page
  // level, not inside a react-window-recycled row/card). Appends to a
  // persistent named playlist, distinct from addToPlaylist below (the
  // ephemeral session queue).
  onAddToSavedPlaylist?: (tracks: { path: string; name: string }[]) => void
  // Crawled DLsite work_type code for this entry's code, if any (null when
  // uncrawled/unknown/no code) - drives the 실행->재생 swap via
  // isAsmrPlayableFolder. Each page reads this from its own already-fetched
  // useGameMetadataMany result (all 4 pages already call it for other
  // fields like genres).
  workType: string | null
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
  onAddToSavedPlaylist,
  workType,
  onRename,
  onMove,
  onDelete,
}: GameEntryContextMenuProps) {
  const { t } = useTranslation()
  const openExternal = useOpenExternal()
  const openPath = useOpenPath()
  const showItemInFolder = useShowItemInFolder()
  const crawlMetadata = useCrawlGameMetadata()
  const launchGame = useLaunchGame()
  const { data: userData } = useGameUserData(entry)
  const toggleFavorite = useToggleFavorite()
  const toggleCleared = useToggleCleared()
  const playNow = useMediaPlayerStore((s) => s.playNow)
  const addToPlaylist = useMediaPlayerStore((s) => s.addToPlaylist)

  const capabilities = getExplorerEntryCapabilities(entry)
  const isAsmrMedia = isAsmrPlayableFolder(entry, entry.code ?? null, workType)
  const playAsmrFolder = usePlayAsmrFolder()

  return (
    <ContextMenuContent>
      {capabilities.canPlayMedia && (
        <>
          <ContextMenuItem onSelect={() => playNow({ path: entry.path, name: entry.name })}>
            {t('game.playNow')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => addToPlaylist([{ path: entry.path, name: entry.name }])}>
            {t('media.addToPlaylist')}
          </ContextMenuItem>
          {onAddToSavedPlaylist && (
            <ContextMenuItem
              onSelect={() => onAddToSavedPlaylist([{ path: entry.path, name: entry.name }])}
            >
              {t('media.addToSavedPlaylist')}
            </ContextMenuItem>
          )}
        </>
      )}
      {capabilities.canDirectLaunchFile && (
        <ContextMenuItem onSelect={() => openPath.mutate(entry.path)}>
          {t('game.launch')}
        </ContextMenuItem>
      )}
      {entry.kind === 'folder' && isAsmrMedia && (
        <ContextMenuItem onSelect={() => void playAsmrFolder(entry.path)}>
          {t('game.play')}
        </ContextMenuItem>
      )}
      {entry.kind === 'folder' && !isAsmrMedia && (
        <ContextMenuItem onSelect={() => launchGame.mutate(entry)}>
          {t('game.launch')}
        </ContextMenuItem>
      )}
      {capabilities.canManageGameData && entry.code && (
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
      {capabilities.canManageGameData && entry.code && (
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
      {capabilities.canManageGameData && !entry.code && (
        <ContextMenuItem onSelect={() => onOpenDetail(entry)}>
          {t('codeLink.dialogTitle')}
        </ContextMenuItem>
      )}
      {capabilities.canManageGameData && (
        <>
          <ContextMenuItem
            onSelect={() =>
              toggleFavorite.mutate({ entry, isFavorite: !(userData?.isFavorite ?? false) })
            }
          >
            {userData?.isFavorite ? t('explorer.unfavorite') : t('explorer.favorite')}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              toggleCleared.mutate({ entry, isCleared: !(userData?.isCleared ?? false) })
            }
          >
            {userData?.isCleared ? t('explorer.unmarkCleared') : t('explorer.markCleared')}
          </ContextMenuItem>
        </>
      )}
      {onExclude && (
        <ContextMenuItem onSelect={() => onExclude(entry)}>
          {t('exclude.excludeFromView')}
        </ContextMenuItem>
      )}
      {capabilities.canManageGameData && (
        <ContextMenuItem onSelect={() => onOpenDetail(entry)}>
          {t('game.ratingMemo')}
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={() => onRename(entry)}>{t('selection.rename')}</ContextMenuItem>
      <ContextMenuItem onSelect={() => onMove(entry)}>{t('selection.move')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => onDelete(entry)} className="text-destructive">
        {t('common.delete')}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
