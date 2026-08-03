# Media Playback Improvements — Design

## Goal

Fix a volume-reset bug, add shuffle playback (cycling every track once before repeating), and stop the app's Reload menu/shortcut from silently killing in-progress media playback.

## Scope

Third sub-project of the v1.0.2 backlog (group "A" — items 1-3 in the agreed
B→F→A→C→G→D→E order; B and F are shipped). Touches only the media playback
subsystem: `src/components/media/useMediaPlayback.ts`,
`src/stores/mediaPlayerStore.ts`, `src/components/media/MediaTransportBar.tsx`,
`electron/main/index.ts`, `electron/main/ipc/mediaWindowHandlers.ts`. Not in
scope: item 5 (media-list thumbnails, including audio's large-thumbnail
display raised during this brainstorming session — logged for the "C"
sub-project, not designed here) or any other backlog item.

## 1. Volume Reset Bug

**Root cause**, confirmed by reading the current code: `useMediaPlayback.ts`
applies the store's `volume` to the live element only via
`useEffect(() => { if (isHost && elRef.current) elRef.current.volume = volume }, [isHost, volume])`
— this re-runs only when the `volume` *value* changes. A browser media
element defaults to `volume = 1.0` on creation; when a **new** element mounts
(track change, or a fresh host after a detach/reattach) while the store's
`volume` is already at some adjusted value (e.g. `0.3`) that isn't itself
changing, this effect's dependency array doesn't fire, so the new element
keeps the native `1.0` default while the slider (reading the unchanged store
value) still shows `0.3`.

**Fix:** apply the current volume at the moment an element attaches, not
only when the volume value changes. `setMediaRef` (the ref callback passed to
the `<video>`/`<audio>` element) currently only assigns `elRef.current = el`;
change it to also set `el.volume` when a non-null element mounts while this
window is the host:

```ts
const setMediaRef = useCallback(
  (el: HTMLVideoElement | HTMLAudioElement | null) => {
    elRef.current = el
    if (el && isHost) el.volume = volume
  },
  [isHost, volume]
)
```

The existing `useEffect` above is unchanged and still handles the "same
element, volume changed via the slider" case; this covers the "new element,
volume unchanged" case the bug report describes.

## 2. Shuffle Playback

**Store additions** (`mediaPlayerStore.ts`):

```ts
shuffleMode: boolean
shuffleOrder: number[]     // this cycle's full planned play order (a permutation of playlist indices)
shufflePosition: number    // pointer into shuffleOrder - where playback currently is in this cycle
toggleShuffle: () => void
```

One order array plus one position pointer, not a separate forward-plan and
play-history: `shuffleOrder` already *is* the play order once generated, so
`next`/`prev` are just the pointer moving forward/backward through the same
array - naturally reversible with no separate undo/redo bookkeeping, and
"go forward again after going back" replays the same planned order rather
than needing to decide whether to generate new randomness.

