# Rating/Playtime Inline Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rating shows up as a compact star row on Gallery cards and as a column on List/DetailList; cumulative playtime shows up on RecentlyPlayed rows — all using data these pages already fetch, no new IPC or schema.

**Architecture:** Extend `GameUserDataDto` with `totalPlaytimeMs` (the repository already stores it; only the DTO/handler mapping is missing it), then add pure rendering in four already-existing pages.

**Tech Stack:** React + TypeScript strict + Tailwind + React Query.

## Global Constraints

- No manual/CDP live-UI click verification — skip any "수동 검증" step per this project's established policy.
- This repo has zero component-testing infrastructure for `.tsx` files — no dedicated test file expected for rendering-only changes; run the full test suite to confirm no regressions instead.
- Only render a rating indicator when `rating` is non-null (never show a 0/empty rating row) — this matches the already-established "only render if present" precedent used for genre badges (`genres.length > 0 && (...)`) throughout this codebase.
- This plan is independent of the "shared detail entry point" plan (docs/superpowers/plans/2026-07-30-shared-detail-entry-code-linking-plan.md) — it can be executed before, after, or interleaved with it; the two touch overlapping files (`GalleryPage.tsx`, `ListPage.tsx`, `DetailListPage.tsx`) but different, non-conflicting regions of each. If executing both plans in the same worktree, prefer finishing this plan's tasks on each file before that plan's task on the same file, or vice versa — just don't interleave edits to the same file across the two plans without re-reading its current state first.

---

### Task 1: Extend `GameUserDataDto` with `totalPlaytimeMs`

**Files:**
- Modify: `shared/types/ipc.ts`
- Modify: `electron/main/ipc/gameUserDataHandlers.ts`
- Modify: `src/services/gameUserDataService.ts`

**Interfaces:**
- Produces: `GameUserDataDto.totalPlaytimeMs: number` — Task 5 (RecentlyPlayed) consumes this.

**Context:** `game_user_data.total_playtime_ms` is already stored correctly (via `recordPlaySession`, built in an earlier plan) but the DTO sent to the renderer only carries `{isFavorite, rating, memo}` — the column exists in the database and is never exposed over IPC.

- [ ] **Step 1: Extend the DTO in `shared/types/ipc.ts`**

Change:

```ts
export interface GameUserDataDto {
  isFavorite: boolean
  rating: number | null
  memo: string | null
}
```

to:

```ts
export interface GameUserDataDto {
  isFavorite: boolean
  rating: number | null
  memo: string | null
  totalPlaytimeMs: number
}
```

- [ ] **Step 2: Update `toDto` in `gameUserDataHandlers.ts`**

Change:

```ts
function toDto(row: ReturnType<typeof getGameUserData>): GameUserDataDto | null {
  if (!row) return null
  return { isFavorite: row.isFavorite, rating: row.rating, memo: row.memo }
}
```

to:

```ts
function toDto(row: ReturnType<typeof getGameUserData>): GameUserDataDto | null {
  if (!row) return null
  return {
    isFavorite: row.isFavorite,
    rating: row.rating,
    memo: row.memo,
    totalPlaytimeMs: row.totalPlaytimeMs,
  }
}
```

- [ ] **Step 3: Fix the two optimistic-update sites in `gameUserDataService.ts` that construct a full `GameUserDataDto`**

TypeScript will fail to compile until these are fixed (both currently build an object literal missing the new required field). In `useToggleFavorite`'s `onSuccess`, change:

```ts
    onSuccess: (_result, { entry, isFavorite }) => {
      queryClient.setQueryData<GameUserDataDto | null>(userDataQueryKey(entry), (prev) => ({
        isFavorite,
        rating: prev?.rating ?? null,
        memo: prev?.memo ?? null,
      }))
      queryClient.invalidateQueries({ queryKey: ['game-user-data', 'favorite-keys'] })
    },
```

to:

