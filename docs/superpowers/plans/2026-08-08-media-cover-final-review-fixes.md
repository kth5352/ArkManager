# Media Cover Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface fatal audio-cover recovery failures safely, fully diagnose retained backups, and strengthen VNDB path-row migration invariance coverage.

**Architecture:** Keep recovery ownership in `audioCover`, sanitize only the fatal error at the media-thumbnail IPC boundary, and let `MediaPage` translate the stable shared marker into the existing error-toast pattern. Do not change migration production logic; expand the direct migration fixture to compare every path-keyed user-data column before and after two runs.

**Tech Stack:** TypeScript, Electron IPC, React, TanStack Query, Vitest, better-sqlite3.

## Global Constraints

- WAV remains override-only and never invokes FFmpeg or backup dependencies.
- MP3, FLAC, and M4A retain their existing embedded-cover workflow.
- A recovery backup is deleted after failed embedding only when restore succeeds and SHA-256 hashes match.
- Child-process commands and stderr remain in main-process diagnostics and never reach renderer errors or toasts.
- Tests use only in-memory or temporary databases and files; the actual user database is never opened.
- Keep package version `1.1.0` and do not launch the app or installer.

---

### Task 1: Recovery diagnostics and retained-backup semantics

**Files:**
- Modify: `electron/main/media/audioCover.test.ts`
- Modify: `electron/main/media/audioCover.ts`
- Create: `shared/mediaThumbnailErrors.ts`

**Interfaces:**
- Produces: a stable `MEDIA_THUMBNAIL_RECOVERY_BACKUP_RETAINED_ERROR_MESSAGE` and renderer-safe type guard.
- Produces: stage-aware main-process diagnostics carrying the exact backup path.

- [ ] Write failing tests for fatal restore sanitization, hash rejection, hash mismatch diagnostics, and backup-removal failure.
- [ ] Run `npx vitest run electron/main/media/audioCover.test.ts` and confirm failures describe missing safe errors/diagnostics.
- [ ] Implement the minimal stage-aware recovery reporting and safe typed fatal error.
- [ ] Re-run the focused audio-cover test to green.

### Task 2: IPC sanitization and MediaPage error toast

**Files:**
- Modify: `electron/main/ipc/mediaThumbnailHandlers.test.ts`
- Modify: `electron/main/ipc/mediaThumbnailHandlers.ts`
- Create: `src/pages/Media/MediaPage.test.ts`
- Modify: `src/pages/Media/MediaPage.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: the shared retained-backup error message/type guard from Task 1.
- Produces: an IPC rejection containing only stable safe text and a translated error toast in `MediaPage`.

- [ ] Write failing IPC and MediaPage feedback tests proving child-process details are absent and fatal recovery is toasted.
- [ ] Run the focused IPC/MediaPage tests and confirm expected RED failures.
- [ ] Catch the typed main-process error at IPC, rethrow only the shared safe message, and catch rejected mutations in `MediaPage`.
- [ ] Re-run focused IPC/MediaPage tests to green.

### Task 3: Path-keyed migration invariance

**Files:**
- Modify: `electron/main/database/migrateVndbCodePrefixes.test.ts`

**Interfaces:**
- Consumes: existing `migrateVndbCodePrefixes(sqlite)` behavior.
- Produces: full-row evidence that path-keyed `game_user_data` is unchanged after two migration runs.

- [ ] Seed every path-row column with a non-default value and capture `SELECT *` before migration.
- [ ] Compare `SELECT *` after each of two runs to the original row.
- [ ] Run `npx vitest run electron/main/database/migrateVndbCodePrefixes.test.ts electron/main/database/client.test.ts`.

### Task 4: Final verification, report, and commit

**Files:**
- Create: `.superpowers/sdd/2026-08-08-media-cover-ui-vndb-cleanup-plan/final-fix-report.md`

- [ ] Run focused audio-cover, IPC, MediaPage, migration, and client tests.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm test`.
- [ ] Review `git diff`, run `git diff --check`, and verify version `1.1.0`.
- [ ] Write RED/GREEN, files, commands, outputs, commit, and artifact evidence to the required report.
- [ ] Commit the final fix wave.
- [ ] From final HEAD run `npm run build` to exit code 0, record installer/blockmap evidence, amend the report, and commit the report update if tracked.
