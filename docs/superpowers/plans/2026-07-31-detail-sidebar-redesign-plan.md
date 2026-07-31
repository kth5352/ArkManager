# 상세보기 팝업 → 사이드바 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Gallery/List/DetailList's popup-based `DetailOverlay` (+ 4 stacked dialogs) with a persistent, resizable right-side sidebar panel, while leaving Explorer's popup behavior completely unchanged.

**Architecture:** A shared `useSelectedGameEntry` hook (extracted from the existing `useGameDetailOverlay`) holds the "which path is open" state and re-derives the live entry every render; `useGameDetailOverlay` (Explorer only) and a new `useGameDetailSidebar` (Gallery/List/DetailList) both build on it. `DetailSidebar` is a new component composed of a header plus three section components (`RatingMemoSection`, `LaunchConfigSection`, `CodeLinkSection`) that reuse the exact same mutation hooks the 4 existing dialogs already use, just rendered inline instead of in a `Dialog`.

**Tech Stack:** React 19 + TypeScript strict + Tailwind + shadcn/ui + React Query + Electron IPC (existing `app_settings` key-value table for width persistence).

## Global Constraints

- Explorer (`src/pages/Explorer/FolderView.tsx`), `DetailOverlay.tsx`, `RatingMemoDialog.tsx`, `LaunchConfigDialog.tsx`, `LinkCodeDialog.tsx`, `UnlinkCodeDialog.tsx` must NOT be deleted or have their behavior changed - Explorer keeps using them exactly as today.
- Favorites and RecentlyPlayed pages are out of scope - no changes.
- Sidebar width: clamp 280-520px, default 320px, one shared value across Gallery/List/DetailList (not per-page), persisted via the existing `app_settings` key-value table (same mechanism as theme).
- This codebase has no React component/hook test infrastructure (confirmed: only pure-logic `.test.ts` files exist anywhere in `src/`/`electron/`). Do not write component tests. Only genuinely pure, extractable logic (e.g. `clampSidebarWidth`) gets a `.test.ts`. The final task's manual `npm run dev` check is the verification step for everything else.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```
- Run `npm run test`, `npm run typecheck`, `npm run lint` before every commit in every task; run `npx prettier --write <touched files>` before committing.

---

### Task 1: Extract shared `useSelectedGameEntry` hook

**Files:**
- Create: `src/hooks/useSelectedGameEntry.ts`
- Modify: `src/hooks/useGameDetailOverlay.tsx`

**Interfaces:**
- Produces: `useSelectedGameEntry(entries: ScannedEntry[]): { selectedGame: ScannedEntry | null; openDetail: (entry: ScannedEntry) => void; close: () => void }` - later tasks (2 new hook `useGameDetailSidebar`) call this directly.

