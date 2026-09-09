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

## Re-measurement after P2 (cover cache)

Scenario 3's claim (5 remounts -> 5 IPC calls without `staleTime`, 1 call with it) was re-verified as a permanent regression test rather than an ad hoc re-benchmark, for the same reason as P1: `src/services/metadataService.test.ts` and `src/services/gameUserDataService.test.ts` now directly assert the real `useGameCoverImage`/`useCustomCoverImage` hooks against a real `QueryClient`, covering: (a) no re-fetch on remount within the 5-minute window, (b) an exact-key invalidation still refetches and the new value reaches the DOM, (c) a `null` (no-cover) result is cached and refreshed the same way once a later crawl succeeds, and (d) a real `useSetCustomCoverFromFile` mutation's existing `invalidateCustomCover` call correctly busts the stale cache and the new custom cover is served. All empirically verified by reverting `metadataService.ts`/`gameUserDataService.ts` only and confirming both new test files fail with the exact "still fetched N times, expected 1" symptom Scenario 3 measured, then restored.

The invalidation-matrix audit (before writing any code) found every non-`staleTime` requirement from the plan's checklist was already satisfied by existing code: `useCrawlGameMetadata`'s `onSettled`, `useBulkCrawlMissingMetadata`'s progress handler, and `useClearCache`'s `onSuccess` all already invalidate the shared `['metadata']` prefix (which `useGameCoverImage`'s key falls under), and `useSetCustomCoverFromFile`/`useSetCustomCoverFromClipboard`/`useClearCustomCover` already call `invalidateCustomCover` (both `userDataQueryKey` and `customCoverImageQueryKey`). `useLinkCode`/`useUnlinkCode` don't need cover-image invalidation at all - a code link/unlink changes the entry's query-key IDENTITY, so the new identity's cover query has no stale cache to begin with. No invalidation gaps were found or needed fixing; only the two `staleTime: 5 * 60_000` additions were required.

## Re-measurement after P3 (media broadcast dedup)

Scenario 4's claim (a UI-only store change broadcasts unconditionally; a large playlist inflates every such broadcast to ~916KB) was re-verified as permanent regression tests rather than an ad hoc re-benchmark, for the same reason as P1/P2: `src/hooks/useMediaPlayerSync.test.ts` (8 tests) and `src/lib/mediaSyncState.test.ts` (14 tests) now directly assert the real hook and its new pure comparison helper. Confirmed: 3 UI-only state changes (`setMediaExpanded`, `setSidebarActiveTab`, `setMediaFullscreenBarHeight`) now produce 0 broadcasts (was 3, one per change, unconditionally); each of the 7 sync-relevant actions (volume/playing/track/queue/repeat/shuffle/detach) still produces exactly 1 broadcast; applying a remote sync produces 0 broadcasts (no ping-pong); the `applyingRemote` guard now releases via `try/finally` even if `setState` throws (previously it stayed stuck `true`, silently disabling this window's own future broadcasts); a state-sync request from another window still gets an unconditional response (not gated by the new equality check, since a fresh window has no prior state to compare against); and the subscription is genuinely cleaned up on unmount.

Empirically verified by reverting `useMediaPlayerSync.ts` only (keeping its new tests) and confirming 2 of 8 tests fail against the pre-fix code: the UI-only-change test failed with 3 unconditional broadcasts (the exact P0-measured symptom), and the throw-in-setState test failed because the guard stayed stuck without `try/finally`. Restored cleanly afterward.

The `sameMediaSyncState` field-by-field reference-equality approach was validated against the store's actual immutable-update contract, not assumed: a new permanent test in `mediaPlayerStore.test.ts` (`produces a genuinely new playlist array reference, not an in-place mutation`) confirms `reorderPlaylist` never mutates the existing array in place, which is the precondition the whole dedup approach depends on (a mutated-in-place array would make `sameMediaSyncState` wrongly report "unchanged" for a real content change).

