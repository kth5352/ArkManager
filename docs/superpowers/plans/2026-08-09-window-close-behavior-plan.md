# Window Close Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose whether closing Ark Manager quits or keeps it in the system tray, remember the choice when requested, expose it in Settings, and release the change as 1.1.1.

**Architecture:** A shared three-value schema defines the persisted contract. A testable main-process controller converts close requests and prompt results into quit/tray/cancel actions while suppressing duplicate prompts. `index.ts` supplies Electron dialog, window, database, locale, and quit dependencies; the renderer only edits the same persisted policy through the existing settings IPC.

**Tech Stack:** Electron, React 19, TypeScript, Zod, TanStack Query, Radix Select, Drizzle/better-sqlite3, Vitest, electron-builder, GitHub CLI

## Global Constraints

- Version and release tag are exactly `1.1.1` and `v1.1.1`.
- The missing or invalid policy defaults to `ask`.
- The prompt default button is quit; cancel never persists a choice.
- Tray-menu quit and updater quit bypass the close prompt.
- Renderer code never controls whether an Electron close event is allowed.
- Korean, Japanese, and English are supported in the prompt and Settings.

---

### Task 1: Shared Setting Contract

**Files:**
- Modify: `shared/types/ipc.ts`
- Modify: `shared/types/ipc.test.ts`
- Modify: `electron/main/ipc/settingsHandlers.ts`
- Modify: `electron/main/ipc/settingsHandlers.test.ts`

**Interfaces:**
- Produces: `WindowCloseBehaviorSchema`, `WindowCloseBehavior`, and setting key `window-close-behavior`
- Produces: settings get response containing only `ask | quit | tray | null`

- [ ] **Step 1: Add failing shared-schema tests.**

```ts
expect(WindowCloseBehaviorSchema.parse('ask')).toBe('ask')
expect(WindowCloseBehaviorSchema.parse('quit')).toBe('quit')
expect(WindowCloseBehaviorSchema.parse('tray')).toBe('tray')
expect(() => WindowCloseBehaviorSchema.parse('hide')).toThrow()
expect(SettingKeySchema.parse('window-close-behavior')).toBe('window-close-behavior')
```

- [ ] **Step 2: Run `npm test -- --run shared/types/ipc.test.ts` and confirm the new exports/key are missing.**
- [ ] **Step 3: Add the schema, inferred type, and setting key to `shared/types/ipc.ts`.**
- [ ] **Step 4: Add a failing settings-handler test storing `invalid` and expecting `null`.**
- [ ] **Step 5: Run `npm test -- --run electron/main/ipc/settingsHandlers.test.ts` and confirm `invalid` is returned instead of `null`.**
- [ ] **Step 6: Parse this key with `WindowCloseBehaviorSchema.safeParse` in `SETTINGS_GET`.**
- [ ] **Step 7: Run both targeted tests and confirm they pass.**
- [ ] **Step 8: Commit with `feat: add window close behavior setting` after the task review.**

### Task 2: Testable Close Controller

**Files:**
- Create: `electron/main/windowCloseBehavior.ts`
- Create: `electron/main/windowCloseBehavior.test.ts`

**Interfaces:**
- Produces: `resolveWindowCloseBehavior(raw: string | undefined): WindowCloseBehavior`
- Produces: `createWindowCloseController(deps): { requestClose(): Promise<void> }`
- `deps`: `getBehavior`, `showPrompt`, `persistBehavior`, `quit`, `hide`, and `reportError`
- Prompt result: `{ response: 'quit' | 'tray' | 'cancel'; remember: boolean }`

- [ ] **Step 1: Add failing parser tests for valid, missing, and invalid stored values.**
- [ ] **Step 2: Add failing controller tests for remembered `quit` and `tray`, verifying no prompt is called.**
- [ ] **Step 3: Add failing `ask` tests for quit, tray, cancel, and remember checked/unchecked.**
- [ ] **Step 4: Add failing concurrency and error tests: two requests share one pending prompt; rejected prompts do nothing; persistence failure reports an error but still performs the action.**
- [ ] **Step 5: Run `npm test -- --run electron/main/windowCloseBehavior.test.ts` and confirm the module is missing.**
- [ ] **Step 6: Implement the minimal parser and controller. Persist only `quit` or `tray` when `remember` is true, catch persistence errors separately, and clear the pending flag in `finally`.**
- [ ] **Step 7: Run the targeted test and confirm every controller case passes.**
- [ ] **Step 8: Commit with `feat: add window close decision controller` after the task review.**

### Task 3: Electron Window Lifecycle