This is a pure, behavior-preserving refactor of logic that already exists (and was already reviewed) inside `useGameDetailOverlay.tsx` - no new test infra applies here (it's a React hook, not pure logic), verification is `npm run typecheck` + `npm run test` (full suite must stay green) + a visual sanity check that Explorer's detail popup still works, which the final task's manual pass covers.

- [ ] **Step 1: Create the shared hook**

Create `src/hooks/useSelectedGameEntry.ts`:

```ts
import { useState } from 'react'
import type { ScannedEntry } from '../../shared/types/scanner'

// Shared by useGameDetailOverlay (Explorer's popup) and useGameDetailSidebar
// (Gallery/List/DetailList's panel) - only the opened path is kept in state,
// the entry itself is re-derived from `entries` on every render, so a
// mutation elsewhere (e.g. link/unlink invalidating the games query) is
// reflected in whichever UI has it open without requiring it to be closed
// and reopened.
export function useSelectedGameEntry(entries: ScannedEntry[]): {
  selectedGame: ScannedEntry | null
  openDetail: (entry: ScannedEntry) => void
  close: () => void
} {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const openDetail = (entry: ScannedEntry): void => {
    setSelectedPath(entry.path)
  }

  const close = (): void => {
    setSelectedPath(null)
  }

  const selectedGame = selectedPath ? (entries.find((e) => e.path === selectedPath) ?? null) : null

  // A controlled Dialog's onOpenChange only fires on user-initiated closes
  // (Escape/outside click/close button), not when `open` flips to false
  // because selectedGame itself went null (e.g. the entry left `entries`
  // after an unlink). Adjusting selectedPath here during render - rather
  // than in an effect - is React's documented pattern for this
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
  // it terminates after one extra render because the next pass has
  // selectedPath already null, so the condition can't hold twice. Without
  // this, selectedPath would stay pointing at the now-absent path, and
  // whichever UI has it open could silently reopen later if that same path
  // reappears in `entries` without a fresh openDetail() call.
  if (selectedPath && !selectedGame) {
    setSelectedPath(null)
  }

  return { selectedGame, openDetail, close }
}
```

- [ ] **Step 2: Refactor `useGameDetailOverlay` to use it**

Replace the full contents of `src/hooks/useGameDetailOverlay.tsx` with:

```tsx
import { type JSX } from 'react'
import { DetailOverlay } from '../components/game/DetailOverlay'
import { useSelectedGameEntry } from './useSelectedGameEntry'
import type { ScannedEntry } from '../../shared/types/scanner'

// Explorer-only (see FolderView.tsx) - Gallery/List/DetailList use
// useGameDetailSidebar instead, sharing the same selection/live-refresh
// logic via useSelectedGameEntry.
export function useGameDetailOverlay(entries: ScannedEntry[]): {
  openDetail: (entry: ScannedEntry) => void
  detailOverlayElement: JSX.Element
} {
  const { selectedGame, openDetail, close } = useSelectedGameEntry(entries)

  return {
    openDetail,
    detailOverlayElement: <DetailOverlay game={selectedGame} onClose={close} />,
  }
}
```

- [ ] **Step 3: Verify nothing broke**

Run: `npm run typecheck && npm run test -- --run && npm run lint`
Expected: all three clean (typecheck no errors, full suite green, lint 0 errors / the 1 pre-existing `button.tsx` warning only).

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write src/hooks/useSelectedGameEntry.ts src/hooks/useGameDetailOverlay.tsx
git add src/hooks/useSelectedGameEntry.ts src/hooks/useGameDetailOverlay.tsx
git commit -m "$(cat <<'EOF'
refactor: extract useSelectedGameEntry shared by overlay and upcoming sidebar

Pure extraction of useGameDetailOverlay's selection/live-refresh logic
into its own hook so a new useGameDetailSidebar (Gallery/List/DetailList)
can reuse it without duplicating the re-derive-by-path logic. No
behavior change - useGameDetailOverlay's public shape is identical.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Sidebar width persistence

**Files:**
- Create: `src/lib/clampSidebarWidth.ts`
- Test: `src/lib/clampSidebarWidth.test.ts`
- Modify: `shared/types/ipc.ts`
- Modify: `electron/main/ipc/settingsHandlers.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/services/settingsService.ts`

**Interfaces:**
- Produces: `clampSidebarWidth(width: number): number`, `SIDEBAR_WIDTH_MIN/MAX/DEFAULT` constants, `useSidebarWidthQuery(): UseQueryResult<number>`, `useSetSidebarWidthMutation(): UseMutationResult<void, Error, number>` - Task 3's `DetailSidebar` consumes all of these.
- Consumes: existing `app_settings` key-value mechanism (`getSetting`/`setSetting` in `electron/main/database/settingsRepository.ts`, already generic - untouched).

- [ ] **Step 1: Write the failing test for the clamp helper**

Create `src/lib/clampSidebarWidth.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  clampSidebarWidth,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from './clampSidebarWidth'

describe('clampSidebarWidth', () => {
  it('returns the value unchanged when within bounds', () => {
    expect(clampSidebarWidth(400)).toBe(400)
  })

  it('clamps to the minimum when below it', () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_WIDTH_MIN)
  })

  it('clamps to the maximum when above it', () => {
    expect(clampSidebarWidth(900)).toBe(SIDEBAR_WIDTH_MAX)
  })

  it('falls back to the default for NaN', () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_WIDTH_DEFAULT)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/clampSidebarWidth.test.ts`
Expected: FAIL - `Cannot find module './clampSidebarWidth'`

- [ ] **Step 3: Implement the clamp helper**

Create `src/lib/clampSidebarWidth.ts`:

```ts
export const SIDEBAR_WIDTH_MIN = 280
export const SIDEBAR_WIDTH_MAX = 520
export const SIDEBAR_WIDTH_DEFAULT = 320

export function clampSidebarWidth(width: number): number {
  if (Number.isNaN(width)) return SIDEBAR_WIDTH_DEFAULT
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width))
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/clampSidebarWidth.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Widen the settings IPC schema**

In `shared/types/ipc.ts`, find:

```ts
export const SettingKeySchema = z.enum(['theme'])

export const GetSettingRequestSchema = z.object({
  key: SettingKeySchema,
})
export type GetSettingRequest = z.infer<typeof GetSettingRequestSchema>

export const SetSettingRequestSchema = z.object({
  key: SettingKeySchema,
  value: ThemeSchema,
})
export type SetSettingRequest = z.infer<typeof SetSettingRequestSchema>
```

Replace with:

```ts
export const SettingKeySchema = z.enum(['theme', 'sidebar-width'])

export const GetSettingRequestSchema = z.object({
  key: SettingKeySchema,
})
export type GetSettingRequest = z.infer<typeof GetSettingRequestSchema>

export const SetSettingRequestSchema = z.object({
  key: SettingKeySchema,
  value: z.string(),
})
export type SetSettingRequest = z.infer<typeof SetSettingRequestSchema>
```

(`value` widens from `ThemeSchema`-only to `z.string()` - the theme write path is unaffected since `'light'`/`'dark'` are already strings; `sidebar-width` writes the number stringified.)

- [ ] **Step 6: Branch the GET handler by key**

In `electron/main/ipc/settingsHandlers.ts`, find:

```ts
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, payload: unknown) => {
    const { key } = GetSettingRequestSchema.parse(payload)
    return parseStoredTheme(getSetting(db, key))
  })
```

Replace with:

```ts
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, payload: unknown) => {
    const { key } = GetSettingRequestSchema.parse(payload)
    if (key === 'theme') return parseStoredTheme(getSetting(db, key))
    return getSetting(db, key) ?? null
  })
```

(Only `'theme'` gets the strict `ThemeSchema` validation it always had - `parseStoredTheme` would incorrectly reject a numeric width string against `ThemeSchema` if applied there, so other keys pass through as-is; `clampSidebarWidth` on the renderer side is what protects against a corrupted/non-numeric stored value.)

- [ ] **Step 7: Add preload methods**

In `electron/preload/index.ts`, find the `settings` object:

```ts
  settings: {
    getTheme: (): Promise<Theme | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'theme' }),
    setTheme: (value: Theme): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'theme', value }),
    // Synchronous IPC round-trip used only to apply the persisted theme
    // before the renderer's first paint (see src/main.tsx). Do not use this
    // for anything else - prefer the async getTheme/setTheme above.
    getThemeSync: (): Theme | null =>
      ipcRenderer.sendSync(IPC_CHANNELS.SETTINGS_GET_SYNC) as Theme | null,
  },
