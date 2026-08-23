import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { getActiveLyricLine, parseLrc } from '../../lib/lrc'
import { isScrollEventFromAutoScroll } from '../../lib/isScrollEventFromAutoScroll'
import { useTranslation } from '../../i18n/useTranslation'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useMediaLyrics } from './useMediaLyrics'

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
//    (keyed by track path) + parseLrc - it has no dependency on the live
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

  const currentTrackPath = currentIndex !== null ? (playlist[currentIndex]?.path ?? null) : null
  const lyricsQuery = useMediaLyrics(currentTrackPath)
  const parsedLyrics = useMemo(
    () => (lyricsQuery.data ? parseLrc(lyricsQuery.data.text) : null),
    [lyricsQuery.data]
  )

  const [followEnabled, setFollowEnabled] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastAutoScrollAt = useRef(0)
  const autoScrollStartedAt = useRef(0)

  const activeLine =
    parsedLyrics?.kind === 'synced' ? getActiveLyricLine(parsedLyrics, currentTime) : null

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

  if (parsedLyrics === null) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">{t('media.noSyncedLyrics')}</p>
  }

  if (parsedLyrics.kind === 'static') {
    return (
      <p className="whitespace-pre-wrap px-2 py-1 text-sm text-muted-foreground">
        {parsedLyrics.lines.join('\n')}
      </p>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-0.5">
      {parsedLyrics.lines.map((line) => (
        <button
          key={`${line.time}-${line.text}`}
          type="button"
          data-time={line.time}
          onClick={() => {
            seekPlayback(line.time)
            setFollowEnabled(true)
          }}
          className={cn(
            'rounded px-2 py-1 text-left text-sm',
            activeLine?.time === line.time
              ? 'bg-accent font-medium text-foreground'
              : 'text-muted-foreground hover:bg-accent/50'
          )}
        >
          {line.text}
        </button>
      ))}
    </div>
  )
}
