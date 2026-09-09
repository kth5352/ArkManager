# P0 Performance Baseline — 2026-09-09 (synthetic benchmark)

Measured at commit `d3ed472` (immediately after the Bundle 1 / R0-R2 fixes landed, before any P1/P2/P3 work). Environment: Node 22.21.1, Vitest 4.1.10, Windows dev machine (no other measurements of CPU model/power state were recorded — treat absolute numbers as illustrative, relative comparisons as the reliable signal).

## What this covers, and what it does not

This session has no way to launch the actual Electron app's GUI, drive real user interaction, or run a real React DevTools Profiler session against a rendered window. What follows is a **synthetic benchmark**: real production code (the actual `filterEntries`/`sortEntries`/`groupDuplicatesByCode`/`useVisibleGames`/`useGameCoverImage`/`useMediaPlayerSync`'s subscribe logic, imported unmodified) exercised under jsdom + a real React 19 reconciler + a real TanStack QueryClient + a real Zustand store, with synthetic data at the plan's requested N values. This measures the **shape and magnitude** of the costs P1/P2/P3 target, not real-world wall-clock UX latency, main-process CPU, renderer memory, or actual scroll/input feel. Each scenario's benchmark script was a temporary, uncommitted file under `src/` (matching an existing `.test.ts` path so Vitest could run it), deleted immediately after its numbers were captured — no permanent test files or product instrumentation were added by this task.

