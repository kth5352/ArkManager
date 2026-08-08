# Release Notes HTML Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display GitHub HTML release notes as safe, readable text and republish the corrected 1.1.0 build.

**Architecture:** `normalizeReleaseNotes` owns the external updater format boundary and converts HTML to plain text before IPC. The renderer remains a text-only consumer. The corrected build replaces all updater assets under the existing `v1.1.0` release.

**Tech Stack:** TypeScript, Cheerio, Vitest, Electron, electron-builder, GitHub CLI

## Global Constraints

- Keep version `1.1.0`.
- Never render updater-provided HTML directly in React.
- Replace installer, blockmap, and `latest.yml` as one verified asset set.

---

### Task 1: Reproduce and Fix HTML Notes

**Files:**
- Modify: `electron/main/normalizeReleaseNotes.test.ts`
- Modify: `electron/main/normalizeReleaseNotes.ts`

**Interfaces:**
- Consumes: `UpdateInfo.releaseNotes`
- Produces: `ReleaseNote[]` containing plain text only

- [x] **Step 1: Add tests for GitHub HTML, array notes, and unsafe elements.**
- [x] **Step 2: Run the targeted test and confirm it fails on raw HTML.**
- [x] **Step 3: Add a minimal HTML-to-text normalizer using Cheerio.**
- [x] **Step 4: Run targeted and full verification.**

### Task 2: Rebuild and Replace 1.1.0

**Files:**
- Verify: `package.json`
- Replace: `dist/Ark Manager Setup 1.1.0.exe`
- Replace: `dist/Ark Manager Setup 1.1.0.exe.blockmap`
- Replace: `dist/latest.yml`

**Interfaces:**
- Consumes: verified source and release notes
- Produces: updater-compatible 1.1.0 GitHub Release assets

- [ ] **Step 1: Commit and push the fix.**
- [x] **Step 2: Build the Windows 1.1.0 installer.**
- [ ] **Step 3: Move and force-push the `v1.1.0` tag to the fix commit.**
- [ ] **Step 4: Replace all three GitHub Release assets.**
- [ ] **Step 5: Verify remote tag, body, asset names, sizes, and hashes.**
