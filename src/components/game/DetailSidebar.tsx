import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Clock, ImagePlus, RefreshCw, X } from 'lucide-react'
import { Button } from '../ui/button'
import { HoverTooltip } from '../ui/hover-tooltip'
import { GameThumbnail } from './GameThumbnail'
import { RatingMemoSection } from './RatingMemoSection'
import { LaunchConfigSection } from './LaunchConfigSection'
import { LaunchConfigDialog } from './LaunchConfigDialog'
import { SaveDataSection } from './SaveDataSection'
import { CodeLinkSection } from './CodeLinkSection'
import { CustomCoverSection } from './CustomCoverSection'
import { RenameDialog } from './RenameDialog'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { MoveDialog } from './MoveDialog'
import { useOpenExternal, useShowItemInFolder } from '../../services/shellService'
import { useLaunchGame } from '../../services/launchService'
import {
  useGameUserData,
  usePickCustomCoverFile,
  useSetCustomCoverFromFile,
  useToggleCleared,
} from '../../services/gameUserDataService'
import { useCrawlGameMetadata, useGameMetadata } from '../../services/metadataService'
import { formatPlaytime } from '../../pages/RecentlyPlayed/formatPlaytime'
import { useSetSidebarWidthMutation, useSidebarWidthQuery } from '../../services/settingsService'
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from '../../lib/clampSidebarWidth'
import { IndeterminateProgressBar } from '../ui/progress-bar'
import { useTranslation } from '../../i18n/useTranslation'
import { isNoLaunchConfigError } from '../../../shared/launchErrors'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface DetailSidebarProps {
  game: ScannedEntry | null
  onClose: () => void
  onFilterByGenre?: (genre: string) => void
}