**Files:**
- Modify: `electron/main/index.ts`
- Modify: `electron/main/windowCloseBehavior.ts`
- Modify: `electron/main/windowCloseBehavior.test.ts`

**Interfaces:**
- Consumes: controller from Task 2 and settings repository
- Produces: native localized prompt and close-event behavior

- [ ] **Step 1: Add failing locale-message tests for `ko`, `ja`, `en`, and an invalid locale falling back to Korean.**
- [ ] **Step 2: Add `getWindowClosePrompt(locale)` returning title, message, buttons, and checkbox labels with quit at response index 0, tray at 1, and cancel at 2.**
- [ ] **Step 3: In `app.whenReady`, construct the controller using synchronous `getSetting`/`setSetting`, `dialog.showMessageBox`, `mainWindow.hide()`, and `app.quit()`.**
- [ ] **Step 4: Replace unconditional hide in the main window close listener with `preventDefault()` plus `void closeController.requestClose()`, while preserving the existing `isQuitting` bypass.**
- [ ] **Step 5: Ensure dialog rejection and a destroyed/missing main window resolve as cancel; log persistence failures with `console.error`.**
- [ ] **Step 6: Run controller tests, typecheck, and the existing main-process tests.**
- [ ] **Step 7: Commit with `feat: prompt for window close behavior` after the task review.**

### Task 4: Settings UI

**Files:**
- Modify: `electron/preload/index.ts`
- Modify: `src/services/settingsService.ts`
- Modify: `src/pages/Settings/SettingsPage.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Produces: `window.api.settings.getWindowCloseBehavior()` and `setWindowCloseBehavior(value)`
- Produces: `useWindowCloseBehaviorQuery()` and `useSetWindowCloseBehaviorMutation()`
- Consumes: `WindowCloseBehavior` from shared IPC types

- [ ] **Step 1: Add typed preload get/set methods using existing `SETTINGS_GET` and `SETTINGS_SET` channels.**
- [ ] **Step 2: Add a React Query key, query defaulting null to `ask`, and mutation that updates the cache on success.**
- [ ] **Step 3: Add localized keys for section title, description, and the three policy labels in Korean, Japanese, and English.**
- [ ] **Step 4: Add `WindowCloseBehaviorSection` using the existing Radix `Select`; use `w-56`, disable during mutation, and persist on `onValueChange`.**
- [ ] **Step 5: Place the section before Language/Update and add vertical overflow to the Settings page so the extra section remains reachable on short windows.**
- [ ] **Step 6: Run `npm run typecheck`, `npm run lint`, and targeted Prettier checks.**
- [ ] **Step 7: Commit with `feat: configure window close behavior` after the task review.**

### Task 5: Version and Release Documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

**Interfaces:**
- Produces: application version `1.1.1`
- Produces: README 1.1.1 release notes used for the GitHub body

- [ ] **Step 1: Run `npm version 1.1.1 --no-git-tag-version` and verify both manifests changed together.**
- [ ] **Step 2: Add a 1.1.1 README section describing the close prompt, default quit button, remember checkbox, Settings policy, and localized behavior.**
- [ ] **Step 3: Update the main feature summary to describe configurable close-to-tray behavior instead of unconditional tray execution.**
- [ ] **Step 4: Run Prettier checks and `git diff --check`.**
- [ ] **Step 5: Commit with `chore: prepare 1.1.1 release` after the task review.**

### Task 6: Verification, Build, and GitHub Release

**Files:**
- Build: `dist/Ark Manager Setup 1.1.1.exe`
- Build: `dist/Ark Manager Setup 1.1.1.exe.blockmap`
- Build: `dist/latest.yml`

**Interfaces:**
- Consumes: completed 1.1.1 source and README notes
- Produces: public updater-compatible GitHub Release `v1.1.1`

- [ ] **Step 1: Run `npm test -- --run`; expect all test files and tests to pass.**
- [ ] **Step 2: Run `npm run typecheck`, `npm run lint`, targeted Prettier checks, and `git diff --check`; require zero errors.**
- [ ] **Step 3: Run `npm run build` and verify all three 1.1.1 artifacts exist.**
- [ ] **Step 4: Decode the SHA-512 from `latest.yml` and compare it byte-for-byte with the installer hash.**
- [ ] **Step 5: Push `master`, create annotated tag `v1.1.1`, and push the tag.**
- [ ] **Step 6: Generate a BOM-free release body from README, upload the hyphenated installer name, blockmap, and `latest.yml`, and mark the release latest.**
- [ ] **Step 7: Query GitHub and verify tag commit, title, draft/prerelease flags, release body, asset names, sizes, SHA-256 digests, and latest status.**
