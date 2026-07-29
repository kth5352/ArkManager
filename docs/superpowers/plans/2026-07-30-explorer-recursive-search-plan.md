# Explorer Recursive Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explorer gets the same `SearchHeader` (Ctrl+F expand + genre-exclude chips) Gallery/List/DetailList already have, searching recursively through the currently-displayed folder's subtree only while a query is active.

**Architecture:** Reuse `SearchHeader`/`filterEntries` as-is. Add a `useFolderScanRecursive` hook that calls the existing `scanner:scan-recursive` IPC (already used by Gallery/List/DetailList for whole-library scans) rooted at Explorer's current folder path instead of a registered library root. `FolderView` switches between its existing shallow scan (no query) and this new recursive scan (query active) — normal browsing costs nothing extra.

**Tech Stack:** React + TypeScript strict + React Query + Tailwind.

## Global Constraints

- No manual/CDP live-UI click verification — skip any "수동 검증" step per this project's established policy.
- This repo has zero component-testing infrastructure for `.tsx` files — no dedicated test file expected for the search UI wiring; pure logic (the relative-path helper) gets a real `.test.ts` file.
- **Dependency:** This plan requires `useGameDetailOverlay` from `docs/superpowers/plans/2026-07-30-shared-detail-entry-code-linking-plan.md` (Task 6) to already be implemented — search results open the detail overlay through that shared hook. Confirm `src/hooks/useGameDetailOverlay.tsx` exists before starting Task 2; if it doesn't, that plan must be executed first.
- `scanLibraryRecursive`'s existing semantics (leaves only — coded entries and code-less files are returned, code-less folders are walked into but never themselves returned) apply unchanged to this recursive search; do not add new filtering logic to replicate or override this.

---

### Task 1: `useFolderScanRecursive` hook

**Files:**
- Modify: `src/services/scannerService.ts`

**Interfaces:**
- Produces: `useFolderScanRecursive(path: string, options: { enabled: boolean }): UseQueryResult<ScannedEntry[]>` — Task 3 (FolderView wiring) consumes this.

- [ ] **Step 1: Add the hook**

`scannerService.ts` currently has only `useFolderScan`. Add this function after it (leave `useFolderScan` untouched):

```ts
// Only fires when a search query is active (see FolderView.tsx) - reuses the
// same scanner:scan-recursive IPC endpoint Gallery/List/DetailList already
// use for whole-library scans, just rooted at a single arbitrary folder
// instead of a registered library path (scanLibraryRecursive accepts any
// path string, so this needs no new IPC channel).
export function useFolderScanRecursive(path: string, options: { enabled: boolean }) {
  return useQuery<ScannedEntry[]>({
    queryKey: ['folder-scan-recursive', path],
    queryFn: () => window.api.scanner.scanRecursive([path]),
    enabled: options.enabled,
  })
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/services/scannerService.ts
git commit -m "feat: add useFolderScanRecursive hook rooted at an arbitrary folder path"
```

---

### Task 2: Relative-path display helper

**Files:**
- Create: `src/pages/Explorer/relativePath.ts`
- Create: `src/pages/Explorer/relativePath.test.ts`

**Interfaces:**
- Produces: `relativePath(root: string, fullPath: string): string` — Task 3 consumes this.

- [ ] **Step 1: Write the failing test**

`src/pages/Explorer/relativePath.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { relativePath } from './relativePath'

describe('relativePath', () => {
  it('strips the root and leading separator for a direct child', () => {
    expect(relativePath('D:\\games', 'D:\\games\\SomeGame\\file.zip')).toBe('SomeGame\\file.zip')
  })

  it('handles a root with a trailing separator', () => {
    expect(relativePath('D:\\games\\', 'D:\\games\\SomeGame\\file.zip')).toBe('SomeGame\\file.zip')
  })

  it('returns the full path unchanged if it does not start with the root', () => {
    expect(relativePath('D:\\games', 'E:\\other\\file.zip')).toBe('E:\\other\\file.zip')
  })

  it('returns an empty string when the path equals the root', () => {
    expect(relativePath('D:\\games', 'D:\\games')).toBe('')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm run test -- src/pages/Explorer/relativePath.test.ts`
Expected: FAIL — `relativePath.ts` does not exist.

- [ ] **Step 3: Implement `relativePath.ts`**

```ts
export function relativePath(root: string, fullPath: string): string {
  const normalizedRoot = root.replace(/[\\/]+$/, '')
  if (fullPath === normalizedRoot) return ''
  if (!fullPath.startsWith(normalizedRoot)) return fullPath
  return fullPath.slice(normalizedRoot.length).replace(/^[\\/]+/, '')
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm run test -- src/pages/Explorer/relativePath.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Explorer/relativePath.ts src/pages/Explorer/relativePath.test.ts
git commit -m "feat: add relativePath helper for Explorer search result display"
```

---

### Task 3: Wire search into `FolderView`

**Files:**
- Modify: `src/pages/Explorer/FolderView.tsx`