**Not measured, explicitly incomplete (needs the real running app):**
- Actual main-process CPU / renderer memory (Task Manager, Electron's own process metrics)
- Real input latency (p50/p95) typing into a live search box
- Real scroll performance / frame timing
- Native mpv playback behavior under any of this
- Anything under design §7's screen/locale/DPI matrix

## Scenario 1 — list derivation cost (P1 target)

Real `filterEntries`, `sortEntries`, `groupDuplicatesByCode`, `getExtractedArchiveCodes` from `src/lib/`, called directly (no React) against synthetic `ScannedEntry[]` at N=100/1000/10000 (mixed folder/file entries, ~1/3 coded, occasional duplicate codes and archive files, Korean/Japanese-mixed names). 5 calls per scenario, min/median/max reported (first call included, not separated as true "cold" since JIT warmup within a single process is itself part of what a real render pays for on first mount).

| Operation | N=100 (median) | N=1000 (median) | N=10000 (median) |
| --- | --- | --- | --- |
| `filterEntries` (10-char query) | 0.07ms | 0.25ms | 2.14ms |
| `filterEntries` (empty query, archive-only) | 0.01ms | 0.04ms | 0.42ms |
| `sortEntries` (name, asc) | 0.09ms | 0.42ms | 3.58ms |
| `sortEntries` (mtime, desc) | 0.01ms | 0.01ms | 0.12ms |
| `groupDuplicatesByCode` | 0.04ms | 0.21ms | 1.76ms |
| `getExtractedArchiveCodes` | 0.01ms | 0.07ms | 1.12ms |
| `new Set(entries.map(e => e.path))` | 0.004ms | 0.06ms | 0.55ms |

**Reading:** no single derivation call is expensive even at N=10000 (worst case ~3.6ms for name-sort). The real cost is **how often** these run, not their individual cost — which is exactly what Scenario 2 measures directly.

## Scenario 2 — `useVisibleGames()` referential stability (P1 target)

Real `useVisibleGames()` hook, `useGames`/`useLibraries`/`useExcludedEntries`/`useLibraryVisibilityStore` mocked to return fixed data, rendered inside a real React 19 tree (jsdom) wrapped in `<Profiler>`. A harness component calls the hook and also holds a `tick` counter unrelated to games/excluded/hidden-libraries state; the counter is incremented 5 times (simulating 5 renders caused by something else entirely - e.g. opening the detail sidebar, changing zoom).

| N | Commits | Unique `data` array references seen | Commit duration (median / max) |
| --- | --- | --- | --- |
| 100 | 6 | **6 / 6** (every commit) | 0.19ms / 3.49ms |
| 1000 | 6 | **6 / 6** | 0.31ms / 0.69ms |
| 10000 | 6 | **6 / 6** | 1.30ms / 1.71ms |

**Reading:** confirms P1's diagnosis directly, not by inference from reading the source - `useVisibleGames().data` is a **brand new array (and a brand new `Set` internally) on every single render**, regardless of whether anything the hook actually depends on changed. At N=10000, that's ~1.3ms of wasted array/Set construction per unrelated re-render just inside this one hook, before any downstream consumer (GalleryPage's own filter/sort/groupDuplicates from Scenario 1, stacked on top) redoes ITS OWN work because it also sees a "new" input. Combined, an unrelated interaction at N=10000 plausibly costs high-single-digit milliseconds of avoidable main-thread work - not catastrophic on its own, but exactly the kind of cost that compounds across a 10-keystroke search or a scroll session.

## Scenario 3 — cover-image re-fetch on remount (P2 target)

Real `useGameCoverImage(code)` hook, real `QueryClient` (bare `new QueryClient()`, matching `src/main.tsx` exactly), `window.api.metadata.getCoverImage` mocked with a call counter. A single component using the hook for one fixed code is mounted, allowed to settle, unmounted, and remounted 5 times total - simulating `react-window` recycling a Gallery card as the user scrolls the same track out of and back into view.

| Configuration | `getCoverImage` calls across 5 remounts of the SAME code |
| --- | --- |
| Current behavior (no `staleTime` set → default `0`) | **5** (every remount re-fetches) |
| With `staleTime: 5 * 60_000` (P2's candidate fix) | **1** (only the first mount fetches) |

**Reading:** this is a clean, direct confirmation of both the problem's existence and the specific fix's effect size for this exact access pattern - a 5x reduction in redundant IPC+main-process-readFile+base64-encode work for repeat views of the same cover within the cache window. Real-world benefit scales with how often the same card scrolls in/out within 5 minutes, which this benchmark doesn't measure (that needs real scroll behavior).

## Scenario 4 — media state broadcast (P3 target)

Real Zustand `useMediaPlayerStore`, subscribed the same way `useMediaPlayerSync.ts` does (whole-store subscribe, no selector), real `toSyncState` projection logic copied inline (the hook itself isn't exported standalone). Two things measured: (a) how many times the subscribe callback fires for store changes to fields `toSyncState` doesn't even read, and (b) the serialized JSON size of one broadcast payload at large queue sizes.

| Measurement | Result |
| --- | --- |
| `broadcastState`-equivalent calls for 3 UI-only changes (`mediaExpanded`, `sidebarActiveTab`, `mediaFullscreenBarHeight` - none present in the sync DTO) | **3** (one per change, unconditionally) |
| Broadcast payload size, playlist N=100 | 8.9 KB |
| Broadcast payload size, playlist N=10000 | **916.0 KB** |

**Reading:** confirms P3's diagnosis precisely - every store mutation broadcasts, including ones that can't possibly matter to another window because they're not even in the DTO. The severity scales with queue size: at a 10,000-track queue (the plan's own upper bound), toggling the sidebar or resizing the fullscreen bar sends **~916KB over IPC to every other window**, for a change the receiving window's `onStateSync` will apply as a no-op (the playlist didn't change). A user with a large "greatest hits" playlist loaded who just opens/closes the media sidebar a few times is paying this cost repeatedly for zero benefit.

## Summary for P1/P2/P3 prioritization

| Task | Confirmed problem? | Rough magnitude at N=10000 | Confidence |
| --- | --- | --- | --- |
| P1 (list derivation) | Yes - referential instability confirmed directly, not inferred | ~1.3ms/render (hook alone) + ~2-4ms/render (downstream filter/sort) if a consumer isn't memoized | High (direct measurement) |
| P2 (cover cache) | Yes - exact fix effect size measured | 5x fewer IPC calls for repeat-view access pattern | High (direct measurement) |
| P3 (media broadcast) | Yes - and the worst-case magnitude is the most dramatic of the three | ~916KB IPC payload per irrelevant UI toggle at a 10k-track queue | High (direct measurement) |

All three should be re-measured with these same synthetic scenarios once implemented, per the plan's own re-measurement requirement - this document's numbers are the "before" baseline only.

## Re-measurement after P1 (list derivation stabilization)

Commit: (see the `perf: stabilize visible games and library derived data` commit immediately following this doc's initial version).

Scenario 2 (`useVisibleGames()` reference stability) was re-run as a permanent regression test (`src/hooks/useVisibleGames.test.ts`, not a throwaway benchmark this time) rather than re-measured ad hoc, since the fix makes the property itself the thing worth continuously guarding: with the `useMemo` wrapping in place, `data` (and the internal `excludedPaths` Set) now stays the exact same reference across a re-render caused by state the hook doesn't read, and produces a genuinely new reference only when `games`, `excludedEntries`, `hiddenLibraryIds`, or `libraries` actually change. Empirically verified by reverting the implementation only and confirming the reference-stability test fails against the pre-fix code with the exact same "brand new array every render" symptom Scenario 2 originally measured.

The same `useMemo` treatment was applied to `GalleryPage.tsx`/`ListPage.tsx`/`DetailListPage.tsx`'s own `codes`/`gameCodes`/`duplicateGroups`/`extractedArchiveCodes`/filtered/sorted/visible derivations (Scenario 1's targets), moved above each page's `isLoading`/`isError` early return (required - hooks can't be called conditionally) and scoped to only the inputs each actually depends on. Not independently re-benchmarked at the full-page level (these pages have heavy DOM/virtualization/dnd-kit dependencies not practical to harness synthetically in the time available) - the underlying claim (memoized derivation recomputes only when its own dependencies change, not on every render) is the same property `useVisibleGames.test.ts` directly proves for the hook layer, and `react-hooks/exhaustive-deps` lint confirms no dependency was omitted at the page layer.
