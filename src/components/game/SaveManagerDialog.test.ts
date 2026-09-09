// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SaveManagerDialog } from './SaveManagerDialog'
import type { ScannedEntry } from '../../../shared/types/scanner'
import type { SaveDiffEntryDto, SaveSnapshotDto } from '../../../shared/types/ipc'

const fixture = vi.hoisted(() => ({
  snapshots: [] as SaveSnapshotDto[],
  diffData: undefined as SaveDiffEntryDto[] | undefined,
  diffPending: false,
  diffError: false,
  refetchDiff: vi.fn(),
  createSnapshotMutate: vi.fn(),
  restoreSnapshotMutate: vi.fn(),
  useSaveDiffCalls: vi.fn(),
}))

vi.mock('../../services/saveService', () => ({
  useSaveSnapshots: () => ({ data: fixture.snapshots }),
  useSaveDiff: (
    entry: unknown,
    timestamp: string | null,
    enabled: boolean,
    mode?: 'save' | 'restore'
  ) => {
    fixture.useSaveDiffCalls(timestamp, enabled, mode)
    return {
      data: fixture.diffData,
      isPending: fixture.diffPending,
      isError: fixture.diffError,
      refetch: fixture.refetchDiff,
    }
  },
  useCreateSaveSnapshot: () => ({ mutate: fixture.createSnapshotMutate, isPending: false }),
  useRestoreSaveSnapshot: () => ({ mutate: fixture.restoreSnapshotMutate, isPending: false }),
  useSetSnapshotLabel: () => ({ mutate: vi.fn() }),
  useDeleteSnapshot: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAllSnapshots: () => ({ mutate: vi.fn(), isPending: false }),
  useShowSnapshotInFolder: () => ({ mutate: vi.fn() }),
  useCheckVersionMismatch: () => ({ mutate: vi.fn() }),
}))
vi.mock('../../i18n/useTranslation', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../lib/appToast', () => ({ appToast: { error: vi.fn() } }))

const entry: Pick<ScannedEntry, 'code' | 'path' | 'name'> = {
  code: null,
  path: 'C:/fixture/sample',
  name: 'sample',
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.snapshots = []
  fixture.diffData = undefined
  fixture.diffPending = false
  fixture.diffError = false
  fixture.refetchDiff.mockClear()
  fixture.createSnapshotMutate.mockClear()
  fixture.restoreSnapshotMutate.mockClear()
  fixture.useSaveDiffCalls.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function render(): Promise<void> {
  await act(async () => {
    root.render(createElement(SaveManagerDialog, { entry, savePath: 'C:/fixture/save', onClose: vi.fn() }))
  })
}

// Radix Dialog portals its content out of `container` into a node appended
// directly to document.body, so lookups must search the whole document, not
// just the render container.
function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === text)
}

async function openSavePreview(): Promise<void> {
  await render()
  await act(async () => buttonByText('saveManager.saveNew')!.click())
}

it('shows a failure message and disables confirm/retries via the retry button when the diff query fails', async () => {
  fixture.diffError = true
  await openSavePreview()

  expect(document.body.textContent).toContain('saveManager.diffFailed')
  const confirm = buttonByText('saveManager.confirmSave')
  expect(confirm?.disabled).toBe(true)

  const retry = buttonByText('common.retry')
  expect(retry).toBeDefined()
  await act(async () => retry!.click())
  expect(fixture.refetchDiff).toHaveBeenCalledTimes(1)
})

it('enables confirm once a retried diff succeeds', async () => {
  fixture.diffError = true
  await openSavePreview()
  expect(buttonByText('saveManager.confirmSave')?.disabled).toBe(true)

  fixture.diffError = false
  fixture.diffData = []
  await render()

  expect(buttonByText('saveManager.confirmSave')?.disabled).toBe(false)
  expect(document.body.textContent).toContain('saveManager.noDifferences')
})

it('shows noDifferences (not a loading/error state) when the diff genuinely resolves empty', async () => {
  fixture.diffData = []
  await openSavePreview()

  expect(document.body.textContent).toContain('saveManager.noDifferences')
  expect(document.body.textContent).not.toContain('saveManager.diffFailed')
  expect(document.body.textContent).not.toContain('saveManager.diffLoading')
})

it('does not show a success state when isError is true even if stale diff data is still cached', async () => {
  // A query that has cached data from a PREVIOUS successful fetch but is
  // now in an error state (e.g. a retry failed) must still show the error,
  // not the stale success content - React Query keeps `data` around across
  // a failed refetch by default.
  fixture.diffData = [{ relativePath: 'stale.dat', status: 'added' }]
  fixture.diffError = true
  await openSavePreview()

  expect(document.body.textContent).toContain('saveManager.diffFailed')
  expect(document.body.textContent).not.toContain('stale.dat')
  expect(buttonByText('saveManager.confirmSave')?.disabled).toBe(true)
})

it('passes mode: save for a save preview and mode: restore (with the chosen timestamp) for a restore preview', async () => {
  // The whole point of this change: an inverted ternary here would silently
  // reopen the exact hole R2 closed (a save preview treated as permissive,
  // or a restore preview treated as strict) with a green suite, since
  // every other test in this file mocks useSaveDiff without inspecting its
  // arguments.
  fixture.snapshots = [
    {
      timestamp: '2026-01-01T00-00-00-000Z',
      fileCount: 1,
      totalSizeBytes: 10,
      memo: null,
      version: null,
    },
  ]
  await render()

  await act(async () => buttonByText('saveManager.saveNew')!.click())
  expect(fixture.useSaveDiffCalls).toHaveBeenLastCalledWith(
    '2026-01-01T00-00-00-000Z',
    true,
    'save'
  )

  await act(async () => buttonByText('common.cancel')!.click())
  await act(async () => buttonByText('saveManager.restore')!.click())
  expect(fixture.useSaveDiffCalls).toHaveBeenLastCalledWith(
    '2026-01-01T00-00-00-000Z',
    true,
    'restore'
  )
})

it('allows confirming a restore whose preview succeeded against a missing live folder', async () => {
  fixture.snapshots = [
    {
      timestamp: '2026-01-01T00-00-00-000Z',
      fileCount: 1,
      totalSizeBytes: 10,
      memo: null,
      version: null,
    },
  ]
  // Restoring into a live folder that doesn't exist yet is a normal,
  // successful comparison (see saveHandlers.ts's SAVE_DIFF mode policy) -
  // confirm must be enabled, not treated as a failure.
  fixture.diffData = [{ relativePath: 'save1.dat', status: 'removed' }]
  await render()
  await act(async () => buttonByText('saveManager.restore')!.click())

  expect(buttonByText('saveManager.confirmRestore')?.disabled).toBe(false)
  await act(async () => buttonByText('saveManager.confirmRestore')!.click())
  expect(fixture.restoreSnapshotMutate).toHaveBeenCalledTimes(1)
})