```ts
    onSuccess: (_result, { entry, isFavorite }) => {
      queryClient.setQueryData<GameUserDataDto | null>(userDataQueryKey(entry), (prev) => ({
        isFavorite,
        rating: prev?.rating ?? null,
        memo: prev?.memo ?? null,
        totalPlaytimeMs: prev?.totalPlaytimeMs ?? 0,
      }))
      queryClient.invalidateQueries({ queryKey: ['game-user-data', 'favorite-keys'] })
    },
```

In `useSetRatingAndMemo`'s `onSuccess`, change:

```ts
    onSuccess: (_result, { entry, rating, memo }) => {
      queryClient.setQueryData<GameUserDataDto | null>(userDataQueryKey(entry), (prev) => ({
        isFavorite: prev?.isFavorite ?? false,
        rating,
        memo,
      }))
    },
```

to:

```ts
    onSuccess: (_result, { entry, rating, memo }) => {
      queryClient.setQueryData<GameUserDataDto | null>(userDataQueryKey(entry), (prev) => ({
        isFavorite: prev?.isFavorite ?? false,
        rating,
        memo,
        totalPlaytimeMs: prev?.totalPlaytimeMs ?? 0,
      }))
    },
```

- [ ] **Step 4: Run the existing `gameUserDataHandlers`-adjacent test coverage and full suite**