```

Replace with:

```ts
  settings: {
    getTheme: (): Promise<Theme | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'theme' }),
    setTheme: (value: Theme): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'theme', value }),
    // Synchronous IPC round-trip used only to apply the persisted theme
    // before the renderer's first paint (see src/main.tsx). Do not use this
    // for anything else - prefer the async getTheme/setTheme above.
    getThemeSync: (): Theme | null =>
      ipcRenderer.sendSync(IPC_CHANNELS.SETTINGS_GET_SYNC) as Theme | null,
    getSidebarWidth: (): Promise<number | null> =>
      ipcRenderer
        .invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'sidebar-width' })
        .then((value: string | null) => (value === null ? null : Number(value))),
    setSidebarWidth: (width: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'sidebar-width', value: String(width) }),
  },
```

- [ ] **Step 8: Add the renderer query/mutation hooks**

In `src/services/settingsService.ts`, add the import and the two hooks at the end of the file:

```ts
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from '../lib/clampSidebarWidth'
```

(add alongside the existing `import type { Theme } from '../../shared/types/ipc'` line)

```ts
export const SIDEBAR_WIDTH_QUERY_KEY = ['settings', 'sidebar-width'] as const

export function useSidebarWidthQuery() {
  return useQuery({
    queryKey: SIDEBAR_WIDTH_QUERY_KEY,
    queryFn: async (): Promise<number> => {
      const value = await window.api.settings.getSidebarWidth()
      return value === null ? SIDEBAR_WIDTH_DEFAULT : clampSidebarWidth(value)
    },
  })
}

export function useSetSidebarWidthMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (width: number) => window.api.settings.setSidebarWidth(clampSidebarWidth(width)),
    onSuccess: (_data, width) => {
      queryClient.setQueryData(SIDEBAR_WIDTH_QUERY_KEY, clampSidebarWidth(width))
    },
  })
}
```

- [ ] **Step 9: Run full verification**

Run: `npm run test -- --run && npm run typecheck && npm run lint`
Expected: all clean (test count should now include the 4 new `clampSidebarWidth` tests).

- [ ] **Step 10: Format and commit**

```bash
npx prettier --write src/lib/clampSidebarWidth.ts src/lib/clampSidebarWidth.test.ts shared/types/ipc.ts electron/main/ipc/settingsHandlers.ts electron/preload/index.ts src/services/settingsService.ts
git add src/lib/clampSidebarWidth.ts src/lib/clampSidebarWidth.test.ts shared/types/ipc.ts electron/main/ipc/settingsHandlers.ts electron/preload/index.ts src/services/settingsService.ts
git commit -m "$(cat <<'EOF'
feat: persist sidebar width via the existing app_settings mechanism

Extends the same generic key-value settings table/IPC pair theme
already uses with a new 'sidebar-width' key, rather than introducing a
separate table or localStorage - one shared value across
Gallery/List/DetailList, clamped 280-520px with a 320px default.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `DetailSidebar` shell + header + `useGameDetailSidebar`

**Files:**
- Create: `src/components/game/DetailSidebar.tsx`
- Create: `src/hooks/useGameDetailSidebar.tsx`

**Interfaces:**
- Consumes: `useSelectedGameEntry` (Task 1), `useSidebarWidthQuery`/`useSetSidebarWidthMutation`/`clampSidebarWidth` (Task 2), `GameThumbnail` (existing, `src/components/game/GameThumbnail.tsx`), `useOpenExternal` (existing, `src/services/shellService.ts`), `useLaunchGame` (existing, `src/services/launchService.ts`).
- Produces: `DetailSidebar({ game, onClose }: { game: ScannedEntry | null; onClose: () => void })`, `useGameDetailSidebar(entries: ScannedEntry[]): { openDetail: (entry: ScannedEntry) => void; detailSidebarElement: JSX.Element }` - Task 4/5/6 add section components as children inside `DetailSidebar`; Task 7 wires the 3 pages to the hook.

At the end of this task `DetailSidebar` is a fully working header-only panel (thumbnail, title, code, action buttons, close button, drag-to-resize) - later tasks add sections beneath the header, they don't need to touch the shell again.

- [ ] **Step 1: Create `DetailSidebar`**

Create `src/components/game/DetailSidebar.tsx`:

```tsx
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '../ui/button'
import { GameThumbnail } from './GameThumbnail'
import { useOpenExternal } from '../../services/shellService'
import { useLaunchGame } from '../../services/launchService'
import { useSetSidebarWidthMutation, useSidebarWidthQuery } from '../../services/settingsService'
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT } from '../../lib/clampSidebarWidth'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface DetailSidebarProps {
  game: ScannedEntry | null
  onClose: () => void
}

export function DetailSidebar({ game, onClose }: DetailSidebarProps) {
  const { data: persistedWidth } = useSidebarWidthQuery()
  const setSidebarWidth = useSetSidebarWidthMutation()
  const [width, setWidth] = useState(SIDEBAR_WIDTH_DEFAULT)
  const openExternal = useOpenExternal()
  const launchGame = useLaunchGame()

  useEffect(() => {
    if (persistedWidth !== undefined) setWidth(persistedWidth)
  }, [persistedWidth])

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
          <Button
            size="sm"
            variant="secondary"
            onClick={() => console.log('open folder', game.path)}
          >
            폴더 열기
          </Button>
          {game.kind === 'folder' && (
            <Button size="sm" variant="secondary" onClick={() => launchGame.mutate(game)}>
              실행
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `useGameDetailSidebar`**

Create `src/hooks/useGameDetailSidebar.tsx`:

```tsx
import { type JSX } from 'react'
import { DetailSidebar } from '../components/game/DetailSidebar'
import { useSelectedGameEntry } from './useSelectedGameEntry'
import type { ScannedEntry } from '../../shared/types/scanner'

// Gallery/List/DetailList only - see useGameDetailOverlay for Explorer's
// popup equivalent. Both share useSelectedGameEntry's selection/live-refresh
// logic.
export function useGameDetailSidebar(entries: ScannedEntry[]): {
  openDetail: (entry: ScannedEntry) => void
  detailSidebarElement: JSX.Element
} {
  const { selectedGame, openDetail, close } = useSelectedGameEntry(entries)

  return {
    openDetail,
    detailSidebarElement: <DetailSidebar game={selectedGame} onClose={close} />,
  }
}
```

- [ ] **Step 3: Run full verification**

Run: `npm run test -- --run && npm run typecheck && npm run lint`
Expected: all clean. (Nothing calls `useGameDetailSidebar` yet - that's Task 7 - so this is purely a compile/lint check at this point.)

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write src/components/game/DetailSidebar.tsx src/hooks/useGameDetailSidebar.tsx
git add src/components/game/DetailSidebar.tsx src/hooks/useGameDetailSidebar.tsx
git commit -m "$(cat <<'EOF'
feat: add DetailSidebar shell (header, thumbnail, actions, resize handle)

New sidebar panel replacing the popup DetailOverlay for
Gallery/List/DetailList - header-only for now (thumbnail, title, code,
DLsite/folder/실행 buttons, close button, drag-to-resize left edge).
Not wired into any page yet (Task 7) and no rating/launch-config/code
sections yet (Tasks 4-6).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `RatingMemoSection` (always-expanded, inline auto-save)

**Files:**
- Create: `src/components/game/RatingMemoSection.tsx`
- Modify: `src/components/game/DetailSidebar.tsx`

**Interfaces:**
- Consumes: `useGameUserData`, `useSetRatingAndMemo` (existing, `src/services/gameUserDataService.ts` - same hooks `RatingMemoDialog.tsx` already uses).
- Produces: `RatingMemoSection({ game: ScannedEntry })` - self-contained, no props beyond `game`.

- [ ] **Step 1: Create `RatingMemoSection`**

Create `src/components/game/RatingMemoSection.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { useGameUserData, useSetRatingAndMemo } from '../../services/gameUserDataService'
import type { GameUserDataDto } from '../../../shared/types/ipc'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface RatingMemoSectionProps {
  game: ScannedEntry
}

// Always-expanded (see DetailSidebar) - rating saves instantly on click
// (mirrors the existing favorite-heart toggle's immediate-save pattern),
// memo saves on blur. Both go through the same setRatingAndMemo mutation
// (there's no separate "rating only" endpoint), so each save sends
// whichever field didn't just change alongside the one that did.
export function RatingMemoSection({ game }: RatingMemoSectionProps) {
  const { data: userData } = useGameUserData(game)
  const setRatingAndMemo = useSetRatingAndMemo()

  const [rating, setRating] = useState<number | null>(userData?.rating ?? null)
  const [memo, setMemo] = useState(userData?.memo ?? '')
  const [syncedUserData, setSyncedUserData] = useState<GameUserDataDto | null | undefined>(
    userData
  )
  const [justSaved, setJustSaved] = useState(false)

  if (userData !== syncedUserData) {
    setSyncedUserData(userData)
    setRating(userData?.rating ?? null)
    setMemo(userData?.memo ?? '')
  }

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [justSaved])

  const handleRatingClick = (value: number): void => {
    const nextRating = value === rating ? null : value
    setRating(nextRating)
    setRatingAndMemo.mutate(
      { entry: game, rating: nextRating, memo: memo.trim() === '' ? null : memo },
      { onSuccess: () => setJustSaved(true) }
    )
  }

  const handleMemoBlur = (): void => {
    if (memo === (userData?.memo ?? '')) return // 변경 없으면 저장 생략
    setRatingAndMemo.mutate(
      { entry: game, rating, memo: memo.trim() === '' ? null : memo },
      { onSuccess: () => setJustSaved(true) }
    )
  }

  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">평점</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} onClick={() => handleRatingClick(value)}>
            <Star
              className="h-5 w-5 text-yellow-500"
              fill={rating !== null && value <= rating ? 'currentColor' : 'none'}
            />
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs font-medium text-muted-foreground">메모</p>
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        onBlur={handleMemoBlur}
        placeholder="메모"
        className="min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      <p className="h-4 text-xs text-muted-foreground">
        {setRatingAndMemo.isPending ? '저장 중...' : justSaved ? '저장됨' : ''}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `DetailSidebar`**

In `src/components/game/DetailSidebar.tsx`, add the import:

```ts
import { RatingMemoSection } from './RatingMemoSection'
```