**Interfaces:**
- Consumes: `useFolderScanRecursive` (Task 1), `relativePath` (Task 2), `useGameDetailOverlay` (already wired in by the shared-detail-entry-code-linking plan's Task 6 — this task only adds search on top of what that task left in place), `filterEntries`/`SearchHeader` (already exist, used as-is), `useGameMetadataMany` (already exists).

**Design note:** Read the actual current `FolderView.tsx` before starting — it was already modified by the shared-detail-entry-code-linking plan's Task 6 (moved to use `useGameDetailOverlay`, added the code-linking context-menu item). This task adds search state and a second rendering branch on top of that, it does not revert or conflict with those changes.

- [ ] **Step 1: Add search state, recursive scan, and filtering**

Add these imports:

```ts
import { useState } from 'react'
import { SearchHeader } from '../../components/layout/SearchHeader'
import { filterEntries } from '../../lib/filterEntries'
import { useFolderScan, useFolderScanRecursive } from '../../services/scannerService'
import { useGameMetadataMany } from '../../services/metadataService'
import { relativePath } from './relativePath'
```

(`useFolderScan` replaces the existing single-name import from `scannerService` — import both from the same line. `useState` is a new import for this file since `FolderView` was a function component with no local `useState` calls before this task, per the file as left by the shared-detail-entry-code-linking plan.)

Inside `FolderView`, add state and derive which data source to use:

```ts
  const [searchQuery, setSearchQuery] = useState('')
  const [excludedGenres, setExcludedGenres] = useState<string[]>([])
  const isSearching = searchQuery !== ''

  // Root is wherever the user is currently browsing within this tab (the
  // breadcrumb position), not the tab's original opening path - matches the
  // "search from here down" expectation.
  const { data: shallowEntries = [], isError } = useFolderScan(path)
  const { data: recursiveEntries = [] } = useFolderScanRecursive(path, { enabled: isSearching })

  const codes = recursiveEntries.flatMap((e) => (e.code ? [e.code.value] : []))
  const { data: metadataByCode = {} } = useGameMetadataMany(codes)

  const toggleGenreFilter = (genre: string): void => {
    setExcludedGenres((current) =>
      current.includes(genre) ? current.filter((g) => g !== genre) : [...current, genre]
    )
  }

  const searchResults = isSearching
    ? filterEntries(recursiveEntries, metadataByCode, searchQuery, excludedGenres)
    : []

  const entries = isSearching ? searchResults : shallowEntries
```

Remove the old `const { data: entries = [], isError } = useFolderScan(path)` line entirely — it's replaced by the two-source logic above (`entries` is now derived, not destructured directly).

- [ ] **Step 2: Render `SearchHeader` and switch row rendering based on `isSearching`**

In the returned JSX, add `<SearchHeader>` right after the breadcrumb `<div>` and before `<PageToolbar>`:

```tsx
      <SearchHeader
        query={searchQuery}
        onQueryChange={setSearchQuery}
        excludedGenres={excludedGenres}
        onClearFilters={() => setExcludedGenres([])}
      />
      <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
```

Change the entry-list rendering: when `isSearching`, render a flat list of `searchResults` (each showing name + relative path, clicking opens the shared detail overlay directly — never navigates, since these are already leaf entries at arbitrary depth); when not searching, render the existing `sortedEntries` list exactly as before (unchanged `FolderEntryRow` usage). Replace the existing:

```tsx
      {isError ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          이 폴더에 접근할 수 없습니다.
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-auto">
          {sortedEntries.map((entry) => (
            <FolderEntryRow
              key={entry.path}
              entry={entry}
              onOpenInNewTab={openInNewTab}
              onEntryClick={handleEntryClick}
              onOpenDetail={openDetail}
            />
          ))}
        </ul>
      )}
```

with:

```tsx
      {isSearching ? (
        <ul className="flex-1 divide-y divide-border overflow-auto">
          {searchResults.map((entry) => (
            <li
              key={entry.path}
              className="flex cursor-pointer flex-col gap-0.5 px-4 py-2 text-sm transition-colors hover:bg-accent"
              onClick={() => openDetail(entry)}
            >
              <span className="truncate">{entry.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {relativePath(path, entry.path)}
              </span>
            </li>
          ))}
          {searchResults.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              검색 결과가 없습니다.
            </li>
          )}
        </ul>
      ) : isError ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          이 폴더에 접근할 수 없습니다.
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-auto">
          {sortEntries(entries, sortField, sortDirection).map((entry) => (
            <FolderEntryRow
              key={entry.path}
              entry={entry}
              onOpenInNewTab={openInNewTab}
              onEntryClick={handleEntryClick}
              onOpenDetail={openDetail}
            />
          ))}
        </ul>
      )}
```

Note `sortedEntries` (the old `const sortedEntries = sortEntries(entries, sortField, sortDirection)` line, computed once near the top of the component from the prior file version) should be removed as a standalone variable and inlined as shown above (`sortEntries(entries, ...)` called directly in the non-searching branch) — since `entries` now depends on `isSearching`, computing `sortedEntries` unconditionally at the top would sort the search-results array too, which is unwanted (search results aren't run through the sort preference, they're shown in `filterEntries`'s natural order). Keep the `sortField`/`sortDirection`/`setSort` destructuring from `useSortPreference('explorer')` as-is — `<PageToolbar>` still needs it for the non-search browsing mode.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: all pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Explorer/FolderView.tsx
git commit -m "feat: add recursive search to Explorer, rooted at the current folder"
```

---

### Task 4: Final verification

**Files:** None (verification only).

- [ ] **Step 1: Run the full verification suite**

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
npm run build
```

Expected: all five exit 0. For `format:check`, use the established git-blob-comparison method (`git show HEAD:<path> | npx prettier --check --stdin-filepath <path>`) to isolate real issues from pre-existing CRLF noise before fixing.

- [ ] **Step 2: Commit any fixes**

Only if Step 1 required changes:

```bash
git add -A
git commit -m "fix: address issues found in explorer-recursive-search verification pass"
```
