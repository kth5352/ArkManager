# Launch Config Close+Toast+Auto-Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce this app's first toast notification system (`sonner`) and wire launch-config save to close the dialog, confirm via toast, and conditionally auto-launch — only on the path where auto-launch is unambiguously wanted.

**Architecture:** Task 1 adds the `sonner` dependency and mounts a single `<Toaster />` in `AppLayout.tsx`, following the exact "mounted once at the app root" pattern this app already uses for `BulkCrawlProgressBanner`/`ExcludedEntriesDialog` — a working, independently-verifiable primitive with nothing else depending on it yet. Task 2 wires `LaunchConfigDialog.tsx`'s save handler to use it, adding a new `autoLaunchOnSave` prop that each of the dialog's two call sites sets according to its own already-distinct situation (no new heuristic inside the dialog itself).

**Tech Stack:** React 19 + TypeScript strict, `sonner` (new dependency), TanStack Query v5 (`@tanstack/react-query": "^5.101.4"` — confirmed current version, whose `mutate(variables, { onSuccess, onError })` call-site callback form is what Task 2 relies on).

## Global Constraints

- No test infrastructure exists for dialogs/toasts in this app — this ships without automated tests, verified live via `npm run dev` per each task's own live-verification step.
- `LaunchConfigSection.tsx` (the inline collapsible sidebar section, distinct from `LaunchConfigDialog.tsx`) is explicitly out of scope — do not touch it.
- No other existing save flow (rating/memo, code link, custom cover, etc.) gets a toast in this plan — the primitive is introduced, not retrofitted everywhere.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: Add `sonner` and mount `<Toaster />`

**Files:**
- Modify: `package.json`
- Modify: `src/components/layout/AppLayout.tsx`

**Interfaces:**
- Produces: a mounted `sonner` `<Toaster />` reachable from anywhere in the renderer via `import { toast } from 'sonner'` — consumed by Task 2.

**Note (corrects an assumption in the design spec):** the spec assumed `AppLayout.tsx` already calls `useTheme()` — it does not. The theme toggle button lives in `Sidebar.tsx`, which calls `useTheme()` itself. `AppLayout.tsx` needs its own `useTheme()` call added as part of this task.

- [ ] **Step 1: Install `sonner`**

Run: `npm install sonner`

This adds an entry to `package.json`'s `dependencies` (alongside `cheerio`, `iconv-lite`, etc. — same section, same caret-range convention `npm install` already applies) and updates `package-lock.json`. Do not hand-edit `package.json`'s version string — let `npm install` write the real installed version.

- [ ] **Step 2: Verify sonner's installed API matches what this task assumes**

`sonner`'s public API has been stable across versions for `<Toaster />`'s `theme`/`position`/`richColors` props and the `toast.success()`/`toast.error()` functions used below, but versions do change over time. After installing, check the actual type definitions before proceeding:

Run: `cat node_modules/sonner/dist/index.d.ts | grep -A 20 "interface ToasterProps"` (or open that file directly)

Confirm `theme`, `position`, and `richColors` are real props on `ToasterProps` accepting the values this task uses (`theme: 'light' | 'dark' | 'system'` or similar, `position` accepting `'top-right'`, `richColors: boolean`). If the installed version's real API differs from what Step 3 below assumes, adjust Step 3's code to match the real installed API — do not force the assumed API onto a mismatched real one. Note in your report which version was installed and whether the API matched.

- [ ] **Step 3: Mount `<Toaster />` in `AppLayout.tsx`**

Current file:

```tsx
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouterState } from '@tanstack/react-router'
import { Sidebar } from './Sidebar'
import { BulkCrawlProgressBanner } from './BulkCrawlProgressBanner'
import { useBulkCrawlProgress } from '../../hooks/useBulkCrawlMissingMetadata'
import { MediaPlayerHost } from '../media/MediaPlayerHost'
import { useMediaPlayerSync } from '../../hooks/useMediaPlayerSync'
import { ExcludedEntriesDialog } from './ExcludedEntriesDialog'

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const bulkCrawlProgress = useBulkCrawlProgress()
  useMediaPlayerSync()

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              className="h-full"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MediaPlayerHost />
      <BulkCrawlProgressBanner progress={bulkCrawlProgress} />
      <ExcludedEntriesDialog />
    </div>
  )
}
```

