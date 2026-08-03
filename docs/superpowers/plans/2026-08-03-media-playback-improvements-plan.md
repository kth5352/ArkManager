# Media Playback Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the volume-reset-on-new-element bug, add shuffle playback (every track once before repeating), and stop Reload from silently killing in-progress media.

**Architecture:** A one-line fix in `useMediaPlayback.ts`'s ref callback; two new pure shuffle-order functions consumed by new store state/actions in `mediaPlayerStore.ts`, threaded through the existing cross-window sync pipeline (3 call sites) and exposed via a new transport-bar button; a first-ever custom Electron menu built in `electron/main/index.ts` that intercepts only the two reload-related View items, backed by an `isMediaPlaying` flag the main process already has the data for via the existing `MEDIA_STATE_BROADCAST` channel.

**Tech Stack:** React 19 + TypeScript strict + Zustand + Tailwind + lucide-react + Electron (Menu, dialog).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-03-media-playback-improvements-design.md` (committed `529b560`).
- No new IPC channel for the reload guard - reuse `MEDIA_STATE_BROADCAST`, which already arrives at the main process on every store change regardless of whether a detached window exists.
- Every field added to the media player store that's part of cross-window sync state must be added to all three of: `MediaSyncStateSchema` (`shared/types/ipc.ts`), `toSyncState()` (`src/hooks/useMediaPlayerSync.ts`), and `handleDetach()`'s payload (`src/components/media/MediaPlayerHost.tsx`) - missing any one silently desyncs the main window and a detached player window.
- Main-process user-facing strings are plain hardcoded Korean literals, never routed through `t()` (no i18n mechanism exists in `electron/main` - precedent: `saveHandlers.ts`'s `throw new Error('백업할 세이브 경로가 지정되어 있지 않습니다.')`).
- No component/hook tests exist in this codebase. New pure functions get `.test.ts` files; everything else is manual `npm run dev` verification.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Fix the volume-reset-on-new-element bug

**Files:**
- Modify: `src/components/media/useMediaPlayback.ts:76-78`

**Interfaces:** None - self-contained, no dependents.

- [ ] **Step 1: Apply the current volume when a new media element mounts**

Replace:

```ts
  const setMediaRef = useCallback((el: HTMLVideoElement | HTMLAudioElement | null) => {
    elRef.current = el
  }, [])
```

with:

```ts
  const setMediaRef = useCallback(
    (el: HTMLVideoElement | HTMLAudioElement | null) => {
      elRef.current = el
      if (el && isHost) el.volume = volume
    },
    [isHost, volume]
  )
```

- [ ] **Step 2: Typecheck, lint, format**

Run: `npm run typecheck && npm run lint && npx prettier --check src/components/media/useMediaPlayback.ts`
Expected: no errors.

- [ ] **Step 3: Manual verification via `npm run dev`**

Play any media track, drag the volume slider to a low value (e.g. 20%), then skip to the next track (or click a different track in the playlist). Confirm the new track plays at the same low volume, not full volume, while the slider still shows the same position.

- [ ] **Step 4: Commit**

```bash
git add src/components/media/useMediaPlayback.ts
git commit -m "$(cat <<'EOF'
fix: media volume reset to max when a new element mounted

The volume-apply effect only re-ran when the store's volume value
itself changed ([isHost, volume] deps) - a freshly mounted <video>/
<audio> element (track change, or becoming host after a detach/
reattach) defaults to the browser's native volume=1.0 regardless,
since nothing about the dependency array changes just because a new
DOM node appeared. setMediaRef now applies the current volume the
moment an element attaches, not only when volume changes afterward.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Shuffle-order pure functions

**Files:**
- Create: `src/stores/shuffleOrder.ts`
- Test: `src/stores/shuffleOrder.test.ts`

**Interfaces:**
- Produces: `generateShuffleOrderKeepingFront(playlistLength: number, frontIndex: number): number[]`, `generateShuffleOrderAvoidingFront(playlistLength: number, avoidIndex: number): number[]` - both consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

