# Detail Sidebar Button Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `DetailSidebar.tsx`'s action button block from one flat wrapping row into a 5-row hierarchy, with a green full-width `실행` (Launch) button and a de-emphasized outline-style `삭제` (Delete) button.

**Architecture:** Pure JSX/styling restructuring of one existing block (`src/components/game/DetailSidebar.tsx:221-254`) plus one new i18n key pair (`game.refreshMetadataShort`) added to all three locales in `src/i18n/translations.ts`. No new components, no new shared `Button` variants (the green/outline-destructive colors are one-off `className` overrides), no new files.

**Tech Stack:** React 19 + TypeScript strict + Tailwind + shadcn/ui `Button` + existing `HoverTooltip` component.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-03-detail-sidebar-button-cleanup-design.md` (committed as `a03cb5b`).
- Do not touch any other section of `DetailSidebar.tsx` (`RatingMemoSection`, `LaunchConfigSection`, `SaveDataSection`, `CodeLinkSection`, `CustomCoverSection`, the three trailing dialogs) or any other file.
- Do not add a new shared `Button` variant — green and outline-destructive styling are applied via one-off `className` overrides on the existing `outline` variant, since each is used in exactly one place.
- Do not fabricate component/hook tests. This codebase has zero test infrastructure for components or hooks (only pure-logic `.test.ts` files exist anywhere in the repo) — verification is manual via `npm run dev`.
- Commit message must end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Reorganize action buttons and add the short refresh label

**Files:**
- Modify: `src/i18n/translations.ts` (three locale blocks: ko ~line 201, ja ~line 477, en ~line 755)
- Modify: `src/components/game/DetailSidebar.tsx` (import block ~line 1-30, button block lines 221-254)

**Interfaces:**
- Consumes: existing `HoverTooltip` component from `src/components/ui/hover-tooltip.tsx` — `HoverTooltip({ content: ReactNode, children: ReactNode, className?: string, style?: CSSProperties })`, a `<span>`-wrapped hover tooltip already used elsewhere in the codebase (`DetailListPage.tsx`).
- Consumes: existing `Button` component from `src/components/ui/button.tsx` — `variant` accepts `'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'`, `size` accepts `'default' | 'sm' | 'lg' | 'icon'`. Both this task's new colors are `variant="outline"` plus a `className` override — no changes to this file.
- Produces: new i18n key `game.refreshMetadataShort`, used only within this task's own `DetailSidebar.tsx` change — no other task depends on it.

- [ ] **Step 1: Add the new `game.refreshMetadataShort` key to all three locales**

In `src/i18n/translations.ts`, the Korean block currently reads (around line 200-202):

```ts
  'game.openWeb': '웹에서 열기',
  'game.refreshMetadata': '메타데이터 새로고침',
  'game.openFolder': '폴더 열기',
```

Change to:

```ts
  'game.openWeb': '웹에서 열기',
  'game.refreshMetadata': '메타데이터 새로고침',
  'game.refreshMetadataShort': '새로고침',
  'game.openFolder': '폴더 열기',
```

The Japanese block currently reads (around line 476-478):

```ts
  'game.openWeb': 'Webで開く',
  'game.refreshMetadata': 'メタデータ更新',
  'game.openFolder': 'フォルダを開く',
```

Change to:

```ts
  'game.openWeb': 'Webで開く',
  'game.refreshMetadata': 'メタデータ更新',
  'game.refreshMetadataShort': '更新',
  'game.openFolder': 'フォルダを開く',
```

The English block currently reads (around line 754-756):

```ts
  'game.openWeb': 'Open on Web',
  'game.refreshMetadata': 'Refresh Metadata',
  'game.openFolder': 'Open Folder',
```

Change to:

```ts
  'game.openWeb': 'Open on Web',
  'game.refreshMetadata': 'Refresh Metadata',
  'game.refreshMetadataShort': 'Refresh',
  'game.openFolder': 'Open Folder',
```

- [ ] **Step 2: Run typecheck to confirm the new key doesn't break the translations type**

Run: `npm run typecheck`
Expected: no errors (the translation record type is keyed off the ko block's key set — since the same key was added to all three blocks, this should pass cleanly).

- [ ] **Step 3: Add the `HoverTooltip` import to `DetailSidebar.tsx`**

The current import block starts:

```tsx
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Clock, ImagePlus, X } from 'lucide-react'
import { Button } from '../ui/button'
import { GameThumbnail } from './GameThumbnail'
```

Add the `HoverTooltip` import directly after the `Button` import:

```tsx
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Clock, ImagePlus, X } from 'lucide-react'
import { Button } from '../ui/button'
import { HoverTooltip } from '../ui/hover-tooltip'
import { GameThumbnail } from './GameThumbnail'
```

- [ ] **Step 4: Replace the button block**

The current block (lines 221-254) reads:

```tsx
        <div className="flex flex-wrap gap-2">
          {game.code && (
            <Button size="sm" onClick={() => game.code && openExternal.mutate(game.code)}>
              {t('game.openWeb')}
            </Button>
          )}
          {game.code && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => game.code && crawlMetadata.mutate(game.code)}
              disabled={crawlMetadata.isPending}
            >
              {t('game.refreshMetadata')}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => showItemInFolder.mutate(game.path)}>
            {t('game.openFolder')}
          </Button>
          {game.kind === 'folder' && (
            <Button size="sm" variant="secondary" onClick={handleLaunch}>
              {t('game.launch')}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setDialogMode('rename')}>
            {t('selection.rename')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDialogMode('move')}>
            {t('selection.move')}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDialogMode('delete')}>
            {t('common.delete')}
          </Button>
        </div>
