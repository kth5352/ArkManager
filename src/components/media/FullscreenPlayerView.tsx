import { useEffect, useRef, useState, type ReactNode } from 'react'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import { getActiveLyricLine, type ParsedLyrics } from '../../lib/lrc'
import { cn } from '../../lib/utils'
import { useWindowFullscreen } from '../../hooks/useWindowFullscreen'
import { PlayerControlBands, type ControlBand } from './PlayerControlBands'
import { useAutoHideControls } from './useAutoHideControls'
import { useFullscreenKeys } from './useFullscreenKeys'
import { deriveHoldReasons, lyricsBottomPx } from './playerView'
import type { MediaPlaybackState } from './useMediaPlayback'
import logoUrl from '../../../LOGO.png'

// Width of the detached window's playlist side panel (opened with ☰).
const SIDE_PANEL_WIDTH_PX = 288

interface FullscreenPlayerViewProps {
  canvasRef: (el: HTMLCanvasElement | null) => void
  playback: MediaPlaybackState
  mode: 'overlay' | 'detached'
  // Whether this view is on screen. The overlay stays mounted while
  // minimized (display: none) so the canvas is never torn down; auto-hide
  // and the F/Escape keys only run while it is shown.
  active?: boolean
  onMinimize?: () => void
  onDetach?: () => void
  lyricsEnabled: boolean
  parsedLyrics: ParsedLyrics | null
  onToggleLyrics?: () => void
  subtitlePipOpen: boolean
  topBandExtra?: ReactNode
  // Detached window: content of the right-side panel the ☰ button toggles
  // (closed by default; while open the bands don't auto-hide).
  sidePanel?: ReactNode
  // Overlay: width (px) of the main window's media sidebar while it is open
  // over this view, 0 otherwise. Non-zero also holds the bands open.
  sidebarInset?: number
  // Overlay: ☰ drives the main window's media sidebar instead of sidePanel.
  playlistActive?: boolean
  onTogglePlaylist?: () => void
  playlistLabel: string
  // Real rendered height of the bottom band (layout height, unaffected by
  // the auto-hide fade) - the overlay reports it so MediaSidebar can anchor
  // its bottom edge right above the band.
  onBottomBandHeightChange?: (height: number) => void
}

type PerBand = Record<ControlBand, boolean>
const NO_BANDS: PerBand = { top: false, bottom: false }