(add alongside the existing `import { GameThumbnail } from './GameThumbnail'` line)

Then find the closing of the actions button row:

```tsx
          {game.kind === 'folder' && (
            <Button size="sm" variant="secondary" onClick={() => launchGame.mutate(game)}>
              실행
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
```

Replace with:

```tsx
          {game.kind === 'folder' && (
            <Button size="sm" variant="secondary" onClick={() => launchGame.mutate(game)}>
              실행
            </Button>
          )}
        </div>
        <RatingMemoSection game={game} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run full verification**

Run: `npm run test -- --run && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write src/components/game/RatingMemoSection.tsx src/components/game/DetailSidebar.tsx
git add src/components/game/RatingMemoSection.tsx src/components/game/DetailSidebar.tsx
git commit -m "$(cat <<'EOF'
feat: add always-expanded rating/memo section to DetailSidebar

Rating saves instantly on star click (matches the existing
favorite-heart pattern), memo saves on blur with a "저장 중.../저장됨"
status line since there's no longer an explicit save button to signal
the commit. Replaces RatingMemoDialog's role for the sidebar only -
Explorer's popup still uses RatingMemoDialog unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `LaunchConfigSection` (collapsible)

**Files:**
- Create: `src/components/game/LaunchConfigSection.tsx`
- Modify: `src/components/game/DetailSidebar.tsx`

**Interfaces:**
- Consumes: `useListExecutables`, `useLocaleEmulatorAvailable`, `useSetLaunchConfig` (existing, `src/services/launchService.ts`), `usePickSaveFolder`, `useSetSavePath`, `useBackupSaveNow` (existing, `src/services/saveService.ts`) - same hooks `LaunchConfigDialog.tsx` already uses.
- Produces: `LaunchConfigSection({ game: ScannedEntry })`.

- [ ] **Step 1: Create `LaunchConfigSection`**

Create `src/components/game/LaunchConfigSection.tsx`:

```tsx
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import {
  useListExecutables,
  useLocaleEmulatorAvailable,
  useSetLaunchConfig,
} from '../../services/launchService'
import { useBackupSaveNow, usePickSaveFolder, useSetSavePath } from '../../services/saveService'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { LaunchConfigDto } from '../../../shared/types/ipc'

interface LaunchConfigSectionProps {
  game: ScannedEntry
}

// Collapsible, starts collapsed (see DetailSidebar's per-game key resetting
// this section's local `expanded` state on every selection change). Field
// set and explicit-save behavior mirror LaunchConfigDialog.tsx exactly -
// this is used less often than rating/memo, so an explicit save button
// stays appropriate here.
export function LaunchConfigSection({ game }: LaunchConfigSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const folderPath = game.kind === 'folder' ? game.path : ''
  const { data: executables } = useListExecutables(folderPath)
  const { data: leAvailable } = useLocaleEmulatorAvailable()
  const setLaunchConfig = useSetLaunchConfig()
  const pickSaveFolder = usePickSaveFolder()
  const setSavePath = useSetSavePath()
  const backupSaveNow = useBackupSaveNow()

  const [selectedExe, setSelectedExe] = useState('')
  const [launchMode, setLaunchMode] = useState<LaunchConfigDto['launchMode']>('normal')

  const handleSaveLaunchConfig = (): void => {
    if (!selectedExe) return
    setLaunchConfig.mutate({ entry: game, config: { executablePath: selectedExe, launchMode } })
  }

  const handlePickSaveFolder = async (): Promise<void> => {
    const path = await pickSaveFolder.mutateAsync()
    if (path) setSavePath.mutate({ entry: game, savePath: path })
  }

  const handleBackupNow = (): void => {
    backupSaveNow.mutate(game)
  }

  return (
    <div className="border-t border-border pt-3">
      <button
        className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground"
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        실행 설정
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-3">
          {game.kind !== 'folder' ? (
            <p className="text-xs text-muted-foreground">
              압축파일은 실행 설정을 지원하지 않습니다. 먼저 압축을 해제해 주세요.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium">실행파일</p>
                {(executables ?? []).map((exe) => (
                  <label key={exe} className="flex items-center gap-2 text-xs">
                    <input
                      type="radio"
                      name="executable"
                      checked={selectedExe === exe}
                      onChange={() => setSelectedExe(exe)}
                    />
                    {exe}
                  </label>
                ))}
                {(executables ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">exe 파일을 찾을 수 없습니다.</p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium">실행 방식</p>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="launchMode"
                    checked={launchMode === 'normal'}
                    onChange={() => setLaunchMode('normal')}
                  />
                  일반 실행
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="launchMode"
                    checked={launchMode === 'locale-emulator'}
                    onChange={() => setLaunchMode('locale-emulator')}
                    disabled={!leAvailable}
                  />
                  Locale Emulator로 실행{!leAvailable && ' (설치되어 있지 않음)'}
                </label>
              </div>

              <Button size="sm" onClick={handleSaveLaunchConfig} disabled={!selectedExe}>
                실행 설정 저장
              </Button>

              <div className="border-t border-border pt-3">
                <p className="text-xs font-medium">세이브 파일 백업 위치</p>
                <div className="mt-1 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={handlePickSaveFolder}>
                    세이브 폴더 지정
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleBackupNow}
                    disabled={backupSaveNow.isPending}
                  >
                    지금 백업
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `DetailSidebar`**

In `src/components/game/DetailSidebar.tsx`, add the import alongside `RatingMemoSection`'s:

```ts
import { LaunchConfigSection } from './LaunchConfigSection'
```

Find:

```tsx
        <RatingMemoSection game={game} />
      </div>
    </div>
  )
}
```

Replace with:

```tsx
        <RatingMemoSection game={game} />
        <LaunchConfigSection game={game} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run full verification**