Broadcast payload size itself (the ~916KB-at-N=10000 number) is unaffected by P3 - this task reduces how OFTEN a broadcast fires for irrelevant changes, not the size of a broadcast that's actually warranted by a real playlist/playback change. A large-queue user still pays the full payload size on every genuine queue mutation or playback state change, just not on every unrelated UI toggle anymore.

## D1 — Scanner concurrency and progress (investigated, partially fixed)

**Concurrency: confirmed and fixed.** A synthetic benchmark (mocked `stat()`/`readdir()`, tracking live concurrent-call count) measured `scanNonImageChildren`'s own `Promise.all(names.map(...))` firing **10,000 concurrent `stat()` calls** for one flat 10,000-entry folder, and **20,000** when `scannerHandlers.ts`'s existing `Promise.all(libraryPaths.map(...))` scans 2 libraries in parallel (each folder's own unbounded fan-out stacking on top of the others). This is a genuine, measured problem - unbounded concurrent syscalls at that scale risks exhausting Node's libuv threadpool (default size 4) and spiking memory from tens of thousands of simultaneously-pending Promises.

Fixed with a new internal `createConcurrencyLimiter` (`electron/main/scanner/concurrencyLimiter.ts`, own 5-test suite) - a minimal FIFO semaphore, no new dependency. Wired around `toScannedEntry`'s `stat()` call only (the leaf-level cost), via a single module-level limiter shared across the whole process (not per-folder or per-library, so the cap holds even when multiple folders/libraries scan concurrently) at the plan's suggested starting concurrency of 32. Deliberately NOT wrapped around the whole recursive folder walk, per the plan's own deadlock warning - only the `stat()` call itself acquires/releases a permit.

Verified unchanged: `coded folder stop`, `images excluded`, `junction skip` (all 25 pre-existing `folderScanner.test.ts` tests still pass unmodified), input order preserved (`Promise.all` still returns in array order regardless of completion order), `null` skip on a stat failure (unaffected - the limiter's `finally` releases the permit before `toScannedEntry`'s own catch converts the failure to `null`), and progress count identical (new test: exactly one `onProgress` call per entry, 200/200, under the limiter). A new integration-level test (`folderScanner.test.ts`) confirms the real scan path never exceeds 32 concurrent `stat()` calls for a 200-entry synthetic folder. Empirically verified: reverted `folderScanner.ts` only (keeping the new tests) and confirmed the concurrency-cap test fails (peak hit all 200, unbounded) against the pre-fix code, then restored it.

**8/16/32/64 comparison: not done.** Real-disk-I/O-latency tuning needs the actual running app on real hardware, which this synthetic benchmark can't meaningfully provide (a mocked `stat()` with an artificial delay doesn't reflect real NTFS/HDD/SSD/network-share latency characteristics). 32 is used as the plan's own stated starting point; re-tuning this constant with real hardware measurements is a follow-up for whoever runs the actual app.

**Progress request-identity mixing: confirmed reachable, NOT fixed (documented only).** `scannerHandlers.ts`'s `SCANNER_SCAN_RECURSIVE` handler keeps its `scanned` counter in a closure local to one `ipcMain.handle` invocation, and broadcasts on the shared `SCANNER_SCAN_PROGRESS` channel with no request identity. `useScanProgress.ts` subscribes globally to that channel whenever ANY scan is active. Two overlapping scan requests in the same window (e.g. Gallery's own `useGames()` scan overlapping with an Explorer recursive search, or a quick double-trigger of the same query) would interleave their progress counts on the renderer side - the displayed number could visibly jump backward or forward mid-scan. This does NOT affect correctness of either scan's actual RESULT (each request's own `Promise.all`/return path is independent and unaffected) - only the cosmetic progress percentage shown during the loading skeleton. Per the plan's explicit caution against redesigning the scan DTO preemptively, and given the cost is small (a momentarily-wrong loading-state number, not a wrong final result), this was documented but not fixed in this task.
