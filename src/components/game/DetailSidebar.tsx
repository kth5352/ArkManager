import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Clock, X } from 'lucide-react'
import { Button } from '../ui/button'
import { GameThumbnail } from './GameThumbnail'
import { RatingMemoSection } from './RatingMemoSection'
import { LaunchConfigSection } from './LaunchConfigSection'
import { LaunchConfigDialog } from './LaunchConfigDialog'
import { CodeLinkSection } from './CodeLinkSection'
import { useOpenExternal, useShowItemInFolder } from '../../services/shellService'
import { useLaunchGame } from '../../services/launchService'
import { useGameUserData } from '../../services/gameUserDataService'
import { useCrawlGameMetadata, useGameMetadata } from '../../services/metadataService'
import { formatPlaytime } from '../../pages/RecentlyPlayed/formatPlaytime'
import { useSetSidebarWidthMutation, useSidebarWidthQuery } from '../../services/settingsService'
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from '../../lib/clampSidebarWidth'
import { IndeterminateProgressBar } from '../ui/progress-bar'
import { isNoLaunchConfigError } from '../../../shared/launchErrors'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface DetailSidebarProps {
  game: ScannedEntry | null
  onClose: () => void
}

export function DetailSidebar({ game, onClose }: DetailSidebarProps) {
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
  // A failed launch (no saved config yet) opens the centered modal dialog
  // instead of expanding LaunchConfigSection inline - more discoverable/less
  // easy to miss than an inline section quietly expanding somewhere in an
  // already-scrolled sidebar. Not reset via a path-tracking hook the way
  // launchConfigExpanded's old auto-expand-on-failure used to need - the
  // dialog itself is keyed by game identity below, which unmounts (closes)
  // it on any game switch.
  const [configuringLaunch, setConfiguringLaunch] = useState(false)

  if (persistedWidth !== syncedWidth) {
    setSyncedWidth(persistedWidth)
    if (persistedWidth !== undefined) setWidth(persistedWidth)
  }

  const handleLaunch = (): void => {
    if (!game) return
    launchGame.mutate(game, {
      onError: (error) => {
        if (isNoLaunchConfigError(error)) setConfiguringLaunch(true)
      },
    })
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
    const handlePointerUp = (): void => {
      target.removeEventListener('pointermove', handlePointerMove)
      target.removeEventListener('pointerup', handlePointerUp)
      setSidebarWidth.mutate(latestWidth)
    }

    target.addEventListener('pointermove', handlePointerMove)
    target.addEventListener('pointerup', handlePointerUp)
  }

  if (!game) return null

  // Keyed on the INNER returned div, not on this hook's <DetailSidebar>
  // element itself (see useGameDetailSidebar) - that distinction matters:
  // this component's own hooks (width, drag state) must persist across a
  // game switch (the sidebar shouldn't snap back to a different width just
  // because the user clicked a different card), while everything rendered
  // inside - RatingMemoSection/LaunchConfigSection/CodeLinkSection's local
  // state (rating draft, memo draft, expanded/collapsed, confirm steps) -
  // should reset per game. Keying only the inner tree gives both at once.
  return (
    <div
      key={game.path}
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col overflow-y-auto border-l border-border bg-card"
    >
      <div
        onPointerDown={handleResizePointerDown}
        className="absolute left-0 top-0 z-20 h-full w-1 cursor-col-resize hover:bg-primary/40"
      />
      <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-border bg-card p-4">
        <p className="text-sm font-medium">{game.name}</p>
        <button
          aria-label="상세 패널 닫기"
          onClick={onClose}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="aspect-[3/4] w-full overflow-hidden rounded-md bg-muted">
          <GameThumbnail entry={game} />
        </div>
        {metadata?.title && metadata.title !== game.name && (
          <p className="text-sm text-muted-foreground">{metadata.title}</p>
        )}
        {game.code ? (
          <button
            className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => game.code && openExternal.mutate(game.code)}
          >
            작품번호: {game.code.value}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">코드없음</p>
        )}
        {!!userData?.totalPlaytimeMs && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            플레이타임: {formatPlaytime(userData.totalPlaytimeMs)}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {game.code && (
            <Button size="sm" onClick={() => game.code && openExternal.mutate(game.code)}>
              DLsite 열기
            </Button>
          )}
          {game.code && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => game.code && crawlMetadata.mutate(game.code)}
              disabled={crawlMetadata.isPending}
            >
              메타데이터 새로고침
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => showItemInFolder.mutate(game.path)}>
            폴더 열기
          </Button>
          {game.kind === 'folder' && (
            <Button size="sm" variant="secondary" onClick={handleLaunch}>
              실행
            </Button>
          )}
        </div>
        {crawlMetadata.isPending && (
          <div className="flex flex-col gap-1">
            <IndeterminateProgressBar />
            <p className="text-xs text-muted-foreground">메타데이터 가져오는 중...</p>
          </div>
        )}
        <RatingMemoSection game={game} />
        <LaunchConfigSection game={game} />
        <CodeLinkSection game={game} />
      </div>
      <LaunchConfigDialog
        key={configuringLaunch ? game.path : 'closed'}
        entry={configuringLaunch ? game : null}
        onClose={() => setConfiguringLaunch(false)}
      />
    </div>
  )
}
