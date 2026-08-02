# Detail Sidebar Action Button Cleanup — Design

## Goal

Reorganize the action button block in `DetailSidebar.tsx` so it has clear visual
hierarchy instead of a single flat, wrapping row of same-weight buttons, and
make the "실행" (Launch) button stand out as the primary action via a green
color.

## Scope

This is item 4 of a larger v1.0.2 backlog (12 items total, being worked
sub-project by sub-project). Only the button block itself is in scope. Not in
scope: any of the other sidebar sections (`RatingMemoSection`,
`LaunchConfigSection`, `SaveDataSection`, `CodeLinkSection`,
`CustomCoverSection`), the three trailing dialogs
(`RenameDialog`/`DeleteConfirmDialog`/`MoveDialog`), or the dialog-state bug
noted separately in the backlog (item 11 — `dialogMode` surviving a game
switch and reopening on the next selected game). That bug touches the same
file but is an unrelated `useState` lifecycle issue, not a layout concern —
it gets its own fix.

## Current State

`src/components/game/DetailSidebar.tsx:221-254` renders up to 7 buttons
(`실행`, `웹 열기`, `메타데이터 새로고침`, `폴더 열기`, `이름변경`, `이동`,
`삭제`) as siblings in a single `flex flex-wrap gap-2` container, all
`size="sm"`, all `variant="secondary"` except `웹 열기` (`variant="default"`,
i.e. the theme's primary color, not particularly meaningful here) and `삭제`
(`variant="destructive"`, solid fill). There is no grouping and no
hierarchy - `삭제` sits at the same visual weight as everything else.

## New Structure

Four stacked rows (replacing the single flex-wrap block), each `gap-2`:

1. **`실행`** — full width, green, only rendered when `game.kind === 'folder'`
   (existing condition, unchanged). Not a shared `Button` variant (this is
   the only green button in the app) - applied via `className` override on
   the existing `outline`-family markup, e.g.
   `className="w-full bg-green-600 text-white hover:bg-green-600/90"` with
   `variant="outline"` as the base (avoids fighting the `outline` variant's
   border/background instead of `secondary`'s).

2. **`웹 열기` / `폴더 열기` / `새로고침`** — three equal-width
   (`flex-1`) `variant="outline"` buttons.
   - `웹 열기` and `새로고침` keep their existing `game.code`-gated
     visibility (both hidden when the game has no linked code).
   - `새로고침`'s visible label changes from the full "메타데이터
     새로고침" to a new, short **`game.refreshMetadataShort`** i18n key
     (see below), wrapped in the existing `HoverTooltip`
     (`src/components/ui/hover-tooltip.tsx`) with `content={t('game.refreshMetadata')}`
     (the existing full-text key, reused as-is for the tooltip body) — the
     tooltip is what disambiguates "새로고침" from a generic file refresh,
     not the button's own label.
   - When `game.code` is absent, only `폴더 열기` renders; with `flex-1` on
     a lone child it stretches to fill the full row width. That's an
     intentional, acceptable change from today's behavior (where the
     unstretched button just sits at its natural width) - a single
     full-width button reads consistently with the `실행` and `삭제` rows
     above and below it, rather than looking like a leftover.

3. **Divider** — `<div className="border-t border-border" />`.

4. **`이름변경` / `이동`** — two equal-width (`flex-1`)
   `variant="secondary"` buttons.

5. **`삭제`** — full width, outline-style destructive (not the solid fill
   it uses today) - lower visual weight than a filled red button, harder to
   trigger by accident since it no longer matches the launch button's "big
   full-width filled button" shape. Applied via `className` override on
   `variant="outline"`, e.g.
   `className="w-full border-destructive text-destructive hover:bg-destructive/10"`.
   No new shared `Button` variant, same reasoning as the green launch
   button - this coloring is used in exactly one place.

## New i18n Key

Add `game.refreshMetadataShort` alongside the existing `game.refreshMetadata`
in all three locales in `src/i18n/translations.ts`:

| Locale | `game.refreshMetadata` (existing, now tooltip-only) | `game.refreshMetadataShort` (new, button label) |
|---|---|---|
| ko | 메타데이터 새로고침 | 새로고침 |
| en | Refresh Metadata | Refresh |
| ja | メタデータ更新 | 更新 |

## Testing

No component/hook test infrastructure exists elsewhere in this codebase
(confirmed: only pure-logic `.test.ts` files exist). Verify via `npm run dev`
manually:
- Launch button renders green and full-width for a folder-kind game, and is
  absent for a file-kind game.
- The three-button row collapses correctly (no orphaned gap) when
  `game.code` is absent.
- Hovering "새로고침" shows the "메타데이터 새로고침" tooltip.
- 삭제 button reads as visually lower-weight than 실행 (outline vs. filled),
  and its click behavior (opens `DeleteConfirmDialog`) is unchanged.
- Switch locale to English/Japanese and confirm the short/tooltip label pair
  reads correctly in both.