```ts
// src/stores/shuffleOrder.test.ts
import { describe, it, expect } from 'vitest'
import { generateShuffleOrderKeepingFront, generateShuffleOrderAvoidingFront } from './shuffleOrder'

function isPermutationOf(order: number[], length: number): boolean {
  if (order.length !== length) return false
  const seen = new Set(order)
  if (seen.size !== length) return false
  for (let i = 0; i < length; i++) {
    if (!seen.has(i)) return false
  }
  return true
}

describe('generateShuffleOrderKeepingFront', () => {
  it('returns a permutation of every index for the given length', () => {
    const order = generateShuffleOrderKeepingFront(5, 2)
    expect(isPermutationOf(order, 5)).toBe(true)
  })

  it('always places frontIndex first', () => {
    for (let i = 0; i < 20; i++) {
      const order = generateShuffleOrderKeepingFront(6, 3)
      expect(order[0]).toBe(3)
    }
  })

  it('handles a single-track playlist', () => {
    expect(generateShuffleOrderKeepingFront(1, 0)).toEqual([0])
  })
})

describe('generateShuffleOrderAvoidingFront', () => {
  it('returns a permutation of every index for the given length', () => {
    const order = generateShuffleOrderAvoidingFront(5, 2)
    expect(isPermutationOf(order, 5)).toBe(true)
  })

  it('never places avoidIndex first, across many runs', () => {
    for (let i = 0; i < 50; i++) {
      const order = generateShuffleOrderAvoidingFront(4, 1)
      expect(order[0]).not.toBe(1)
    }
  })

  it('handles a single-track playlist by returning that track (no other option exists)', () => {
    expect(generateShuffleOrderAvoidingFront(1, 0)).toEqual([0])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/shuffleOrder.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement the pure functions**

```ts
// src/stores/shuffleOrder.ts

// Fisher-Yates - unbiased, in-place on a copy so callers never see their
// input array mutated.
function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function allIndices(length: number): number[] {
  return Array.from({ length }, (_, i) => i)
}

// Used when shuffle mode is turned ON - the currently-playing track must
// stay playing, so it's pinned to position 0 (shufflePosition starts at 0
// to match) while every other track is shuffled behind it.
export function generateShuffleOrderKeepingFront(
  playlistLength: number,
  frontIndex: number
): number[] {
  const rest = allIndices(playlistLength).filter((i) => i !== frontIndex)
  return [frontIndex, ...shuffle(rest)]
}

