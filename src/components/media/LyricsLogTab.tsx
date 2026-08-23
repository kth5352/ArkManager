import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { getActiveLyricLine, parseLrc } from '../../lib/lrc'
import { useTranslation } from '../../i18n/useTranslation'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useMediaLyrics } from './useMediaLyrics'

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
    lastAutoScrollAt.current = Date.now()
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeLine, followEnabled])

  // This component's own root has no overflow/height constraint - the
  // element that actually scrolls is MediaSidebar.tsx's shared
  // `min-h-0 flex-1 overflow-y-auto` wrapper, a DOM ANCESTOR of this
  // component's root (not this root itself). Native `scroll` events don't
  // bubble, so an onScroll prop on this root would never fire - a plain
  // useEffect that walks up to `containerRef.current.parentElement` (the
  // real scrolling ancestor, confirmed against MediaSidebar.tsx's current
  // JSX: this component is mounted as a direct child of that wrapper) and
  // attaches a native listener there is required instead. React's
  // synthetic onScroll can only ever attach to this component's own root,
  // never an ancestor it doesn't render.
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
    const scrollParent = containerRef.current?.parentElement
    if (!scrollParent) return
    const handleScroll = (): void => {
      // Ignore scroll events for a short window after an auto-scroll we
      // triggered ourselves (smooth scrollIntoView fires several scroll
      // events over ~300-500ms) - only a scroll outside that window is a
      // real user gesture that should pause auto-follow.
      if (Date.now() - lastAutoScrollAt.current < 600) return
      setFollowEnabled(false)
    }
    scrollParent.addEventListener('scroll', handleScroll)
    return () => scrollParent.removeEventListener('scroll', handleScroll)
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