```

Replace it with:

```tsx
        <div className="flex flex-col gap-2">
          {game.kind === 'folder' && (
            <Button
              size="sm"
              variant="outline"
              className="w-full bg-green-600 text-white hover:bg-green-600/90"
              onClick={handleLaunch}
            >
              {t('game.launch')}
            </Button>
          )}
          <div className="flex gap-2">
            {game.code && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => game.code && openExternal.mutate(game.code)}
              >
                {t('game.openWeb')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => showItemInFolder.mutate(game.path)}
            >
              {t('game.openFolder')}
            </Button>
            {game.code && (
              <HoverTooltip content={t('game.refreshMetadata')} className="flex-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => game.code && crawlMetadata.mutate(game.code)}
                  disabled={crawlMetadata.isPending}
                >
                  {t('game.refreshMetadataShort')}
                </Button>
              </HoverTooltip>
            )}
          </div>
          <div className="border-t border-border" />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => setDialogMode('rename')}
            >
              {t('selection.rename')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => setDialogMode('move')}
            >
              {t('selection.move')}
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => setDialogMode('delete')}
          >
            {t('common.delete')}
          </Button>
        </div>
```

- [ ] **Step 5: Run typecheck, lint, and format check**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three pass with no errors. If `format:check` fails, run `npm run format` and re-verify.

- [ ] **Step 6: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: all existing tests still pass (this task adds no new test files, since there is no component test infrastructure in this codebase — see Global Constraints).

- [ ] **Step 7: Manual verification via `npm run dev`**

Run: `npm run dev`, open the app, select any game with a linked code (a folder-kind entry, so all rows render) to open the detail sidebar, and confirm:

- `실행` renders full-width and green, above everything else.
- The second row shows `웹 열기` / `폴더 열기` / `새로고침` as three equal-width outline buttons.
- Hovering `새로고침` shows a tooltip reading "메타데이터 새로고침".
- Clicking `새로고침` still triggers the metadata refresh (same `crawlMetadata.mutate` call as before).
- A visible divider line separates the second row from `이름변경` / `이동`.
- `삭제` renders full-width with a red outline (not a solid red fill), and clicking it still opens `DeleteConfirmDialog` as before.

Then select a game with no linked code (or a file-kind entry) and confirm:
- `실행` is absent for a file-kind entry.
- `웹 열기` and `새로고침` are absent when there's no linked code, and `폴더 열기` alone stretches to fill that row's full width.

Then switch the app language to English and to Japanese (via the existing language setting) and re-open a coded game's sidebar to confirm the short button label and tooltip text both read correctly in each locale (`Refresh` / `Refresh Metadata` in English, `更新` / `メタデータ更新` in Japanese).

- [ ] **Step 8: Commit**

```bash
git add src/i18n/translations.ts src/components/game/DetailSidebar.tsx
git commit -m "$(cat <<'EOF'
feat: reorganize detail sidebar action buttons with a green launch button

The button block was a single flat, wrapping row of up to 7 same-weight
buttons (see docs/superpowers/specs/2026-08-03-detail-sidebar-button-cleanup-design.md
for the full design). Restructured into five rows with real hierarchy:
a full-width green Launch button on top, open-web/open-folder/refresh as
an equal-width trio, a divider, rename/move as a pair, and delete pushed
to the bottom as a de-emphasized outline button instead of a solid fill.

The refresh button's own label shrinks to "새로고침" (a new
game.refreshMetadataShort key) since the fixed 1/3-width slot doesn't fit
the full "메타데이터 새로고침" text - the existing game.refreshMetadata
key still carries the full text but now only as a HoverTooltip, which is
what actually disambiguates it from a plain file-refresh action.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** all five spec sections (Launch button, 3-button row + short label/tooltip, divider, rename/move pair, outline-destructive delete) are covered by Task 1, Step 4. The new i18n key requirement is covered by Step 1.
- **Placeholder scan:** none found — every step has literal code or an exact command.
- **Type consistency:** `game.refreshMetadataShort` is spelled identically across all three locale edits (Step 1) and the single usage site (Step 4). `HoverTooltip`'s prop names (`content`, `className`, `children`) match its actual definition in `src/components/ui/hover-tooltip.tsx`.
