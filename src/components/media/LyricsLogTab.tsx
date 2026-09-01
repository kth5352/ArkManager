import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { cn } from '../../lib/utils'
import { Captions } from 'lucide-react'
import { Button } from '../ui/button'
import { HoverTooltip } from '../ui/hover-tooltip'
import { getActiveLyricLine, type SyncedLyricLine } from '../../lib/lrc'
import { parseLyrics } from '../../lib/parseLyrics'
import { isScrollEventFromAutoScroll } from '../../lib/isScrollEventFromAutoScroll'
import { useTranslation } from '../../i18n/useTranslation'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useMediaLyrics } from './useMediaLyrics'

// One line of the synced-lyrics list, memoized so a currentTime tick that
// re-renders LyricsLogTab (up to the browser's native timeupdate rate, easily
// 4-30x/sec) only actually re-renders the (at most two) lines whose active
// state flipped, instead of every line in the file reconciling on every tick
// - a synced subtitle/lyrics file with a few hundred+ lines made that O(n)
// per-tick cost visibly janky, compounding with the smooth-scrollIntoView
// below into a main-thread stall severe enough to stutter/pause actual
// playback (reported live: opening this tab lagged badly, and seeking via a
// line click made it worse). `line` itself is a stable reference (the exact
// object from parsedLyrics.lines, unchanged across re-renders - see
// getActiveLyricLine's own comment on this), so memo's shallow prop compare
// bails out correctly as long as `isActive` doesn't change - no onClick prop
// here on purpose, see the container's own delegated click handler below for
// why.
const LyricsLine = memo(function LyricsLine({
  line,
  isActive,
}: {
  line: SyncedLyricLine
  isActive: boolean
}) {
  return (
    <button
      type="button"
      data-time={line.time}
      className={cn(
        'whitespace-pre-wrap rounded px-2 py-1 text-left text-sm transition-colors',
        isActive ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/50'
      )}
    >
      {line.text}
    </button>
  )
})

// Walks up from `start` looking for the nearest ancestor whose computed
// overflow-y is 'auto' or 'scroll' - i.e. the element that actually scrolls
// when this component's content overflows it. Today that always resolves to
// MediaSidebar.tsx's `min-h-0 flex-1 overflow-y-auto` tab-content wrapper
// (this component's direct DOM parent), but doing the walk structurally
// rather than hardcoding "my parent IS the scroller" means an extra
// intermediate wrapper div added later (e.g. for padding/animation) wouldn't
// silently break the scroll-pause listener below - it would just resolve one
// hop further up instead. document.body is a safety bound so this can never
// walk past it even if no ancestor's overflow-y ever matches.
function findScrollableAncestor(start: HTMLElement): HTMLElement {
  let el: HTMLElement | null = start.parentElement
  while (el && el !== document.body) {
    const overflowY = getComputedStyle(el).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return el
    el = el.parentElement
  }
  return document.body
}