Replace with (adds the `useTheme` import/call this file didn't previously have, and the `sonner` import/mount — every other line is unchanged):

```tsx
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouterState } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { Sidebar } from './Sidebar'
import { BulkCrawlProgressBanner } from './BulkCrawlProgressBanner'
import { useBulkCrawlProgress } from '../../hooks/useBulkCrawlMissingMetadata'
import { MediaPlayerHost } from '../media/MediaPlayerHost'
import { useMediaPlayerSync } from '../../hooks/useMediaPlayerSync'
import { ExcludedEntriesDialog } from './ExcludedEntriesDialog'
import { useTheme } from '../../hooks/useTheme'

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const bulkCrawlProgress = useBulkCrawlProgress()
  const { theme } = useTheme()
  useMediaPlayerSync()

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              className="h-full"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MediaPlayerHost />
      <BulkCrawlProgressBanner progress={bulkCrawlProgress} />
      <ExcludedEntriesDialog />
      {/* position="top-right" avoids overlapping BulkCrawlProgressBanner's
          own fixed bottom-4 right-4 position. richColors gives success/error
          toasts distinct color treatment without this app hand-rolling
          variant styling. */}
      <Toaster theme={theme} position="top-right" richColors />
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no new errors. If `Toaster`'s props don't match what Step 3 wrote (per whatever Step 2 found), fix the props here to match the real installed API before proceeding.

- [ ] **Step 5: Live-verify the primitive works**

Run: `npm run dev`. With the app running, open the DevTools console for the renderer (View → Toggle Developer Tools, or the app's existing dev-mode equivalent) and run:

```js
window.__sonnerTest = true // no-op marker, just confirming console access
```

then, still in the console:

```js
import('sonner').then(({ toast }) => toast.success('test toast'))
```

Expected: a toast notification appears in the top-right corner and auto-dismisses after a few seconds. Confirm it respects the app's current theme (light/dark) by toggling the theme (Sidebar's existing light/dark button) and firing another test toast. This confirms the primitive genuinely works end-to-end before Task 2 builds on it — no permanent test needed per this plan's Global Constraints.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/layout/AppLayout.tsx
git commit -m "$(cat <<'EOF'
feat: add sonner toast notification system

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `LaunchConfigDialog.tsx` — close + toast + conditional auto-launch

**Files:**
- Modify: `src/components/game/LaunchConfigDialog.tsx`
- Modify: `src/components/game/DetailSidebar.tsx`
- Modify: `src/components/game/DetailOverlay.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `toast` from `sonner` (Task 1), `useLaunchGame` (`src/services/launchService.ts`, existing, unchanged).
- Produces: nothing consumed by later tasks — this is the plan's final task.

- [ ] **Step 1: Add the two new translation keys (ko/ja/en)**

Edit `src/i18n/translations.ts`. Insert immediately after the existing `'launchConfig.manageSaves'` line in each locale block:

**`ko`** (after line 149):
```ts
  'launchConfig.saved': '실행 설정이 저장되었습니다.',
  'launchConfig.launchFailed': '게임 실행에 실패했습니다.',
```

**`ja`** (after line 445):
```ts
  'launchConfig.saved': '実行設定が保存されました。',
  'launchConfig.launchFailed': 'ゲームの起動に失敗しました。',
```

**`en`** (after line 740):
```ts
  'launchConfig.saved': 'Launch settings saved.',
  'launchConfig.launchFailed': 'Failed to launch the game.',
```

- [ ] **Step 2: Update `LaunchConfigDialog.tsx`**

Current file:

```tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import {
  useListExecutables,
  useLocaleEmulatorAvailable,
  useSetLaunchConfig,
} from '../../services/launchService'
import { useGameUserData } from '../../services/gameUserDataService'
import { usePickSaveFolder, useSetSavePath } from '../../services/saveService'
import { SaveManagerDialog } from './SaveManagerDialog'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { LaunchConfigDto } from '../../../shared/types/ipc'

interface LaunchConfigDialogProps {
  entry: ScannedEntry | null
  onClose: () => void
}

export function LaunchConfigDialog({ entry, onClose }: LaunchConfigDialogProps) {
  const { t } = useTranslation()
  const folderPath = entry?.kind === 'folder' ? entry.path : ''
  const { data: executables } = useListExecutables(folderPath)
  const { data: leAvailable } = useLocaleEmulatorAvailable()
  const { data: userData } = useGameUserData(entry ?? { code: null, path: '' })
  const setLaunchConfig = useSetLaunchConfig()
  const pickSaveFolder = usePickSaveFolder()
  const setSavePath = useSetSavePath()
  const [showSaveManager, setShowSaveManager] = useState(false)

  const [selectedExe, setSelectedExe] = useState(userData?.launchConfig?.executablePath ?? '')
  const [launchMode, setLaunchMode] = useState<LaunchConfigDto['launchMode']>(
    userData?.launchConfig?.launchMode ?? 'normal'
  )
  // Re-syncs from userData on every change (not hydrate-once) - this dialog
  // is remounted per open (keyed by entry in DetailOverlay), and unlike
  // LaunchConfigSection there's no separate-field-save race to guard
  // against, so RatingMemoDialog's simpler always-sync pattern applies here.
  const [syncedUserData, setSyncedUserData] = useState(userData)
  if (userData !== syncedUserData) {
    setSyncedUserData(userData)
    setSelectedExe(userData?.launchConfig?.executablePath ?? '')
    setLaunchMode(userData?.launchConfig?.launchMode ?? 'normal')
  }

  const handleSaveLaunchConfig = (): void => {
    if (!entry || !selectedExe) return
    setLaunchConfig.mutate({ entry, config: { executablePath: selectedExe, launchMode } })
  }

  const handlePickSaveFolder = async (): Promise<void> => {
    if (!entry) return
    const path = await pickSaveFolder.mutateAsync(entry.path)
    if (path) setSavePath.mutate({ entry, savePath: path })
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('launchConfig.dialogTitle')} {entry ? `- ${entry.name}` : ''}
          </DialogTitle>
        </DialogHeader>

        {entry?.kind !== 'folder' && (
          <p className="text-sm text-muted-foreground">{t('launchConfig.archiveNotSupported')}</p>
        )}

        {entry?.kind === 'folder' && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{t('launchConfig.executable')}</p>
              {(executables ?? []).map((exe) => (
                <label key={exe} className="flex items-center gap-2 text-sm">
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
                <p className="text-sm text-muted-foreground">{t('launchConfig.noExeFound')}</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{t('launchConfig.launchMode')}</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="launchMode"
                  checked={launchMode === 'normal'}
                  onChange={() => setLaunchMode('normal')}
                />
                {t('launchConfig.normalLaunch')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="launchMode"
                  checked={launchMode === 'locale-emulator'}
                  onChange={() => setLaunchMode('locale-emulator')}
                  disabled={!leAvailable}
                />
                {t('launchConfig.localeEmulatorLaunch')}
                {!leAvailable && t('launchConfig.notInstalled')}
              </label>
            </div>

            <Button onClick={handleSaveLaunchConfig} disabled={!selectedExe}>
              {t('launchConfig.saveLaunchConfig')}
            </Button>

            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-medium">{t('launchConfig.saveBackupLocation')}</p>
              <Button variant="secondary" onClick={handlePickSaveFolder}>
                {t('launchConfig.pickSaveFolder')}
              </Button>
              <Button variant="secondary" onClick={() => setShowSaveManager(true)} className="ml-2">
                {t('launchConfig.manageSaves')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
      <SaveManagerDialog
        entry={showSaveManager ? entry : null}
        savePath={userData?.savePath ?? null}
        onClose={() => setShowSaveManager(false)}
      />
    </Dialog>
  )
}
```

Replace with (adds the `sonner`/`useLaunchGame` imports, the new `autoLaunchOnSave` prop, and rewrites `handleSaveLaunchConfig` — every other line, including the whole JSX return block, is unchanged):

```tsx
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import {
  useListExecutables,
  useLocaleEmulatorAvailable,
  useSetLaunchConfig,
  useLaunchGame,
} from '../../services/launchService'
import { useGameUserData } from '../../services/gameUserDataService'
import { usePickSaveFolder, useSetSavePath } from '../../services/saveService'
import { SaveManagerDialog } from './SaveManagerDialog'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { LaunchConfigDto } from '../../../shared/types/ipc'

interface LaunchConfigDialogProps {
  entry: ScannedEntry | null
  onClose: () => void
  // Auto-launch is only correct on the failed-launch-triggered path
  // (DetailSidebar.tsx) - the user already tried to launch, got blocked by
  // missing config, and fixing that config here means "now actually launch
  // it." The deliberate settings-button path (DetailOverlay.tsx) has no
  // such intent - a user reviewing/correcting config there may not want to
  // play right now, and a separate Launch button already sits next to the
  // one that opens this dialog. Each caller passes its own unambiguous
  // answer rather than this dialog guessing.
  autoLaunchOnSave: boolean
}

export function LaunchConfigDialog({ entry, onClose, autoLaunchOnSave }: LaunchConfigDialogProps) {
  const { t } = useTranslation()
  const folderPath = entry?.kind === 'folder' ? entry.path : ''
  const { data: executables } = useListExecutables(folderPath)
  const { data: leAvailable } = useLocaleEmulatorAvailable()
  const { data: userData } = useGameUserData(entry ?? { code: null, path: '' })
  const setLaunchConfig = useSetLaunchConfig()
  const launchGame = useLaunchGame()
  const pickSaveFolder = usePickSaveFolder()
  const setSavePath = useSetSavePath()
  const [showSaveManager, setShowSaveManager] = useState(false)

  const [selectedExe, setSelectedExe] = useState(userData?.launchConfig?.executablePath ?? '')
  const [launchMode, setLaunchMode] = useState<LaunchConfigDto['launchMode']>(
    userData?.launchConfig?.launchMode ?? 'normal'
  )
  // Re-syncs from userData on every change (not hydrate-once) - this dialog
  // is remounted per open (keyed by entry in DetailOverlay), and unlike
  // LaunchConfigSection there's no separate-field-save race to guard
  // against, so RatingMemoDialog's simpler always-sync pattern applies here.
  const [syncedUserData, setSyncedUserData] = useState(userData)
  if (userData !== syncedUserData) {
    setSyncedUserData(userData)
    setSelectedExe(userData?.launchConfig?.executablePath ?? '')
    setLaunchMode(userData?.launchConfig?.launchMode ?? 'normal')
  }

  const handleSaveLaunchConfig = (): void => {
    if (!entry || !selectedExe) return
    setLaunchConfig.mutate(
      { entry, config: { executablePath: selectedExe, launchMode } },
      {
        onSuccess: () => {
          toast.success(t('launchConfig.saved'))
          onClose()
          if (autoLaunchOnSave) {
            launchGame.mutate(entry, {
              onError: () => toast.error(t('launchConfig.launchFailed')),
            })
          }
        },
      }
    )
  }

  const handlePickSaveFolder = async (): Promise<void> => {
    if (!entry) return
    const path = await pickSaveFolder.mutateAsync(entry.path)
    if (path) setSavePath.mutate({ entry, savePath: path })
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('launchConfig.dialogTitle')} {entry ? `- ${entry.name}` : ''}
          </DialogTitle>
        </DialogHeader>

        {entry?.kind !== 'folder' && (
          <p className="text-sm text-muted-foreground">{t('launchConfig.archiveNotSupported')}</p>
        )}

        {entry?.kind === 'folder' && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{t('launchConfig.executable')}</p>
              {(executables ?? []).map((exe) => (
                <label key={exe} className="flex items-center gap-2 text-sm">
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
                <p className="text-sm text-muted-foreground">{t('launchConfig.noExeFound')}</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{t('launchConfig.launchMode')}</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="launchMode"
                  checked={launchMode === 'normal'}
                  onChange={() => setLaunchMode('normal')}
                />
                {t('launchConfig.normalLaunch')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="launchMode"
                  checked={launchMode === 'locale-emulator'}
                  onChange={() => setLaunchMode('locale-emulator')}
                  disabled={!leAvailable}
                />
                {t('launchConfig.localeEmulatorLaunch')}
                {!leAvailable && t('launchConfig.notInstalled')}
              </label>
            </div>

            <Button onClick={handleSaveLaunchConfig} disabled={!selectedExe}>
              {t('launchConfig.saveLaunchConfig')}
            </Button>

            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-medium">{t('launchConfig.saveBackupLocation')}</p>
              <Button variant="secondary" onClick={handlePickSaveFolder}>
                {t('launchConfig.pickSaveFolder')}
              </Button>
              <Button variant="secondary" onClick={() => setShowSaveManager(true)} className="ml-2">
                {t('launchConfig.manageSaves')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
      <SaveManagerDialog
        entry={showSaveManager ? entry : null}
        savePath={userData?.savePath ?? null}
        onClose={() => setShowSaveManager(false)}
      />
    </Dialog>
  )
}
```

- [ ] **Step 3: Update `DetailSidebar.tsx`'s call site — `autoLaunchOnSave={true}`**

Edit `src/components/game/DetailSidebar.tsx:322-326`, currently:

```tsx
      <LaunchConfigDialog
        key={configuringLaunch ? game.path : 'closed'}
        entry={configuringLaunch ? game : null}
        onClose={() => setConfiguringLaunch(false)}
      />
```

Add the new prop:

```tsx
      <LaunchConfigDialog
        key={configuringLaunch ? game.path : 'closed'}
        entry={configuringLaunch ? game : null}
        onClose={() => setConfiguringLaunch(false)}
        autoLaunchOnSave
      />
```

(`autoLaunchOnSave` with no `={...}` is JSX shorthand for `autoLaunchOnSave={true}` — this dialog's only entry point in this file is the failed-launch path, set via `handleLaunch`'s `onError` callback at line 87-89.)

- [ ] **Step 4: Update `DetailOverlay.tsx`'s call site — `autoLaunchOnSave={false}`**

Edit `src/components/game/DetailOverlay.tsx:139-143`, currently:

```tsx
      <LaunchConfigDialog
        key={configuringLaunch && game ? (game.code ? game.code.value : game.path) : 'closed'}
        entry={configuringLaunch ? game : null}
        onClose={() => setConfiguringLaunch(false)}
      />
```

Add the new prop:

```tsx
      <LaunchConfigDialog
        key={configuringLaunch && game ? (game.code ? game.code.value : game.path) : 'closed'}
        entry={configuringLaunch ? game : null}
        onClose={() => setConfiguringLaunch(false)}
        autoLaunchOnSave={false}
      />
```

(This file's `configuringLaunch` is set via its own dedicated "실행 설정" button at line 108, not a failed-launch fallback — a separate "실행" button already exists right next to it for when the user does want to launch.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no new errors. This step specifically catches a missing `autoLaunchOnSave` prop at either call site, since it's now a required (non-optional) prop on `LaunchConfigDialogProps`.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions. This task adds no new automated tests (per Global Constraints — no test infrastructure for dialogs).

- [ ] **Step 7: Live-verify both paths**

Run: `npm run dev` and confirm:
- **Failed-launch path:** find (or temporarily create) a folder-kind entry with no launch config saved yet, click "실행" (Launch) so it fails and opens the config dialog automatically, pick an executable, save. Confirm: a success toast appears, the dialog closes, and the game actually launches (or, if you don't want to actually launch something real during this check, at minimum confirm `launchGame.mutate` fires — e.g. by briefly observing the launch button's own pending/loading behavior would apply here too, or checking dev tools network/IPC activity).
- **Deliberate settings path:** on an entry that already has a working launch config, open its detail overlay/sidebar's own "실행 설정" button directly (not via a failed launch), change something trivial (e.g. toggle launch mode and back), save. Confirm: a success toast appears, the dialog closes, and the game does **not** auto-launch.
- No console errors in either case.

- [ ] **Step 8: Commit**

```bash
git add src/components/game/LaunchConfigDialog.tsx src/components/game/DetailSidebar.tsx src/components/game/DetailOverlay.tsx src/i18n/translations.ts
git commit -m "$(cat <<'EOF'
feat: launch config save closes the dialog, confirms via toast, and conditionally auto-launches

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