Run: `npm run test -- --run && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write src/components/game/LaunchConfigSection.tsx src/components/game/DetailSidebar.tsx
git add src/components/game/LaunchConfigSection.tsx src/components/game/DetailSidebar.tsx
git commit -m "$(cat <<'EOF'
feat: add collapsible launch-config section to DetailSidebar

Reuses LaunchConfigDialog.tsx's exact field set and hooks
(executable/launch-mode selection + save backup), collapsed by
default. Replaces LaunchConfigDialog's role for the sidebar only -
Explorer's popup still uses LaunchConfigDialog unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `CodeLinkSection` (collapsible)

**Files:**
- Create: `src/components/game/CodeLinkSection.tsx`
- Modify: `src/components/game/DetailSidebar.tsx`

**Interfaces:**
- Consumes: `useLinkCode`, `useUnlinkCode` (existing, `src/services/gameUserDataService.ts`), `useCrawlGameMetadata` (existing, `src/services/metadataService.ts`), `parseCodeInput` (existing, `src/pages/DlsiteSearch/parseCodeInput.ts`) - same as `LinkCodeDialog.tsx`/`UnlinkCodeDialog.tsx`.
- Produces: `CodeLinkSection({ game: ScannedEntry })`.

- [ ] **Step 1: Create `CodeLinkSection`**

Create `src/components/game/CodeLinkSection.tsx`:

```tsx
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useLinkCode, useUnlinkCode } from '../../services/gameUserDataService'
import { useCrawlGameMetadata } from '../../services/metadataService'
import { parseCodeInput } from '../../pages/DlsiteSearch/parseCodeInput'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface CodeLinkSectionProps {
  game: ScannedEntry
}

// Collapsible, starts collapsed. Branches on the same 3 resolveCode cases
// DetailOverlay's button visibility already relies on: no code -> link
// form, override-linked code -> unlink control, filename-derived code ->
// no action available (LinkCodeDialog/UnlinkCodeDialog were never reachable
// for that case either - this just also explains why, instead of showing
// nothing at all).
export function CodeLinkSection({ game }: CodeLinkSectionProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-t border-border pt-3">
      <button
        className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground"
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        코드 연동 관리
      </button>
      {expanded &&
        (game.code && game.codeSource === 'override' ? (
          <UnlinkSection game={game} />
        ) : !game.code ? (
          <LinkSection game={game} />
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            파일명에서 인식된 코드는 연동 해제를 지원하지 않습니다.
          </p>
        ))}
    </div>
  )
}