// Shared by FullscreenMediaOverlay (main window) and PlayerWindowPage
// (detached window). Video fills the view with mpv's <canvas>; audio keeps
// the resolved thumbnail (or the logo once that 404s). Control bands sit on
// top and hide after AUTO_HIDE_DELAY_MS without activity (spec §3.5).
export function FullscreenPlayerView({
  canvasRef,
  playback,
  mode,
  active = true,
  onMinimize,
  onDetach,
  lyricsEnabled,
  parsedLyrics,
  onToggleLyrics,
  subtitlePipOpen,
  topBandExtra,
  sidePanel,
  sidebarInset = 0,
  playlistActive,
  onTogglePlaylist,
  playlistLabel,
  onBottomBandHeightChange,
}: FullscreenPlayerViewProps) {
  // Rendered unconditionally (only toggled via CSS) so the ref is attached
  // before auto-hide is ever enabled.
  const rootRef = useRef<HTMLDivElement>(null)
  const { fullscreen, toggle, release } = useWindowFullscreen()

  const [pointerOver, setPointerOver] = useState<PerBand>(NO_BANDS)
  const [focusIn, setFocusIn] = useState<PerBand>(NO_BANDS)
  const [dragging, setDragging] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [sidePanelOpen, setSidePanelOpen] = useState(false)

  // Hiding the overlay (display: none) fires no pointerleave/blur, so a
  // hover/focus captured right before minimizing would otherwise pin the
  // bands open the next time it is shown. Adjusted during render.
  const [prevActive, setPrevActive] = useState(active)
  if (prevActive !== active) {
    setPrevActive(active)
    setPointerOver(NO_BANDS)
    setFocusIn(NO_BANDS)
    setDragging(false)
  }

  const sidePanelShown = sidePanel !== undefined && sidePanelOpen
  const contentInsetRight = sidePanelShown ? SIDE_PANEL_WIDTH_PX : sidebarInset

  const hold = deriveHoldReasons({
    pointerOverControls: pointerOver.top || pointerOver.bottom,
    dragging,
    isPlaying: playback.isPlaying,
    sidebarOpen: sidePanelShown || sidebarInset > 0,
    popoverOpen,
    focusInControls: focusIn.top || focusIn.bottom,
  })
  const { visible } = useAutoHideControls({ enabled: active, hold, rootRef })

  useFullscreenKeys(
    { overlayVisible: active, windowFullscreen: active && fullscreen },
    {
      toggleFullscreen: toggle,
      exitFullscreen: () => {
        if (fullscreen) toggle()
      },
    }
  )

  // Same measuring approach FullscreenMediaOverlay always used: the
  // border-box height via getBoundingClientRect (contentRect would drop the
  // band's padding).
  const bottomBandRef = useRef<HTMLDivElement>(null)
  const [bandHeight, setBandHeight] = useState(0)
  useEffect(() => {
    const el = bottomBandRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const height = el.getBoundingClientRect().height
      setBandHeight(height)
      onBottomBandHeightChange?.(height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onBottomBandHeightChange])

  // Tracked by path so a different track doesn't inherit a stale failure.
  const [thumbFailedPath, setThumbFailedPath] = useState<string | null>(null)
  const thumbFailed = thumbFailedPath === playback.track.path

  const handleMinimize =
    mode === 'overlay' && onMinimize
      ? () => {
          // Only ends fullscreen the media UI started (F11 stays).
          release()
          onMinimize()
        }
      : undefined

  const handleTogglePlaylist = (): void => {
    if (sidePanel !== undefined) setSidePanelOpen((open) => !open)
    else onTogglePlaylist?.()
  }

  const onPointerOverChange = (band: ControlBand, over: boolean): void =>
    setPointerOver((prev) => (prev[band] === over ? prev : { ...prev, [band]: over }))
  const onFocusInChange = (band: ControlBand, focused: boolean): void =>
    setFocusIn((prev) => (prev[band] === focused ? prev : { ...prev, [band]: focused }))

  const lyricsStyle = {
    bottom: lyricsBottomPx(visible, bandHeight),
    transition: 'bottom 200ms ease',
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'overflow-hidden bg-black',
        mode === 'overlay' ? 'fixed inset-0 z-50' : 'relative h-screen',
        active ? 'block' : 'hidden'
      )}
    >
      <div
        className="absolute inset-y-0 left-0 flex items-center justify-center"
        style={{ right: contentInsetRight }}
      >
        {playback.isVideo ? (
          <canvas ref={canvasRef} className="h-full w-full object-contain" onDoubleClick={toggle} />
        ) : thumbFailed ? (
          <div className="flex h-32 w-32 items-center justify-center">
            <img src={logoUrl} alt="" className="h-full w-full object-contain opacity-30" />
          </div>
        ) : (
          <img
            src={buildMediaThumbnailUrl(playback.track.path)}
            alt=""
            className="max-h-full max-w-full object-contain"
            draggable={false}
            onError={() => setThumbFailedPath(playback.track.path)}
          />
        )}
        {lyricsEnabled &&
          parsedLyrics?.kind === 'synced' &&
          (() => {
            const activeLine = getActiveLyricLine(parsedLyrics, playback.currentTime)
            return (
              <div
                className="pointer-events-none absolute right-6 left-6 text-center"
                style={lyricsStyle}
              >
                {activeLine?.text && (
                  <span className="inline-block rounded bg-black/70 px-3 py-1.5 text-lg font-medium whitespace-pre-wrap text-white">
                    {activeLine.text}
                  </span>
                )}
              </div>
            )
          })()}
        {lyricsEnabled && parsedLyrics?.kind === 'static' && (
          <div
            className="pointer-events-none absolute right-6 left-6 max-h-48 overflow-y-auto text-center"
            style={lyricsStyle}
          >
            <p className="inline-block rounded bg-black/70 px-3 py-1.5 text-lg font-medium whitespace-pre-wrap text-white">
              {parsedLyrics.lines.join('\n')}
            </p>
          </div>
        )}
      </div>

      <PlayerControlBands
        playback={playback}
        mode={mode}
        visible={visible}
        onMinimize={handleMinimize}
        onDetach={mode === 'overlay' ? onDetach : undefined}
        lyricsEnabled={lyricsEnabled}
        hasLyrics={parsedLyrics !== null}
        hasSyncedLyrics={parsedLyrics?.kind === 'synced'}
        onToggleLyrics={onToggleLyrics}
        subtitlePipOpen={subtitlePipOpen}
        playlistActive={sidePanel !== undefined ? sidePanelOpen : (playlistActive ?? false)}
        playlistLabel={playlistLabel}
        onTogglePlaylist={handleTogglePlaylist}
        fullscreen={fullscreen}
        onToggleFullscreen={toggle}
        topBandExtra={topBandExtra}
        topInsetRight={contentInsetRight}
        bottomBandRef={bottomBandRef}
        onPointerOverChange={onPointerOverChange}
        onFocusInChange={onFocusInChange}
        onDraggingChange={setDragging}
        onPopoverOpenChange={setPopoverOpen}
      />

      {sidePanelShown && (
        <aside
          className="absolute top-0 right-0 overflow-y-auto border-l border-white/10 bg-black/85 p-2"
          style={{ width: SIDE_PANEL_WIDTH_PX, bottom: bandHeight }}
        >
          {sidePanel}
        </aside>
      )}
    </div>
  )
}
