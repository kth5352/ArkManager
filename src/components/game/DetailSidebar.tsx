import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '../ui/button'
import { GameThumbnail } from './GameThumbnail'
import { RatingMemoSection } from './RatingMemoSection'
import { LaunchConfigSection } from './LaunchConfigSection'
import { CodeLinkSection } from './CodeLinkSection'
import { useOpenExternal } from '../../services/shellService'
import { useLaunchGame } from '../../services/launchService'
import { useCrawlGameMetadata } from '../../services/metadataService'
import { useSetSidebarWidthMutation, useSidebarWidthQuery } from '../../services/settingsService'
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from '../../lib/clampSidebarWidth'
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
  const launchGame = useLaunchGame()
  const crawlMetadata = useCrawlGameMetadata()
  const [launchConfigExpanded, setLaunchConfigExpanded] = useState(false)
  const [launchConfigExpandedForPath, setLaunchConfigExpandedForPath] = useState(game?.path)

  if (persistedWidth !== syncedWidth) {
    setSyncedWidth(persistedWidth)
    if (persistedWidth !== undefined) setWidth(persistedWidth)
  }

  // Resets to collapsed on every game switch, same as LaunchConfigSection's
  // other local state would if this lived there - it's lifted up here only
  // so handleLaunch (below) can force it open when a launch attempt fails
  // for lack of a saved config.
  if (game?.path !== launchConfigExpandedForPath) {
    setLaunchConfigExpandedForPath(game?.path)
    setLaunchConfigExpanded(false)
  }

  const handleLaunch = (): void => {
    if (!game) return
    launchGame.mutate(game, {
      onError: (error) => {
        if (isNoLaunchConfigError(error)) setLaunchConfigExpanded(true)
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
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-primary/40"
      />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium">{game.name}</p>
          <button
            aria-label="상세 패널 닫기"
            onClick={onClose}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="aspect-[3/4] w-full overflow-hidden rounded-md bg-muted">
          <GameThumbnail entry={game} />
        </div>
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
          <Button
            size="sm"
            variant="secondary"
            onClick={() => console.log('open folder', game.path)}
          >
            폴더 열기
          </Button>
          {game.kind === 'folder' && (
            <Button size="sm" variant="secondary" onClick={handleLaunch}>
              실행
            </Button>
          )}
        </div>
        <RatingMemoSection game={game} />
        <LaunchConfigSection
          game={game}
          expanded={launchConfigExpanded}
          onExpandedChange={setLaunchConfigExpanded}
        />
        <CodeLinkSection game={game} />
      </div>
    </div>
  )
}
