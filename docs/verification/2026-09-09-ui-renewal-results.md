# UI Renewal Verification Results — 2026-09-09

Covers U1–U8 of `docs/superpowers/plans/2026-09-09-ui-renewal-plan.md`. Written by the
same session that implemented all of U1–U8 back-to-back, immediately after committing
U8 - not a separate verification pass by a different worker.

## Status in three parts (per the plan's own requirement — do not collapse these into one "done")

| Aspect | Status |
| --- | --- |
| **Code** | Complete for U1–U8. `npm run typecheck`, `npm run lint`, `npx vitest run --reporter=dot`, `npm exec -- electron-vite build` all pass — see "Automated checks" below for the exact output. |
| **Visual** | **Not verified.** This session has no tool that can launch the actual Electron app, drive its UI, or take a screenshot. Every visual/interaction claim in each task's own commit message is explicitly marked unverified there too — this document does not upgrade any of them to verified. |
| **Performance** | Already measured separately, before this UI work started, and unaffected by it. P0 baseline / P1–P2–P3 re-measurement (`docs/verification/2026-09-09-performance-results.md`) was synthetic-benchmark-based, done during the earlier performance-reliability phase of this same session, on code paths U1–U8 did not touch (list-derivation memoization, cover-image cache, media-broadcast dedup logic). No new performance work was done or needed here. |

**Do not read this document as "UI renewal complete."** It is "UI renewal code-complete, visual verification still entirely pending" — the plan's own distinction in design §7: "코드 구현 완료와 실앱 검증 완료를 구분한다. 자동검사만 통과하면 UI 검증은 여전히 미완료다."

## What was implemented (commits)

| Task | Commit | Summary |
| --- | --- | --- |
| U1 | `d785058` | Design tokens (HSL color table), motion policy (`UI_MOTION`, `MotionConfig`), base control treatments (button press, Radix popup timing/z-index, reduced-motion CSS) |
| U2 | `24b6dae` | HoverTooltip rewrite: delay/focus timing, keyboard/scroll/click dismissal, real-rect positioning (`placeTooltip`), aria-describedby |
| U3 | `c64f3c1` | Sidebar nav grouping + sliding selection, AppLayout page-transition tuning, layout responsibility fixes (`min-w-0`/`min-h-0`) |
| U4 | `00e297e` | Gallery/List/DetailList card and row treatment, DetailSidebar collapsible sections, confirmed-pulse + error-toast gap fixes |
| U5 | `8007b2d` | Explorer tab/tree/breadcrumb polish, Favorites card hover-scale fix |
| U6 | `42d366f` | SettingsPage regrouped into cards, animated library list |
| U7 | `434a748` | MediaLikeButton press/pulse/error fix, MediaSidebar tab selection |
| U8 | `6652c9e` | SaveManagerDialog/SaveDataSection operation-feedback gap fixes, Saves page input/tooltip polish |

Each commit's own message already lists that task's specific "NOT verified" items in detail (specific keyboard paths, specific screens, specific interactions) - not repeated exhaustively here. This document adds the cross-cutting, whole-app verification the plan's design §7 asks for, which no single task commit could cover on its own.

## A pattern worth naming: the same real bug, found six times

U4 through U8 each independently surfaced the identical class of defect while implementing unrelated visual requirements: a mutation hook with no optimistic update (so a failure already correctly left prior state alone) but also **no `onError` handler at all**, so a failed action was silently invisible to the user. Fixed at the call site (not the shared hook, to keep each hook generic) with `appToast.error(...)` + a dedicated translation key, in:
- Gallery/List's favorite & cleared toggles, DetailSidebar's cleared toggle, Favorites' favorite toggle (U4/U5)
- MediaLikeButton, shared by 4 different surfaces (U7)
- SaveManagerDialog's save/delete/delete-all/label-edit, SaveDataSection's set-save-path (U8)

This was not something any task's checklist asked for by name - it fell out of actually reading each mutation's `onSuccess`/`onError` wiring while doing the requested press/pulse/feedback work, per each task's own "표로 조사한다" (survey and tabulate) instruction. Worth flagging as a real, previously-unknown reliability gap that happened to be caught by this visual-polish pass, not by the earlier dedicated reliability tasks (R0–R2).

## Automated checks (run once, after U8, against the final state of all 8 commits)

```
$ npm run typecheck
> tsc --build --force
(no output — clean)

$ npm run lint
> eslint .
C:\...\src\components\ui\button.tsx
  71:18  warning  Fast refresh only works when a file only exports components...
✖ 1 problem (0 errors, 1 warning)
(pre-existing, unrelated to this session's work — see R0's own commit, which
already recorded this as the one baseline warning left after fixing lint's
scope in eslint.config.js)

$ npx vitest run --reporter=dot
 Test Files  131 passed (131)
      Tests  943 passed (943)
(2 tests in hover-tooltip.test.ts print a "not configured to support act(...)"
warning to stderr - both still pass deterministically across repeated runs;
not chased further given the size of the remaining scope at this point in the
session - see "Known loose end" below)

$ npm exec -- electron-vite build
✓ main built, ✓ preload built, ✓ renderer built (2667 modules, 45.70kB CSS,
2543.07kB JS)
```

No baseline number is being copied forward from any earlier session - these are this session's own fresh runs against the final U8 commit.

## Known loose end (code-level, not visual)