function LinkSection({ game }: { game: ScannedEntry }) {
  const [input, setInput] = useState('')
  const [confirming, setConfirming] = useState(false)
  const linkCode = useLinkCode()
  const crawlMetadata = useCrawlGameMetadata()

  const parsedCode = parseCodeInput(input)

  const handleConfirm = (): void => {
    if (!parsedCode) return
    linkCode.mutate(
      { path: game.path, code: parsedCode },
      {
        onSuccess: () => {
          crawlMetadata.mutate(parsedCode)
          setConfirming(false)
          setInput('')
        },
      }
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {!confirming ? (
        <>
          <p className="text-xs text-muted-foreground">
            폴더명을 직접 바꾸면 기존 즐겨찾기/평점 기록이 유지되지 않습니다. 데이터를 유지하려면
            여기서 코드를 연동하세요.
          </p>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="RJ01234567"
            className="h-8 text-xs"
          />
          <Button size="sm" onClick={() => setConfirming(true)} disabled={!parsedCode}>
            다음
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs">
            <span className="font-medium">{parsedCode?.value}</span>(으)로 연동합니다. 잘못
            연동했다면 나중에 &quot;연동 해제&quot;로 연동을 해제할 수 있습니다.
          </p>
          {linkCode.isError && (
            <p className="text-xs text-destructive">연동에 실패했습니다. 다시 시도해주세요.</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              뒤로
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={!parsedCode || linkCode.isPending}>
              연동 확정
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function UnlinkSection({ game }: { game: ScannedEntry }) {
  const [confirming, setConfirming] = useState(false)
  const unlinkCode = useUnlinkCode()

  const handleConfirm = (): void => {
    unlinkCode.mutate({ path: game.path }, { onSuccess: () => setConfirming(false) })
  }

  if (!confirming) {
    return (
      <div className="mt-2">
        <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          연동 해제
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-xs">
        <span className="font-medium">{game.code?.value}</span> 연동을 해제합니다. 이후 이 폴더는
        다시 코드없는 항목으로 표시됩니다.
      </p>
      <p className="text-xs text-muted-foreground">
        지금까지 쌓인 즐겨찾기·평점·메모·플레이타임 기록은 삭제되지 않고 {game.code?.value} 코드에
        그대로 남습니다. 같은 코드로 다시 연동하면 기록이 복원되지만, 다른 코드로 연동하면 이 기록을
        다시 찾을 수 없게 됩니다.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
          취소
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={unlinkCode.isPending}>
          연동 해제
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `DetailSidebar`**

In `src/components/game/DetailSidebar.tsx`, add the import alongside the other section imports:

```ts
import { CodeLinkSection } from './CodeLinkSection'
```

Find:

```tsx
        <RatingMemoSection game={game} />
        <LaunchConfigSection game={game} />
      </div>
    </div>
  )
}
```

Replace with:

```tsx
        <RatingMemoSection game={game} />
        <LaunchConfigSection game={game} />
        <CodeLinkSection game={game} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run full verification**

Run: `npm run test -- --run && npm run typecheck && npm run lint`
Expected: all clean.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write src/components/game/CodeLinkSection.tsx src/components/game/DetailSidebar.tsx
git add src/components/game/CodeLinkSection.tsx src/components/game/DetailSidebar.tsx
git commit -m "$(cat <<'EOF'
feat: add collapsible code-link/unlink section to DetailSidebar

Folds LinkCodeDialog's 2-step confirm and UnlinkCodeDialog's confirm
into one collapsible section, branching on the same code/codeSource
cases DetailOverlay's button visibility already relies on. Replaces
both dialogs' role for the sidebar only - Explorer's popup still uses
LinkCodeDialog/UnlinkCodeDialog unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire Gallery/List/DetailList to the sidebar, final verification

**Files:**
- Modify: `src/pages/Gallery/GalleryPage.tsx`
- Modify: `src/pages/List/ListPage.tsx`
- Modify: `src/pages/DetailList/DetailListPage.tsx`

**Interfaces:**
- Consumes: `useGameDetailSidebar` (Task 3).

- [ ] **Step 1: Wire `GalleryPage.tsx`**

Find:

```ts
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
```

Replace with:

```ts
import { useGameDetailSidebar } from '../../hooks/useGameDetailSidebar'
```

Find:

```ts
  const { openDetail, detailOverlayElement } = useGameDetailOverlay(games ?? [])
```

Replace with:

```ts
  const { openDetail, detailSidebarElement } = useGameDetailSidebar(games ?? [])
```

Find the full return block:

```tsx
      {sortedGames.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.
        </div>
      ) : (
        <div ref={containerRef} className="h-full w-full p-6">
          <AutoSizer
            style={{ height: '100%', width: '100%' }}
            renderProp={({ height, width }) => {
              if (height === undefined || width === undefined) return null

              const columnCount = Math.max(1, Math.floor(width / (cardWidth + gap)))
              const usedWidth = columnCount * (cardWidth + gap)
              const extraPerColumn = columnCount > 0 ? (width - usedWidth) / columnCount : 0
              const effectiveColumnWidth = cardWidth + gap + extraPerColumn
              const rowCount = Math.ceil(sortedGames.length / columnCount)

              return (
                <Grid
                  cellComponent={GameCell}
                  cellProps={{
                    games: sortedGames,
                    columnCount,
                    gap,
                    cardWidth,
                    metadataByCode,
                    onToggleGenreFilter: toggleGenreFilter,
                    onHoverChange: setHoveredGame,
                    onOpenDetail: openDetail,
                  }}
                  columnCount={columnCount}
                  columnWidth={effectiveColumnWidth}
                  rowCount={rowCount}
                  rowHeight={cardHeight + gap}
                  style={{ height, width, overflowX: 'hidden' }}
                />
              )
            }}
          />
        </div>
      )}
      {detailOverlayElement}
    </div>
  )
}
```

Replace with:

```tsx
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {sortedGames.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.
            </div>
          ) : (
            <div ref={containerRef} className="h-full w-full p-6">
              <AutoSizer
                style={{ height: '100%', width: '100%' }}
                renderProp={({ height, width }) => {
                  if (height === undefined || width === undefined) return null

                  const columnCount = Math.max(1, Math.floor(width / (cardWidth + gap)))
                  const usedWidth = columnCount * (cardWidth + gap)
                  const extraPerColumn = columnCount > 0 ? (width - usedWidth) / columnCount : 0
                  const effectiveColumnWidth = cardWidth + gap + extraPerColumn
                  const rowCount = Math.ceil(sortedGames.length / columnCount)

                  return (
                    <Grid
                      cellComponent={GameCell}
                      cellProps={{
                        games: sortedGames,
                        columnCount,
                        gap,
                        cardWidth,
                        metadataByCode,
                        onToggleGenreFilter: toggleGenreFilter,
                        onHoverChange: setHoveredGame,
                        onOpenDetail: openDetail,
                      }}
                      columnCount={columnCount}
                      columnWidth={effectiveColumnWidth}
                      rowCount={rowCount}
                      rowHeight={cardHeight + gap}
                      style={{ height, width, overflowX: 'hidden' }}
                    />
                  )
                }}
              />
            </div>
          )}
        </div>
        {detailSidebarElement}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire `ListPage.tsx`**

Find:

```ts
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
```

Replace with:

```ts
import { useGameDetailSidebar } from '../../hooks/useGameDetailSidebar'
```

Find:

```ts
  const { openDetail, detailOverlayElement } = useGameDetailOverlay(games ?? [])
```

Replace with:

```ts
  const { openDetail, detailSidebarElement } = useGameDetailSidebar(games ?? [])
```

Find:

```tsx
      {sortedGames.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.
        </div>
      ) : (
        <div className="h-full w-full">
          <AutoSizer
            style={{ height: '100%', width: '100%' }}
            renderProp={({ height, width }) => {
              if (height === undefined || width === undefined) return null

              return (
                <List
                  rowComponent={Row}
                  rowProps={{
                    games: sortedGames,
                    metadataByCode,
                    onToggleGenreFilter: toggleGenreFilter,
                    onOpenDetail: openDetail,
                  }}
                  rowCount={sortedGames.length}
                  rowHeight={ROW_HEIGHT}
                  style={{ height, width }}
                />
              )
            }}
          />
        </div>
      )}
      {detailOverlayElement}
    </div>
  )
}
```

Replace with:

```tsx
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {sortedGames.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.
            </div>
          ) : (
            <div className="h-full w-full">
              <AutoSizer
                style={{ height: '100%', width: '100%' }}
                renderProp={({ height, width }) => {
                  if (height === undefined || width === undefined) return null

                  return (
                    <List
                      rowComponent={Row}
                      rowProps={{
                        games: sortedGames,
                        metadataByCode,
                        onToggleGenreFilter: toggleGenreFilter,
                        onOpenDetail: openDetail,
                      }}
                      rowCount={sortedGames.length}
                      rowHeight={ROW_HEIGHT}
                      style={{ height, width }}
                    />
                  )
                }}
              />
            </div>
          )}
        </div>
        {detailSidebarElement}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire `DetailListPage.tsx`**

Find:

```ts
import { useGameDetailOverlay } from '../../hooks/useGameDetailOverlay'
```

Replace with:

```ts
import { useGameDetailSidebar } from '../../hooks/useGameDetailSidebar'
```

Find:

```ts
  const { openDetail, detailOverlayElement } = useGameDetailOverlay(games ?? [])
```

Replace with:

```ts
  const { openDetail, detailSidebarElement } = useGameDetailSidebar(games ?? [])
```

Find:

```tsx
      {sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          표시할 항목이 없습니다.
        </div>
      ) : (
        <div className="h-full w-full">
          <AutoSizer
            style={{ height: '100%', width: '100%' }}
            renderProp={({ height, width }) => {
              if (height === undefined || width === undefined) return null
              return (
                <List
                  rowComponent={Row}
                  rowProps={{ entries: sorted, metadataByCode, onOpenDetail: openDetail }}
                  rowCount={sorted.length}
                  rowHeight={ROW_HEIGHT}
                  style={{ height, width }}
                />
              )
            }}
          />
        </div>
      )}
      {detailOverlayElement}
    </div>
  )
}
```

Replace with:

```tsx
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {sorted.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              표시할 항목이 없습니다.
            </div>
          ) : (
            <div className="h-full w-full">
              <AutoSizer
                style={{ height: '100%', width: '100%' }}
                renderProp={({ height, width }) => {
                  if (height === undefined || width === undefined) return null
                  return (
                    <List
                      rowComponent={Row}
                      rowProps={{ entries: sorted, metadataByCode, onOpenDetail: openDetail }}
                      rowCount={sorted.length}
                      rowHeight={ROW_HEIGHT}
                      style={{ height, width }}
                    />
                  )
                }}
              />
            </div>
          )}
        </div>
        {detailSidebarElement}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run full automated verification**

Run: `npm run test -- --run && npm run typecheck && npm run lint && npm run build`
Expected: all clean, build produces the NSIS installer successfully.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/pages/Gallery/GalleryPage.tsx src/pages/List/ListPage.tsx src/pages/DetailList/DetailListPage.tsx
git add src/pages/Gallery/GalleryPage.tsx src/pages/List/ListPage.tsx src/pages/DetailList/DetailListPage.tsx
git commit -m "$(cat <<'EOF'
feat: switch Gallery/List/DetailList from popup detail view to the sidebar

Grid/list content wraps in a flex row with the sidebar as a sibling, so
AutoSizer naturally reflows to the narrower width when the sidebar
opens - no column-count logic changes needed. Explorer is unaffected,
still on useGameDetailOverlay/DetailOverlay.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Manual verification with `npm run dev`**

This codebase has no component/hook test infrastructure - this manual pass is the actual verification for the whole plan's UI behavior. Run `npm run dev` and check:

1. Gallery: click a card -> sidebar opens on the right, grid columns reflow narrower.
2. Click a different card while the sidebar is open -> content swaps in place, sidebar doesn't close.
3. Click the already-open card again -> sidebar closes.
4. Press `Esc` while the sidebar is open (and no input is focused) -> sidebar closes.
5. Drag the sidebar's left edge -> width changes live; reopen the app (or navigate away and back) -> width persisted.
6. Click a star in the 평점 row -> saves immediately, no save button needed.
7. Type in 메모, click elsewhere (blur) -> "저장 중..." then "저장됨" appears briefly.
8. Expand "실행 설정" -> same fields/behavior as the old popup; collapse and reopen a different card -> section is collapsed again.
9. Expand "코드 연동 관리" on a code-less item -> link flow works end-to-end (2-step confirm); on an override-linked item -> unlink flow works.
10. Switch to List and DetailList pages -> same sidebar behavior.
11. Switch to Explorer -> detail view is still the old popup (`DetailOverlay`), completely unaffected.
12. No console errors during any of the above.

Report back what you saw, and fix anything broken before considering this plan complete.

## After All Tasks

All 7 tasks complete: `useSelectedGameEntry` shared between Explorer's popup and the new sidebar, sidebar width persisted via `app_settings`, `DetailSidebar` with header + 3 sections (rating/memo always expanded with inline auto-save, launch-config and code-link collapsible), Gallery/List/DetailList wired to it, Explorer completely unaffected. Proceed to `superpowers:finishing-a-development-branch` once the manual verification pass is clean.