// Used when a shuffle cycle finishes and a new one starts - the just-
// finished track must NOT be able to play twice in a row across the cycle
// boundary, so it's excluded from position 0 (swapped elsewhere if a plain
// shuffle happens to land it there). With only one track total there's no
// other position to put it, so it's returned as-is.
export function generateShuffleOrderAvoidingFront(
  playlistLength: number,
  avoidIndex: number
): number[] {
  const order = shuffle(allIndices(playlistLength))
  if (playlistLength <= 1 || order[0] !== avoidIndex) return order
  const swapWith = 1 + Math.floor(Math.random() * (order.length - 1))
  ;[order[0], order[swapWith]] = [order[swapWith], order[0]]
  return order
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stores/shuffleOrder.test.ts`
Expected: PASS, 6/6 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/stores/shuffleOrder.ts src/stores/shuffleOrder.test.ts
git commit -m "$(cat <<'EOF'
feat: add shuffle-order generation pure functions

Two functions covering shuffle's two distinct moments: turning
shuffle on (the current track must stay playing, so it's pinned to
the front of the new order) and a cycle finishing (the just-finished
track must not repeat immediately, so it's excluded from the new
order's front instead). Tested via invariants (valid permutation,
front-position constraint held across many runs) rather than exact
sequences, since the output is intentionally randomized.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Shuffle state in the store, threaded through cross-window sync

**Files:**
- Modify: `src/stores/mediaPlayerStore.ts`
- Modify: `shared/types/ipc.ts` (`MediaSyncStateSchema`)
- Modify: `src/hooks/useMediaPlayerSync.ts` (`toSyncState`)
- Modify: `src/components/media/MediaPlayerHost.tsx` (`handleDetach`)

**Interfaces:**
- Consumes: `generateShuffleOrderKeepingFront`, `generateShuffleOrderAvoidingFront` (Task 2).
- Produces: `shuffleMode: boolean`, `shuffleOrder: number[]`, `shufflePosition: number`, `toggleShuffle: () => void` on the store - consumed by Task 4's UI button. Extended `MediaSyncState` type - no other task depends on its new fields directly, but every future change to synced state must keep all three sync call sites in agreement (see Global Constraints).

**Known accepted limitation (matches the spec's own explicit scope note on
manual track selection):** `playNow()` and `addToPlaylist()` don't reset or
extend `shuffleOrder`/`shufflePosition` when they change the playlist while
`shuffleMode` is already on - `shuffleOrder` can end up shorter/longer than
`playlist`. This is the same class of edge case the spec already ruled out
of scope for `playAt` ("has no single obviously-correct answer... punting
keeps the mechanism simple"); not fixed here for the same reason. If this
proves disruptive in practice, the fix is straightforward and localized:
have `next()`/`prev()` check `shuffleOrder.length !== playlist.length` and
regenerate via `generateShuffleOrderKeepingFront(playlist.length,
currentIndex)` before doing anything else - flagged here rather than
silently left for a future bug report.

- [ ] **Step 1: Add the three fields to `MediaSyncStateSchema`**

In `shared/types/ipc.ts`, change:

```ts
export const MediaSyncStateSchema = z.object({
  playlist: z.array(MediaTrackSchema),
  currentIndex: z.number().nullable(),
  isPlaying: z.boolean(),
  volume: z.number(),
  previousVolume: z.number(),
  repeatMode: MediaRepeatModeSchema,
  isDetached: z.boolean(),
  handoffTimeSeconds: z.number().nullable(),
})
```

to:

```ts
export const MediaSyncStateSchema = z.object({
  playlist: z.array(MediaTrackSchema),
  currentIndex: z.number().nullable(),
  isPlaying: z.boolean(),
  volume: z.number(),
  previousVolume: z.number(),
  repeatMode: MediaRepeatModeSchema,
  shuffleMode: z.boolean(),
  shuffleOrder: z.array(z.number()),
  shufflePosition: z.number(),
  isDetached: z.boolean(),
  handoffTimeSeconds: z.number().nullable(),
})
```

- [ ] **Step 2: Add shuffle state and `toggleShuffle` to the store**

In `src/stores/mediaPlayerStore.ts`, add the import:

```ts
import { generateShuffleOrderKeepingFront, generateShuffleOrderAvoidingFront } from './shuffleOrder'
```

Add to the `MediaPlayerState` interface, after `repeatMode: RepeatMode`:

```ts
  // See shuffleOrder.ts for how these two are generated. shufflePosition is
  // a pointer into shuffleOrder, not a separate history - next/prev just
  // move it forward/backward through the same planned order, so "forward
  // after going back" naturally replays what was already decided instead
  // of needing new randomness.
  shuffleMode: boolean
  shuffleOrder: number[]
  shufflePosition: number
```

Add to the state object's initial values, after `repeatMode: 'off',`:

```ts
  shuffleMode: false,
  shuffleOrder: [],
  shufflePosition: 0,
```

Add `toggleShuffle: () => void` to the interface's action list (after `cycleRepeatMode: () => void`), and implement it at the end of the store, after `cycleRepeatMode`:

```ts
  toggleShuffle: () => {
    const { shuffleMode, playlist, currentIndex } = get()
    if (shuffleMode) {
      set({ shuffleMode: false })
      return
    }
    const order =
      currentIndex !== null
        ? generateShuffleOrderKeepingFront(playlist.length, currentIndex)
        : []
    set({ shuffleMode: true, shuffleOrder: order, shufflePosition: 0 })
  },
```

- [ ] **Step 3: Make `next()` and `prev()` shuffle-aware**

Replace the existing `next`/`prev` implementations:

```ts
  next: () => {
    const { playlist, currentIndex, repeatMode } = get()
    if (currentIndex === null || playlist.length === 0) return
    const isLast = currentIndex === playlist.length - 1
    if (isLast && repeatMode === 'off') {
      set({ isPlaying: false })
      return
    }
    set({ currentIndex: (currentIndex + 1) % playlist.length, isPlaying: true })
  },

  prev: () => {
    const { playlist, currentIndex } = get()
    if (currentIndex === null || playlist.length === 0) return
    set({ currentIndex: (currentIndex - 1 + playlist.length) % playlist.length, isPlaying: true })
  },
```

with:

```ts
  next: () => {
    const { playlist, currentIndex, repeatMode, shuffleMode, shuffleOrder, shufflePosition } =
      get()
    if (currentIndex === null || playlist.length === 0) return

    if (shuffleMode) {
      const atEnd = shufflePosition >= shuffleOrder.length - 1
      if (atEnd) {
        if (repeatMode === 'off') {
          set({ isPlaying: false })
          return
        }
        const nextOrder = generateShuffleOrderAvoidingFront(playlist.length, currentIndex)
        set({ shuffleOrder: nextOrder, shufflePosition: 0, currentIndex: nextOrder[0], isPlaying: true })
        return
      }
      const nextPosition = shufflePosition + 1
      set({ shufflePosition: nextPosition, currentIndex: shuffleOrder[nextPosition], isPlaying: true })
      return
    }

    const isLast = currentIndex === playlist.length - 1
    if (isLast && repeatMode === 'off') {
      set({ isPlaying: false })
      return
    }
    set({ currentIndex: (currentIndex + 1) % playlist.length, isPlaying: true })
  },

  prev: () => {
    const { playlist, currentIndex, shuffleMode, shuffleOrder, shufflePosition } = get()
    if (currentIndex === null || playlist.length === 0) return

    if (shuffleMode) {
      const prevPosition = Math.max(0, shufflePosition - 1)
      set({ shufflePosition: prevPosition, currentIndex: shuffleOrder[prevPosition], isPlaying: true })
      return
    }

    set({ currentIndex: (currentIndex - 1 + playlist.length) % playlist.length, isPlaying: true })
  },
```

- [ ] **Step 4: Thread the three fields through `toSyncState()`**

In `src/hooks/useMediaPlayerSync.ts`, change:

```ts
function toSyncState(state: MediaSyncState): MediaSyncState {
  return {
    playlist: state.playlist,
    currentIndex: state.currentIndex,
    isPlaying: state.isPlaying,
    volume: state.volume,
    previousVolume: state.previousVolume,
    repeatMode: state.repeatMode,
    isDetached: state.isDetached,
    handoffTimeSeconds: state.handoffTimeSeconds,
  }
}
```

to:

```ts
function toSyncState(state: MediaSyncState): MediaSyncState {
  return {
    playlist: state.playlist,
    currentIndex: state.currentIndex,
    isPlaying: state.isPlaying,
    volume: state.volume,
    previousVolume: state.previousVolume,
    repeatMode: state.repeatMode,
    shuffleMode: state.shuffleMode,
    shuffleOrder: state.shuffleOrder,
    shufflePosition: state.shufflePosition,
    isDetached: state.isDetached,
    handoffTimeSeconds: state.handoffTimeSeconds,
  }
}
```

- [ ] **Step 5: Thread the three fields through `handleDetach()`'s payload**

In `src/components/media/MediaPlayerHost.tsx`, change:

```ts
    window.api.media.openPlayerWindow({
      playlist: state.playlist,
      currentIndex: state.currentIndex,
      isPlaying: state.isPlaying,
      volume: state.volume,
      previousVolume: state.previousVolume,
      repeatMode: state.repeatMode,
      isDetached: true,
      handoffTimeSeconds: seconds,
    })
```

to:

```ts
    window.api.media.openPlayerWindow({
      playlist: state.playlist,
      currentIndex: state.currentIndex,
      isPlaying: state.isPlaying,
      volume: state.volume,
      previousVolume: state.previousVolume,
      repeatMode: state.repeatMode,
      shuffleMode: state.shuffleMode,
      shuffleOrder: state.shuffleOrder,
      shufflePosition: state.shufflePosition,
      isDetached: true,
      handoffTimeSeconds: seconds,
    })
```

- [ ] **Step 6: Typecheck, lint, format, full test suite**

Run: `npm run typecheck && npm run lint && npx prettier --check src/stores/mediaPlayerStore.ts shared/types/ipc.ts src/hooks/useMediaPlayerSync.ts src/components/media/MediaPlayerHost.tsx && npx vitest run`
Expected: all clean; test count increased by the 6 new tests from Task 2.

- [ ] **Step 7: Commit**

```bash
git add src/stores/mediaPlayerStore.ts shared/types/ipc.ts src/hooks/useMediaPlayerSync.ts src/components/media/MediaPlayerHost.tsx
git commit -m "$(cat <<'EOF'
feat: add shuffle state to the media player store

shuffleMode/shuffleOrder/shufflePosition, threaded through all three
places that enumerate cross-window sync state by name (the zod
schema, the broadcast-on-change hook, and the detach handoff payload)
- missing any one would silently desync shuffle state between the
main window and a detached player window. next()/prev() branch on
shuffleMode: within a cycle they just move the shufflePosition
pointer through the existing shuffleOrder (reversibly - going back
then forward again replays the same planned order); at the end of a
cycle, next() either stops (repeat off, same as sequential mode) or
generates a fresh order excluding the just-finished track from
repeating immediately.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Shuffle toggle button

**Files:**
- Modify: `src/components/media/MediaTransportBar.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `shuffleMode: boolean`, `toggleShuffle: () => void` from `useMediaPlayerStore` (Task 3).

- [ ] **Step 1: Add the `media.shuffleMode` i18n key to all three locales**

In `src/i18n/translations.ts`, Korean block (directly after line 278's `'media.repeatMode': '반복 모드',`):

```ts
  'media.shuffleMode': '셔플 모드',
```

Japanese block (directly after line 564's `'media.repeatMode': 'リピートモード',`):

```ts
  'media.shuffleMode': 'シャッフルモード',
```

English block (directly after line 852's `'media.repeatMode': 'Repeat mode',`):

```ts
  'media.shuffleMode': 'Shuffle mode',
```

- [ ] **Step 2: Run typecheck to confirm the new key doesn't break the translations type**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Add the shuffle button**

In `src/components/media/MediaTransportBar.tsx`, add `Shuffle` to the existing `lucide-react` import:

```ts
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
```

Add the store bindings, alongside the existing `repeatMode`/`cycleRepeatMode` lines:

```ts
  const shuffleMode = useMediaPlayerStore((s) => s.shuffleMode)
  const toggleShuffle = useMediaPlayerStore((s) => s.toggleShuffle)
```

Add the button in the JSX, directly after the existing repeat-mode button (after its closing `</button>`, before the track-info `<div>`):

```tsx
      <button
        onClick={toggleShuffle}
        aria-label={t('media.shuffleMode')}
        className={cn('shrink-0', shuffleMode ? (dark ? 'text-white' : 'text-primary') : mutedText)}
      >
        <Shuffle className="h-4 w-4" />
      </button>
```

- [ ] **Step 4: Typecheck, lint, format**

Run: `npm run typecheck && npm run lint && npx prettier --check src/components/media/MediaTransportBar.tsx src/i18n/translations.ts`
Expected: no errors.

- [ ] **Step 5: Manual verification via `npm run dev`**

Play a playlist of at least 4 tracks. Click the new shuffle button (appears next to the repeat button) - confirm it visually activates (same highlight style as an active repeat mode) and the currently-playing track keeps playing (doesn't jump). Click "다음 트랙" repeatedly and confirm every track plays exactly once before any repeats; click "이전 트랙" and confirm it retraces the same order backward. Toggle shuffle off and confirm next/prev return to plain sequential order.

- [ ] **Step 6: Commit**

```bash
git add src/components/media/MediaTransportBar.tsx src/i18n/translations.ts
git commit -m "$(cat <<'EOF'
feat: add a shuffle toggle button to the media transport bar

Same active/inactive visual pattern as the existing repeat-mode
button, placed directly next to it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Reload guard - custom menu + confirm dialog

**Files:**
- Modify: `electron/main/index.ts`
- Modify: `electron/main/ipc/mediaWindowHandlers.ts`

**Interfaces:**
- Consumes: `IPC_CHANNELS.MEDIA_STATE_BROADCAST`, `MediaSyncStateSchema` (existing, already imported in `mediaWindowHandlers.ts`).
- Produces: `getIsMediaPlaying(): boolean`, exported from `mediaWindowHandlers.ts` for `index.ts`'s menu-building code to call.

- [ ] **Step 1: Track `isMediaPlaying` in `mediaWindowHandlers.ts`**

Add a module-level flag near the existing `playerWindow`/`lastKnownTimeSeconds` variables:

```ts
// Updated on every MEDIA_STATE_BROADCAST (which fires unconditionally on
// every store change in whichever window is currently active, not only
// when a detached window exists - see useMediaPlayerSync.ts) - lets the
// main process's Reload menu handler (electron/main/index.ts) know whether
// to warn before reloading, without a dedicated IPC round-trip.
let isMediaPlaying = false

export function getIsMediaPlaying(): boolean {
  return isMediaPlaying
}
```

Update the existing broadcast handler to also record this:

```ts
  ipcMain.on(IPC_CHANNELS.MEDIA_STATE_BROADCAST, (event, payload: unknown) => {
    const state = MediaSyncStateSchema.parse(payload)
    isMediaPlaying = state.isPlaying
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.id !== event.sender.id) {
        win.webContents.send(IPC_CHANNELS.MEDIA_STATE_SYNC, state)
      }
    }
  })
```

- [ ] **Step 2: Build and set the custom application menu in `index.ts`**

Add `Menu`, `MenuItemConstructorOptions`, and `dialog` to the existing `import { app, BrowserWindow } from 'electron'` line:

```ts
import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
```

Add the import for the new getter, alongside the existing `registerMediaWindowHandlers` import:

```ts
import { registerMediaWindowHandlers, getIsMediaPlaying } from './ipc/mediaWindowHandlers'
```

Add this function above `createWindow`:

```ts
  // Reproduces Electron's own default menu shape (the one silently in
  // effect until now, since this app never called Menu.setApplicationMenu)
  // via the same role shorthand for File/Edit/Window - View is spelled out
  // item-by-item so its two reload items can get a custom click handler
  // instead of role: 'reload' / role: 'forceReload', with every other View
  // item unchanged. The default's Help menu (a single "Learn More" link to
  // electronjs.org) is deliberately dropped rather than reproduced - it has
  // no relevance to this app and an empty Help menu would be worse than no
  // Help menu at all.
  function guardedReload(win: BrowserWindow, forceReload: boolean): void {
    const doReload = (): void => {
      if (forceReload) win.webContents.reloadIgnoringCache()
      else win.webContents.reload()
    }
    if (!getIsMediaPlaying()) {
      doReload()
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
        if (response === 1) doReload()
      })
  }

  function buildApplicationMenu(): void {
    const template: MenuItemConstructorOptions[] = [
      { role: 'fileMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          {
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: (_item, win) => {
              if (win) guardedReload(win, false)
            },
          },
          {
            label: 'Force Reload',
            accelerator: 'CmdOrCtrl+Shift+R',
            click: (_item, win) => {
              if (win) guardedReload(win, true)
            },
          },
          { role: 'toggledevtools' },
          { type: 'separator' },
          { role: 'resetzoom' },
          { role: 'zoomin' },
          { role: 'zoomout' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      { role: 'windowMenu' },
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }
```

- [ ] **Step 3: Call `buildApplicationMenu()` during startup**

In the `app.whenReady().then(async () => { ... })` block, add the call directly before `createWindow()`:

```ts
    buildApplicationMenu()
    createWindow()
```

- [ ] **Step 4: Typecheck, lint, format, full test suite**

Run: `npm run typecheck && npm run lint && npx prettier --check electron/main/index.ts electron/main/ipc/mediaWindowHandlers.ts && npx vitest run`
Expected: all clean; test count unchanged from Task 4 (no new tests this task - this is manual-verification-only per the Global Constraints, matching this codebase's convention for Electron menu/dialog wiring).

- [ ] **Step 5: Manual verification via `npm run dev`**

With nothing playing, press Ctrl+R - confirm the window reloads normally with no dialog. Start playing any media track, press Ctrl+R - confirm a native dialog appears with the expected message and "취소"/"새로고침" buttons; clicking "취소" leaves the app exactly as it was (playback continues uninterrupted); clicking "새로고침" reloads the window (playback stops, as expected - the guard's job is to ask first, not to prevent reload from ever happening). Repeat with Ctrl+Shift+R (Force Reload). Confirm every other View menu item (DevTools toggle, zoom in/out/reset, fullscreen toggle) and every File/Edit/Window menu item still works exactly as before this task.

- [ ] **Step 6: Commit**

```bash
git add electron/main/index.ts electron/main/ipc/mediaWindowHandlers.ts
git commit -m "$(cat <<'EOF'
feat: confirm before Reload interrupts in-progress media playback

First custom application menu in this app (previously relied on
Electron's built-in default, silently in effect since
Menu.setApplicationMenu was never called) - reproduces that default
shape exactly via role shorthand for every menu except View, whose
two reload items get a custom handler instead of role: 'reload' /
role: 'forceReload'. No new IPC channel needed: the main process
already receives every media-state change via MEDIA_STATE_BROADCAST
unconditionally (see useMediaPlayerSync.ts), so mediaWindowHandlers.ts
now just also caches isPlaying from traffic that was already
arriving, and index.ts's reload handler reads it synchronously before
deciding whether to just reload or ask first.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (volume fix) → Task 1. §2 (shuffle: store fields, next/prev behavior, cross-window sync, UI button) → Tasks 2-4. §3 (Reload guard: custom menu, isMediaPlaying tracking, confirm dialog) → Task 5. Every spec section has a task.
- **Placeholder scan:** none found - every step has literal code or an exact command.
- **Type consistency:** `shuffleMode`/`shuffleOrder`/`shufflePosition` spelled identically across Task 3's four edit sites (store, schema, sync hook, detach payload) and Task 4's usage. `generateShuffleOrderKeepingFront`/`generateShuffleOrderAvoidingFront` (Task 2) match their import and call sites in Task 3 exactly. `getIsMediaPlaying` (Task 5's own export) matches its import and call site within the same task.
