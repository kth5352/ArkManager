# Launch Config Save: Close + Toast + Conditional Auto-Launch — Design

## Goal

Saving launch config today (`LaunchConfigDialog.tsx`) silently mutates and leaves the dialog open with no confirmation — the user has to notice nothing broke, then manually close the dialog and click Launch again if that's what they came here to do. This introduces this app's first toast notification system and wires it into launch-config save: the dialog closes and confirms via a toast on every save, and auto-launches the game afterward — but only on the specific path where auto-launch is unambiguously wanted.

## Scope

Ninth sub-project of the v1.0.2 backlog, following the getchu sub-project's completion. Touches: a new `sonner`-based toast primitive (this app's first — confirmed via direct search that no toast/notification pattern exists anywhere today), and `LaunchConfigDialog.tsx`'s save handler plus its two call sites. **Explicitly not in scope:** `LaunchConfigSection.tsx` (the inline collapsible section in the sidebar, which has its own separate save button and no "close" semantics to apply this to), retrofitting toasts onto any other existing save flow (rating/memo, code link, custom cover, etc. — this sub-project introduces the primitive, it doesn't mandate adopting it everywhere), and backlog item E (Explorer overhaul).

## 1. Toast Primitive

Add `sonner` as a new dependency — shadcn/ui's own recommended toast library, handling stacking/animation/accessibility/auto-dismiss out of the box rather than this app building and maintaining that itself. Mount `<Toaster />` once in `AppLayout.tsx`, alongside the existing always-mounted singletons (`BulkCrawlProgressBanner`, `ExcludedEntriesDialog`) — same "mounted once at the app root" pattern already established there.

- `theme={theme}` — reuses the existing `useTheme()` hook (already called in `AppLayout.tsx` for the light/dark toggle button), whose `Theme` type (`'light' | 'dark'`) matches sonner's own `theme` prop values directly, so toasts follow the app's current theme with no new state.
- `position="top-right"` — `BulkCrawlProgressBanner` already occupies `bottom-4 right-4`; top-right avoids any visual overlap.
- `richColors` — gives success/error toasts their own distinct color treatment for free, matching this app's UI/UX-first priority without hand-rolling variant styling.

Once mounted, any component can call `toast.success(...)` / `toast.error(...)` (imported from `sonner`) with no further plumbing — this is the reusable primitive; this sub-project only consumes it for launch config.

## 2. `LaunchConfigDialog.tsx`: close + toast + conditional auto-launch

On successful save (`useSetLaunchConfig`'s mutation succeeding):
- Show a success toast confirming the save.
- Close the dialog (call the existing `onClose` prop).
- **Conditionally**, auto-launch the game using the config just saved.

The conditional part needs a real design decision, because `LaunchConfigDialog` has two genuinely different call sites today (confirmed by reading both):
- `DetailSidebar.tsx`: opens the dialog automatically, and *only*, when a launch attempt just failed because no config exists yet (`isNoLaunchConfigError`). Reaching this dialog already means the user wanted to launch and got blocked — auto-launching once they've fixed that is the natural continuation of what they were already doing.
- `DetailOverlay.tsx`: opens the dialog from its own dedicated "실행 설정" (Launch Config) button, sitting right next to a separate, independent "실행" (Launch) button. A user here may just be reviewing or correcting settings (e.g. fixing a wrong exe path) with no intention of playing right now — auto-launching would be a surprising, unwanted side effect of what looks like a settings edit.

`LaunchConfigDialog` gains a new required prop, `autoLaunchOnSave: boolean`, decided by each caller: `DetailSidebar.tsx` passes `true` (its only entry point is the failed-launch path), `DetailOverlay.tsx` passes `false` (its entry point is the deliberate settings button). The dialog itself stays a single component with no internal heuristic — the callers already know unambiguously which situation they're in, so the decision belongs there, not inferred inside the dialog.

When `autoLaunchOnSave` is true, the save success handler additionally calls the existing `useLaunchGame()` mutation (already used by `DetailSidebar.tsx`'s own `handleLaunch`, reused here rather than duplicated) with the just-configured entry. If that launch itself fails (e.g. a Locale Emulator path issue, unrelated to config just having been fixed), a separate error toast surfaces it — the save itself still succeeded and the dialog still closed, only the follow-on launch failed.

## Testing

No test infrastructure exists for dialogs/toasts in this app (established precedent) — this ships without automated tests, verified live via `npm run dev`: saving from the failed-launch path (dialog closes, toast appears, game launches), saving from the deliberate-settings-button path (dialog closes, toast appears, game does NOT auto-launch), and a launch failure after a from-failed-launch-path save (error toast appears, doesn't crash or leave the app in a stuck state).