Run: `npm run test`
Expected: all pass. This is a pure additive DTO field — no existing test asserts the DTO shape exhaustively (confirm this by reading `gameUserDataRepository.test.ts` and any handler test, if one exists, for a `toEqual` on the full DTO; if you find one that would now fail because it doesn't expect `totalPlaytimeMs`, update its expected value to include it — do not weaken the assertion).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/gameUserDataHandlers.ts src/services/gameUserDataService.ts
git commit -m "feat: expose totalPlaytimeMs on GameUserDataDto"
```

---

### Task 2: Gallery card star row

**Files:**
- Modify: `src/pages/Gallery/GalleryPage.tsx`

**Interfaces:** None new — uses `useGameUserData` (already called in `GameCard`).

**Note before starting:** If the shared-detail-entry-code-linking plan has already run against this file, `GameCard` will have extra props (`onOpenDetail`) and an `onClick` on the outer element that this task's snippet below doesn't show — that's fine, this task's insertion point (between the code-value `<p>` and the genres block) is untouched by that plan either way. Find the insertion point by content match, not by assuming the rest of the file matches this task's snippet exactly.

- [ ] **Step 1: Add a compact star row to `GameCard`**

Add the import: `import { Star } from 'lucide-react'` (extend the existing `import { Heart } from 'lucide-react'` line to `import { Heart, Star } from 'lucide-react'`).

In `GameCard`'s JSX, inside the `<div className="shrink-0 p-2">` block, add a star row after the code line and before the genre-badges block:

```tsx
        {game.code && <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>}
        {userData?.rating != null && (
          <div className="mt-0.5 flex gap-0.5">
            {[1, 2, 3, 4, 5].map((value) => (
              <Star
                key={value}
                className="h-3 w-3 text-yellow-500"
                fill={value <= (userData.rating ?? 0) ? 'currentColor' : 'none'}
              />
            ))}
          </div>
        )}
        {genres.length > 0 && (
```

(This inserts the star block between the existing code-value `<p>` and the existing `{genres.length > 0 && (` block — the rest of that block is unchanged.)

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Gallery/GalleryPage.tsx
git commit -m "feat: show rating stars on Gallery cards"
```

---

### Task 3: List row rating column

**Files:**
- Modify: `src/pages/List/ListPage.tsx`

**Interfaces:** None new — uses `useGameUserData` (already called in `GameRow`).

**Note before starting:** If the shared-detail-entry-code-linking plan has already run against this file, `GameRow` will have an extra `onOpenDetail` prop and the row's outer `<div>` will already be clickable — that's fine, this task's insertion point (the trailing `<span>` showing the modified date) is untouched by that plan either way. Find the insertion point by content match, not by assuming the rest of the file matches this task's snippet exactly.

- [ ] **Step 1: Add a rating indicator to `GameRow`**

Add the import: `import { Heart, Star } from 'lucide-react'` (replacing the existing `import { Heart } from 'lucide-react'` line).

In `GameRow`'s JSX, add a rating span after the existing `<span className="w-24 shrink-0 text-xs text-muted-foreground">{formatMtime(game.mtimeMs)}</span>` line, right before the closing `</div>` of the outer row:

```tsx
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {formatMtime(game.mtimeMs)}
      </span>
      {userData?.rating != null && (
        <div className="flex w-16 shrink-0 gap-0.5">
          {[1, 2, 3, 4, 5].map((value) => (
            <Star
              key={value}
              className="h-3 w-3 text-yellow-500"
              fill={value <= (userData.rating ?? 0) ? 'currentColor' : 'none'}
            />
          ))}
        </div>
      )}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/pages/List/ListPage.tsx
git commit -m "feat: show rating stars on List rows"
```

---

### Task 4: DetailList rating column

**Files:**
- Modify: `src/pages/DetailList/DetailListPage.tsx`

**Interfaces:**
- Consumes: `useGameUserData` (not currently used in this file — must be imported and called per-row).

**Context:** Unlike Gallery/List, `DetailListPage`'s `Row` component doesn't currently call `useGameUserData` at all (it only reads `metadataByCode` for genres). This task adds that call.

**Note before starting:** Read the actual current `Row` function in `DetailListPage.tsx` first — if the shared-detail-entry-code-linking plan has already run against this file, `Row` will already take an `onOpenDetail` prop, `entries[index]` access and the `!entry` guard will already be there, and the outer `<div>` will already have `onClick`/`cursor-pointer`. Either way, this task adds exactly two things to whatever the current `Row` looks like: (1) the `useGameUserData` hook call, placed BEFORE the `if (!entry) return null` early return (React's Rules of Hooks require hooks to run unconditionally every render; `react-window` can pass an out-of-range index during virtualization scroll, so pass `entry ?? { code: null, path: '' }` as the placeholder — this exact pattern is already established in `RatingMemoDialog.tsx` for the same reason); (2) a new rating `<span>` appended as the last child of the row, after the existing size `<span>`. Add these two things to the file as it actually exists; do not overwrite unrelated parts of `Row` (like `onOpenDetail`/`onClick`) if they're already present.

- [ ] **Step 1: Add imports**

```ts
import { Star } from 'lucide-react'
import { useGameUserData } from '../../services/gameUserDataService'
```

- [ ] **Step 2: Add the hook call before the early return**

```ts
  const { data: userData } = useGameUserData(entry ?? { code: null, path: '' })
```

- [ ] **Step 3: Add the rating column as the last child of the row**

```tsx
      <span className="flex w-16 shrink-0 gap-0.5">
        {userData?.rating != null &&
          [1, 2, 3, 4, 5].map((value) => (
            <Star
              key={value}
              className="h-3 w-3 text-yellow-500"
              fill={value <= (userData.rating ?? 0) ? 'currentColor' : 'none'}
            />
          ))}
      </span>
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all pass, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DetailList/DetailListPage.tsx
git commit -m "feat: show rating stars on DetailList rows"
```

---

### Task 5: RecentlyPlayed playtime display

**Files:**
- Modify: `src/pages/RecentlyPlayed/RecentlyPlayedPage.tsx`

**Interfaces:**
- Consumes: `useGameUserData` (existing hook), `GameUserDataDto.totalPlaytimeMs` (Task 1).

- [ ] **Step 1: Write a failing test for the format helper**

Create `src/pages/RecentlyPlayed/formatPlaytime.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatPlaytime } from './formatPlaytime'

describe('formatPlaytime', () => {
  it('formats zero as 0분', () => {
    expect(formatPlaytime(0)).toBe('0분')
  })

  it('formats under an hour as minutes only', () => {
    expect(formatPlaytime(25 * 60_000)).toBe('25분')
  })

  it('formats an exact hour with no leftover minutes', () => {
    expect(formatPlaytime(60 * 60_000)).toBe('1시간')
  })

  it('formats hours and minutes together', () => {
    expect(formatPlaytime(3 * 60 * 60_000 + 20 * 60_000)).toBe('3시간 20분')
  })

  it('rounds down partial minutes', () => {
    expect(formatPlaytime(90_500)).toBe('1분')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm run test -- src/pages/RecentlyPlayed/formatPlaytime.test.ts`
Expected: FAIL — `formatPlaytime.ts` does not exist.

- [ ] **Step 3: Implement `formatPlaytime.ts`**

Create `src/pages/RecentlyPlayed/formatPlaytime.ts`:

```ts
export function formatPlaytime(totalPlaytimeMs: number): string {
  const totalMinutes = Math.floor(totalPlaytimeMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm run test -- src/pages/RecentlyPlayed/formatPlaytime.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it into `RecentlyPlayedPage.tsx`**

Replace the full file:

```tsx
import { useRecentlyPlayed } from '../../services/gameUserDataService'
import { useGameMetadata } from '../../services/metadataService'
import { useGameUserData } from '../../services/gameUserDataService'
import { formatPlaytime } from './formatPlaytime'
import type { GameCode } from '../../../shared/types/scanner'

function codeFromKey(key: string): GameCode | null {
  const match = /^(RJ|VJ|ST)(\d+)$/.exec(key)
  if (!match) return null
  return { type: match[1] as GameCode['type'], value: key }
}

function RecentlyPlayedRow({ entryKey, lastPlayedAt }: { entryKey: string; lastPlayedAt: string }) {
  const code = codeFromKey(entryKey)
  const { data: metadata } = useGameMetadata(code)
  const { data: userData } = useGameUserData({ code, path: code ? '' : entryKey })

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm">
      <span>{metadata?.title ?? entryKey}</span>
      <span className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatPlaytime(userData?.totalPlaytimeMs ?? 0)}</span>
        <span>{lastPlayedAt.slice(0, 10)}</span>
      </span>
    </div>
  )
}

export function RecentlyPlayedPage() {
  const { data: recent, isLoading } = useRecentlyPlayed()

  if (isLoading || !recent) return null

  if (recent.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        아직 플레이한 게임이 없습니다.
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {recent.map((entry) => (
        <RecentlyPlayedRow key={entry.key} entryKey={entry.key} lastPlayedAt={entry.lastPlayedAt} />
      ))}
    </div>
  )
}
```

Note the `useGameUserData({ code, path: code ? '' : entryKey })` call: `entryKey` is either a code string (when `codeFromKey` matched) or a raw path string (when it didn't — a code-less/path-keyed entry). `useGameUserData` takes `{code, path}` and internally uses whichever is non-null (see `identifierKey` in `gameUserDataService.ts`) — so passing `code` when available and the raw `entryKey` as `path` otherwise correctly resolves to the same key `listRecentlyPlayedKeys` originally returned.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Run the full test suite**

Run: `npm run test`
Expected: all pass (5 new + no regressions).

- [ ] **Step 8: Commit**

```bash
git add src/pages/RecentlyPlayed/RecentlyPlayedPage.tsx src/pages/RecentlyPlayed/formatPlaytime.ts src/pages/RecentlyPlayed/formatPlaytime.test.ts
git commit -m "feat: show cumulative playtime on RecentlyPlayed rows"
```

---

### Task 6: Final verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full verification suite**

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
npm run build
```

Expected: all five exit 0. For `format:check`, use the established git-blob-comparison method (`git show HEAD:<path> | npx prettier --check --stdin-filepath <path>`) to isolate real issues from pre-existing CRLF noise before fixing.

- [ ] **Step 2: Commit any fixes**

Only if Step 1 required changes:

```bash
git add -A
git commit -m "fix: address issues found in rating-playtime-display verification pass"
```