- `toggleShuffle()` flips `shuffleMode`. Turning it on generates a fresh
  `shuffleOrder` - a shuffled permutation of every index, with the
  currently-playing index moved to the front so `shufflePosition = 0` lines
  up with what's already playing (turning shuffle on doesn't itself change
  the current track). Turning it off leaves `shuffleOrder`/`shufflePosition`
  as-is (cheap to just regenerate next time it's turned on) and
  `next()`/`prev()` revert to plain sequential index math.
- `next()`, when `shuffleMode` is true: if `shufflePosition` is not yet at
  the end of `shuffleOrder`, increments it and sets `currentIndex =
  shuffleOrder[shufflePosition]`. At the end (every track has played once
  this cycle): if `repeatMode === 'off'`, stop (`isPlaying: false`,
  mirroring the existing sequential-mode "last track, repeat off"
  behavior); otherwise generate a new `shuffleOrder` (excluding the
  just-finished track from its own front position, so the same track can't
  play twice back-to-back across the cycle boundary), reset
  `shufflePosition` to `0`, and continue.
- `prev()`, when `shuffleMode` is true: decrements `shufflePosition` (no-op
  at `0` - there's no earlier state to return to at the very start of a
  cycle, same as how sequential mode has no equivalent "before the
  beginning" case within `next`'s own stop-at-`off` behavior) and sets
  `currentIndex = shuffleOrder[shufflePosition]` - retraces the actual
  planned/played order, matching a real player's "back" button.
- `playAt(index)` (manual track selection, e.g. clicking a row in the
  playlist panel) is unaffected by shuffle mode - it does not touch
  `shuffleOrder`/`shufflePosition`. `next()` after a manual jump continues
  from wherever `shufflePosition` already was, which may now disagree with
  `currentIndex` until the next shuffle-driven `next()`/`prev()` call
  realigns them. This is a deliberate simplicity choice, not an oversight:
  reconciling a manual jump with an in-progress shuffle cycle (does the
  manually-picked track count as "played this cycle"? does it reset the
  cycle?) has no single obviously-correct answer, and real players vary;
  punting keeps the mechanism simple and avoids designing for a case the
  user didn't ask about.

**UI:** `MediaTransportBar.tsx` gains a shuffle toggle button next to the
existing repeat-mode button (`lucide-react`'s `Shuffle` icon), same active/
inactive styling pattern as the repeat button (`text-primary`/dark-mode
variant when on, muted when off).

## 3. Reload Doesn't Kill Playback

**Mechanism:** the app currently has no custom application menu (Electron's
built-in default is in effect) - `Menu.setApplicationMenu` is never called
anywhere in `electron/main/index.ts`. This is the first sub-project to need
one; a later backlog item (G, file-exclusion's View-menu management dialog)
will extend the same menu rather than building a second one.

Build a menu template that reproduces Electron's default shape via role
shorthand (`{ role: 'fileMenu' }`, `{ role: 'editMenu' }`,
`{ role: 'windowMenu' }`, a Help entry) for every menu except View, which is
spelled out item-by-item using individual roles
(`toggledevtools`/`resetzoom`/`zoomin`/`zoomout`/`togglefullscreen`) so its
two reload-related items can get custom `click` handlers instead of
`role: 'reload'` / `role: 'forceReload'`. Every other item's behavior is
byte-identical to today's default menu.

**Knowing whether media is playing, in the main process:** `useMediaPlayerSync.ts`
already broadcasts the store's full state (including `isPlaying`) to the main
process on every change, unconditionally - not only when a detached player
window exists (confirmed by reading the hook: it subscribes to every store
change and calls `window.api.media.broadcastState`, with no `isDetached`
guard). `mediaWindowHandlers.ts`'s existing
`ipcMain.on(IPC_CHANNELS.MEDIA_STATE_BROADCAST, ...)` handler already
receives every one of these messages (currently only to relay them to other
windows); add a module-level `let isMediaPlaying = false` there, updated
alongside the existing relay logic. No new IPC channel needed - this is
purely reading a value that already arrives.

**The reload click handler:**

```ts
function guardedReload(win: BrowserWindow, forceReload: boolean): void {
  if (!isMediaPlaying) {
    forceReload ? win.webContents.reloadIgnoringCache() : win.webContents.reload()
    return
  }
  dialog
    .showMessageBox(win, {
      type: 'question',
      buttons: ['취소', '새로고침'],
      defaultId: 0,
      cancelId: 0,
      message: '미디어가 재생 중입니다. 새로고침하면 재생이 중단됩니다. 계속하시겠습니까?',
    })
    .then(({ response }) => {
      if (response === 1) {
        forceReload ? win.webContents.reloadIgnoringCache() : win.webContents.reload()
      }
    })
}
```

Plain hardcoded Korean strings, not routed through `t()` - `electron/main`
has no i18n access at all today (`t()` is a renderer-only hook backed by
`src/i18n/translations.ts`), and this codebase's existing convention for a
main-process user-facing string is exactly this: a hardcoded Korean literal,
same as `saveHandlers.ts`'s existing
`throw new Error('백업할 세이브 경로가 지정되어 있지 않습니다.')`. No new
pattern introduced.

`isMediaPlaying` needs to reflect the state of whichever window is actually
about to be reloaded - since only the main window can host non-detached
playback and the detached player window is a separate `BrowserWindow` a
Reload on the main window never touches, gating on a single module-level
flag (rather than per-window state) is correct for this app's actual
architecture (at most one main window, at most one player window, and
`isMediaPlaying` broadcasts already carry whichever window's play state is
current).

## Testing

No component/hook test infrastructure exists in this codebase. Store logic
changes (shuffle's cycle/reshuffle/history behavior) are the one piece with
real branching logic worth a pure-function extraction if the plan finds a
clean seam (e.g. a standalone `nextShuffleIndex`/`generateShuffleOrder`
helper) - otherwise, per this codebase's established convention, verify via
`npm run dev`: volume persists correctly across a track change and after a
detach/reattach; shuffle visits every track exactly once before repeating,
`prev` retraces actual play history; Reload while paused proceeds normally,
Reload while playing shows the confirm dialog, and confirming actually
reloads while cancelling leaves playback untouched.