export function DetailSidebar({ game, onClose, onFilterByGenre }: DetailSidebarProps) {
  const { t } = useTranslation()
  const { data: persistedWidth } = useSidebarWidthQuery()
  const setSidebarWidth = useSetSidebarWidthMutation()
  const [width, setWidth] = useState(persistedWidth ?? SIDEBAR_WIDTH_DEFAULT)
  const [syncedWidth, setSyncedWidth] = useState(persistedWidth)
  const openExternal = useOpenExternal()
  const showItemInFolder = useShowItemInFolder()
  const launchGame = useLaunchGame()
  const crawlMetadata = useCrawlGameMetadata()
  const { data: metadata } = useGameMetadata(game?.code ?? null)
  const { data: userData } = useGameUserData(game ?? { code: null, path: '' })
  const pickCoverFile = usePickCustomCoverFile()
  const setCoverFromFile = useSetCustomCoverFromFile()
  const toggleCleared = useToggleCleared()
  // A failed launch (no saved config yet) opens the centered modal dialog
  // instead of expanding LaunchConfigSection inline - more discoverable/less
  // easy to miss than an inline section quietly expanding somewhere in an
  // already-scrolled sidebar. Reset on a game switch by the syncedGamePath
  // check below - the dialog's own key={game.path} changing on its own
  // isn't enough (it only unmounts and remounts already-open, immediately
  // retargeted at the new game, a real bug found this same way for
  // dialogMode - see that check's own comment).
  const [configuringLaunch, setConfiguringLaunch] = useState(false)
  const [dialogMode, setDialogMode] = useState<'rename' | 'delete' | 'move' | null>(null)
  const [syncedGamePath, setSyncedGamePath] = useState(game?.path)

  if (persistedWidth !== syncedWidth) {
    setSyncedWidth(persistedWidth)
    if (persistedWidth !== undefined) setWidth(persistedWidth)
  }

  // dialogMode/configuringLaunch live in this component's own state, above
  // the game.path-keyed inner div (see the comment below on why that's
  // deliberate for width/drag state) - so switching to a different game
  // does NOT unmount this component and doesn't reset them for free. Without
  // this, opening the rename dialog for one entry then selecting a
  // different one immediately re-opened the (now retargeted) rename dialog
  // for the new entry, since dialogMode was still 'rename'.
  if (game?.path !== syncedGamePath) {
    setSyncedGamePath(game?.path)
    setConfiguringLaunch(false)
    setDialogMode(null)
  }

  const handleLaunch = (): void => {
    if (!game) return
    launchGame.mutate(game, {
      onError: (error) => {
        if (isNoLaunchConfigError(error)) setConfiguringLaunch(true)
      },
    })
  }

  const handleClickCover = async (): Promise<void> => {
    if (!game || game.code || pickCoverFile.isPending) return
    const sourcePath = await pickCoverFile.mutateAsync()
    if (!sourcePath) return
    setCoverFromFile.mutate({ entry: game, sourcePath })
  }

  useEffect(() => {
    if (!game) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return // 입력 중엔 무시
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [game, onClose])

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = width
    let latestWidth = startWidth

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      latestWidth = clampSidebarWidth(startWidth + (startX - moveEvent.clientX))
      setWidth(latestWidth)
    }
    // pointercancel (an OS-level gesture interruption, window blur mid-drag,
    // etc.) needs the same cleanup as a normal pointerup - without it, these
    // listeners stayed attached to `target` forever, silently misfiring
    // (with a stale startX/startWidth from the abandoned drag) the next
    // time the user so much as hovered the thin resize handle.
    const finishDrag = (): void => {
      target.removeEventListener('pointermove', handlePointerMove)
      target.removeEventListener('pointerup', finishDrag)
      target.removeEventListener('pointercancel', finishDrag)
      setSidebarWidth.mutate(latestWidth)
    }

    target.addEventListener('pointermove', handlePointerMove)
    target.addEventListener('pointerup', finishDrag)
    target.addEventListener('pointercancel', finishDrag)
  }

  if (!game) return null

  // Keyed on the INNER returned div, not on this hook's <DetailSidebar>
  // element itself (see useGameDetailSidebar) - that distinction matters:
  // this component's own hooks (width, drag state) must persist across a
  // game switch (the sidebar shouldn't snap back to a different width just
  // because the user clicked a different card), while everything rendered
  // inside - RatingMemoSection/LaunchConfigSection/SaveDataSection/
  // CodeLinkSection's local
  // state (rating draft, memo draft, expanded/collapsed, confirm steps) -
  // should reset per game. Keying only the inner tree gives both at once.
  const canChangeCover = !game.code

  return (
    <motion.div
      key={game.path}
      style={{ width }}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="relative flex h-full shrink-0 flex-col overflow-y-auto border-l border-border bg-card"
    >
      <div
        onPointerDown={handleResizePointerDown}
        className="absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize hover:bg-primary/40"
      />
      <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-border bg-card p-4">
        <p className="text-sm font-medium">{game.name}</p>
        <button
          aria-label={t('game.closeSidebar')}
          onClick={onClose}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div
          onClick={canChangeCover ? handleClickCover : undefined}
          className={`group relative aspect-[3/4] w-full overflow-hidden rounded-md bg-muted ${canChangeCover ? 'cursor-pointer' : ''}`}
        >
          <GameThumbnail entry={game} />
          {canChangeCover && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <ImagePlus className="h-6 w-6" />
              <span className="px-2 text-center text-xs">{t('customCover.clickToChange')}</span>
            </div>
          )}
          <button
            type="button"
            aria-label={t('game.toggleCleared')}
            onClick={(e) => {
              e.stopPropagation()
              toggleCleared.mutate({ entry: game, isCleared: !(userData?.isCleared ?? false) })
            }}
            className="absolute right-2 top-2 z-10 rounded-full bg-background/70 p-1 text-muted-foreground hover:text-foreground"
          >
            <CheckCircle2
              className={`h-5 w-5 ${userData?.isCleared ? 'text-green-500' : ''}`}
              fill={userData?.isCleared ? 'currentColor' : 'none'}
            />
          </button>
        </div>
        {metadata?.title && metadata.title !== game.name && (
          <p className="text-sm text-muted-foreground">{metadata.title}</p>
        )}
        {game.code ? (
          <button
            className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => game.code && openExternal.mutate(game.code)}
          >
            {t('game.codeNumber', { code: game.code.value })}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">{t('game.noCode')}</p>
        )}
        {!!userData?.totalPlaytimeMs && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {t('game.playtime', { time: formatPlaytime(userData.totalPlaytimeMs, t) })}
          </div>
        )}
        {!!metadata?.genres?.length && (
          <div className="flex flex-wrap gap-1">
            {metadata.genres.map((genre) => (
              <button
                key={genre}
                onClick={() => onFilterByGenre?.(genre)}
                disabled={!onFilterByGenre}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground enabled:hover:bg-accent"
              >
                {genre}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {game.kind === 'folder' && (
            <Button
              size="sm"
              variant="outline"
              className="w-full bg-green-600 text-white hover:bg-green-600/90 hover:text-white"
              onClick={handleLaunch}
            >
              {t('game.launch')}
            </Button>
          )}
          <div className="flex gap-2">
            {game.code && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => game.code && openExternal.mutate(game.code)}
              >
                {t('game.openWeb')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => showItemInFolder.mutate(game.path)}
            >
              {t('game.openFolder')}
            </Button>
            {game.code && (
              <HoverTooltip content={t('game.refreshMetadata')} className="flex-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => game.code && crawlMetadata.mutate(game.code)}
                  disabled={crawlMetadata.isPending}
                  aria-label={t('game.refreshMetadata')}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </HoverTooltip>
            )}
          </div>
          <div className="border-t border-border" />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => setDialogMode('rename')}
            >
              {t('selection.rename')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => setDialogMode('move')}
            >
              {t('selection.move')}
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDialogMode('delete')}
          >
            {t('common.delete')}
          </Button>
        </div>
        {crawlMetadata.isPending && (
          <div className="flex flex-col gap-1">
            <IndeterminateProgressBar />
            <p className="text-xs text-muted-foreground">{t('game.fetchingMetadata')}</p>
          </div>
        )}
        <CustomCoverSection game={game} hasCustomCover={!!userData?.customCoverPath} />
        <RatingMemoSection game={game} />
        <LaunchConfigSection game={game} />
        <SaveDataSection game={game} />
        <CodeLinkSection game={game} />
      </div>
      <LaunchConfigDialog
        key={configuringLaunch ? game.path : 'closed'}
        entry={configuringLaunch ? game : null}
        onClose={() => setConfiguringLaunch(false)}
        autoLaunchOnSave
      />
      <RenameDialog
        key={dialogMode === 'rename' ? game.path : 'closed'}
        targets={dialogMode === 'rename' ? [game] : []}
        onClose={() => setDialogMode(null)}
      />
      <DeleteConfirmDialog
        key={dialogMode === 'delete' ? game.path : 'closed'}
        targets={dialogMode === 'delete' ? [game] : []}
        onClose={() => setDialogMode(null)}
      />
      <MoveDialog
        key={dialogMode === 'move' ? game.path : 'closed'}
        targets={dialogMode === 'move' ? [game] : []}
        onClose={() => setDialogMode(null)}
      />
    </motion.div>
  )
}