// Rendered from MediaSidebar's `lyrics` tab, which AppLayout.tsx mounts as a
// flex sibling of <main> - a different part of the tree than MediaPlayerHost,
// which is the ONLY place useMediaPlayback() may be called (a second call
// would mount a second live <video>/<audio> element ref). This component
// therefore takes no playback/parsedLyrics props:
//  - currentTime/onSeek are bridged through mediaPlayerStore's
//    playbackCurrentTime/seekPlayback (written by MediaPlayerHost's own
//    effect - see its comment) since those are tied to the live media
//    element and can't be independently re-derived here.
//  - parsedLyrics, by contrast, is a pure derivation of useMediaLyrics
//    (keyed by track path) + parseLyrics - it has no dependency on the live
//    element, so this component just calls useMediaLyrics itself for the
//    current track's path. TanStack Query dedupes this against
//    MediaPlayerHost's identical query key, so it's not a duplicate fetch.
//
// Auto-follow state machine: follows the active line by default, pauses on
// a user-initiated scroll, and resumes when the user either clicks a line
// (explicit navigation) or leaves this tab (unmount) and returns (a fresh
// mount always starts followEnabled=true - this component takes no
// prop that could seed it incorrectly, so there's no equivalent of
// ExplorerSidebar's activePath prop-seeding bug to guard against here).
export function LyricsLogTab() {
  const { t } = useTranslation()
  const playlist = useMediaPlayerStore((s) => s.playlist)
  const currentIndex = useMediaPlayerStore((s) => s.currentIndex)
  const currentTime = useMediaPlayerStore((s) => s.playbackCurrentTime)
  const seekPlayback = useMediaPlayerStore((s) => s.seekPlayback)
  const subtitlePipOpen = useMediaPlayerStore((s) => s.subtitlePipOpen)

  const currentTrackPath = currentIndex !== null ? (playlist[currentIndex]?.path ?? null) : null
  const lyricsQuery = useMediaLyrics(currentTrackPath)
  const parsedLyrics = useMemo(
    () => (lyricsQuery.data ? parseLyrics(lyricsQuery.data.text, lyricsQuery.data.path) : null),
    [lyricsQuery.data]
  )

  const [followEnabled, setFollowEnabled] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastAutoScrollAt = useRef(0)
  const autoScrollStartedAt = useRef(0)

  const activeLine =
    parsedLyrics?.kind === 'synced' ? getActiveLyricLine(parsedLyrics, currentTime) : null

  // Delegated to the container (rather than an onClick per LyricsLine) so
  // each line's memoized props never need to include seekPlayback - that
  // store value is reassigned a fresh closure on every MediaPlayerHost
  // render (see mediaPlayerStore.ts's own seekPlayback field), which would
  // otherwise defeat LyricsLine's memoization on every tick regardless of
  // whether that line's active state actually changed.
  const handleLineClick = useCallback(
    (event: MouseEvent<HTMLDivElement>): void => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('button[data-time]')
      if (!target?.dataset.time) return
      const time = Number(target.dataset.time)
      if (Number.isNaN(time)) return
      seekPlayback(time)
      setFollowEnabled(true)
    },
    [seekPlayback]
  )

  const handleToggleSubtitlePip = (): void => {
    if (subtitlePipOpen) window.api.media.closeSubtitlePipWindow()
    else window.api.media.openSubtitlePipWindow()
  }

  // Auto-scrolls to the active line whenever it changes, while auto-follow
  // is enabled. A genuine DOM side effect (ref access + the impure
  // Date.now()/scrollIntoView calls), so this must live in an effect rather
  // than being adjusted during render - react-hooks/refs and
  // react-hooks/purity both forbid touching a ref's `.current` or calling
  // an impure function directly in the render body, unlike this codebase's
  // other "adjust state during render" patterns (e.g. MediaPlayerHost's
  // auto-expand block), which only ever call plain useState setters.
  // Guarded by followEnabled so a paused-by-scroll state doesn't keep
  // re-centering against the user's will on every timeupdate tick.
  useEffect(() => {
    if (!followEnabled || !activeLine || !containerRef.current) return
    const el = containerRef.current.querySelector<HTMLElement>(`[data-time="${activeLine.time}"]`)
    if (!el) return
    const now = Date.now()
    lastAutoScrollAt.current = now
    autoScrollStartedAt.current = now
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeLine, followEnabled])

  // This component's own root has no overflow/height constraint - the
  // element that actually scrolls is a DOM ANCESTOR of this component's
  // root (not this root itself), found via findScrollableAncestor above.
  // Native `scroll` events don't bubble, so an onScroll prop on this root
  // would never fire - a plain useEffect that locates the real scrolling
  // ancestor and attaches a native listener there is required instead.
  // React's synthetic onScroll can only ever attach to this component's own
  // root, never an ancestor it doesn't render.
  // Depends on parsedLyrics?.kind (not []) - this component stays mounted
  // across track changes (only its returned JSX changes), and the
  // scrollable `containerRef` div only exists in the 'synced' branch below
  // (the null/'static' branches return a plain <p>, so containerRef.current
  // is null then). Re-running whenever `kind` flips ensures a track that
  // switches into 'synced' lyrics after mounting with none/static gets its
  // listener attached against the now-rendered div, rather than being stuck
  // with the stale "no element yet" result from whenever this effect last
  // ran.
  useEffect(() => {
    if (!containerRef.current) return
    const scrollTarget = findScrollableAncestor(containerRef.current)
    const handleScroll = (): void => {
      // See isScrollEventFromAutoScroll's doc comment for the full history
      // of why this needs both a refresh window AND a hard ceiling (this
      // decision has already been the site of two prior bugs). Refreshing
      // lastAutoScrollAt on a "still ours" verdict lets a large jump
      // (opening the tab on a far-down active line, or a click-seek across
      // a long lyrics file) that keeps emitting scroll events past a single
      // fixed window avoid being misread as a user scroll partway through,
      // while the ceiling (never refreshed here) stops a continuous user
      // scroll gesture from re-arming the window forever.
      const now = Date.now()
      if (isScrollEventFromAutoScroll(now, lastAutoScrollAt.current, autoScrollStartedAt.current)) {
        lastAutoScrollAt.current = now
        return
      }
      setFollowEnabled(false)
    }
    scrollTarget.addEventListener('scroll', handleScroll)
    return () => scrollTarget.removeEventListener('scroll', handleScroll)
  }, [parsedLyrics?.kind])

  const subtitlePipToggle = (
    <div className="flex justify-end">
      <HoverTooltip content={t('media.subtitlePipToggle')}>
        <Button
          variant="ghost"
          size="icon"
          disabled={parsedLyrics?.kind !== 'synced' && !subtitlePipOpen}
          onClick={handleToggleSubtitlePip}
          aria-label={t('media.subtitlePipToggle')}
          aria-pressed={subtitlePipOpen}
          className={cn('h-6 w-6 shrink-0 transition-colors', subtitlePipOpen && 'text-foreground')}
        >
          <Captions className="h-3.5 w-3.5" />
        </Button>
      </HoverTooltip>
    </div>
  )

  if (parsedLyrics === null) {
    return (
      <div className="flex flex-col gap-1">
        {subtitlePipToggle}
        <p className="px-1 py-2 text-xs text-muted-foreground">{t('media.noSyncedLyrics')}</p>
      </div>
    )
  }

  if (parsedLyrics.kind === 'static') {
    return (
      <div className="flex flex-col gap-1">
        {subtitlePipToggle}
        <p className="whitespace-pre-wrap px-2 py-1 text-sm text-muted-foreground">
          {parsedLyrics.lines.join('\n')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {subtitlePipToggle}
      <div ref={containerRef} className="flex flex-col gap-0.5" onClick={handleLineClick}>
        {parsedLyrics.lines.map((line) => (
          <LyricsLine
            key={`${line.time}-${line.text}`}
            line={line}
            isActive={activeLine?.time === line.time}
          />
        ))}
      </div>
    </div>
  )
}