`src/components/ui/hover-tooltip.test.ts`'s "closes on Escape" and "closes when the previously-shown content changes while open" tests print a React "The current testing environment is not configured to support act(...)" warning during a run, despite every event dispatch in those tests already being wrapped in `act()`. Both tests pass reliably and repeatedly (confirmed across the several full-suite runs this session ran after every later task's changes, all showing 943/943). Not root-caused given the remaining scope at the point this was noticed - flagged here rather than silently ignored, since an act() warning can occasionally mask a real double-render or a state update racing a cleanup. A future session with more room to spend on it should treat this as a "verify this isn't hiding something" task, not necessarily a bug.

## Design §7 verification matrix — status

Design §7 asks for dark/light × ko/en/ja × three Windows DPI scales × three window
sizes, Pretendard's actual glyph rendering (not just `document.fonts.check()`), the
`77821e5` six-file regression list, 400ms tooltip timing end-to-end, reduced-motion
behavior under a real OS toggle, and a same-data before/after performance comparison.
**None of these have been performed.** Every cell below is "not verified, no real
Electron app available" - listed individually (not collapsed into one line) so a
future verifier has a concrete checklist rather than a vague "check the whole app"
instruction.

| Scenario | Build/commit | Theme/locale/scale | Result | Evidence | Remaining |
| --- | --- | --- | --- | --- | --- |
| App frame + 10-route round trip | `c64f3c1` | all | Not verified | none | Launch the app, click through all 10 nav items in order, confirm the sliding selection background and 160ms/4px page transition |
| Sidebar/Explorer-tab/Media-sidebar selection sliding indicator | `c64f3c1`, `8007b2d`, `434a748` | all | Not verified | none | Confirm the three `layoutId`-scoped indicators (`app-sidebar-selection`, `explorer-tab-selection`, `media-sidebar-selection`) never visually interfere with each other and slide smoothly |
| HoverTooltip (delay, focus, Escape, scroll, resize, 4 window corners, disabled button, over Select/Dialog) | `24b6dae` | all | Not verified | 13 automated unit/DOM tests (`tooltipPosition.test.ts` ×4, `hover-tooltip.test.ts` ×9) cover the pure-math placement and the open/close/aria-describedby state machine in jsdom | Real mouse hover timing feel, real viewport-edge clamping, real Dialog/Select z-layering, real screen-reader announcement |
| Gallery/List/DetailList cards at zoom min/max, 0/1/1000+ entries | `00e297e` | all | Not verified | `computeCardHeight`'s updated constant was hand-verified against the new p-3 padding arithmetically, not by rendering | Confirm no clipping at any zoom level in the real browser; confirm the card hover-scale/selection-ring/confirmed-pulse actually look right |
| DetailSidebar collapsible sections (Launch Config / Code Link / Save Data) | `00e297e` | all | Not verified | none | Confirm the height:'auto' AnimatePresence transition doesn't jank on real content, especially the executables radio-button list |
| Explorer tabs (add/close/restore, Ctrl+W, drag-drop, search) with Korean/Japanese/space/&-containing test folders | `8007b2d` | ko/ja | Not verified | none | Create real test folders with those characters, exercise the full tab lifecycle |
| Settings groups, library add/remove animation, all fields | `42d366f` | all | Not verified | none | Full settings checklist from the plan's own U6 task text - library add/pick/drag-drop/duplicate-error/remove-confirm, cache-delete-with-backups, LE path, external provider fields, language switch, window-close behavior, update/release-notes/install |
| Media playback (audio/video play/pause/seek/next/EOF, queue X/last-track removal, shuffle/repeat, EQ, lyrics, sidebar, fullscreen/detach/return) | `434a748` (styling only - no playback logic touched) | all | Not verified | none | Full media functional checklist from the plan's own U7 task text |
| Saves (rename/move/delete, backup create/restore/delete/version-mismatch, retry-on-failure) | `6652c9e` | all | Not verified | none | Exercise every save mutation against a **test** save folder (never the real user DB/save data), including deliberately triggering a failure to confirm the new error toasts actually appear |
| Pretendard rendering — the `77821e5` six-file list (FolderTreeTab, ExplorerSidebar, RecentlyPlayedPage, SavesPage ×2 locations, ListPage, DetailListPage) | all of U1–U8 | ko/ja | Not verified | none | `document.fonts.check('14px "Pretendard Variable"')` plus actual eyeballing of rendered Korean/Japanese text - the API returning true is explicitly not sufficient proof per design §7's own caution |
| Reduced motion (OS or DevTools toggle) — page transitions, cards, collapsible sections, marquee, skeleton, progress bar, tooltip | all of U1–U8 | n/a | Not verified | Code-level: `MotionConfig reducedMotion="user"` (U1, auto-strips transform-based values app-wide), explicit `useReducedMotion()` branches for SettingsPage's library-list height animation (U6) and `motion-reduce:` Tailwind variants on marquee/skeleton/progress/buttons/popups (U1) | Toggle actual reduced-motion in Windows settings or DevTools, walk every page listed above, confirm no unwanted movement remains and no content becomes silently unreachable |
| Window scaling — 100%/125%/150% Windows DPI × 1024×768/1280×800/1600×1000 | all of U1–U8 | all | Not verified | none | This session cannot change display scaling or window size on a real OS session at all |

## What a future verifier should NOT do

- Do not copy any "passed" result from this document's automated-checks section forward without re-running it — re-run fresh against whatever commit is actually being verified.
- Do not treat `docs/screenshots/` (if present) as evidence for anything in this document — per design §2's own caution, those are stale reference material, not this task's output.
- Do not use the real user's `dlibrary`/`ark-manager` userData profile for destructive testing (library add/remove, save delete/restore, cache clear). Use a test profile or throwaway library/save folders, per design §7's and this plan's own repeated instruction.
