// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RatingMemoDialog } from './RatingMemoDialog'
import type { ScannedEntry } from '../../../shared/types/scanner'

const fixture = vi.hoisted(() => ({
  data: undefined as undefined | null | { rating: number | null; memo: string | null },
  isError: false,
  mutate: vi.fn(),
  refetch: vi.fn(),
}))
vi.mock('../../services/gameUserDataService', () => ({
  useGameUserData: () => ({
    data: fixture.data,
    isError: fixture.isError,
    refetch: fixture.refetch,
  }),
  useSetRatingAndMemo: () => ({ mutate: fixture.mutate, isPending: false, isError: false }),
}))
vi.mock('../../i18n/useTranslation', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const appToastMocks = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('../../lib/appToast', () => ({ appToast: { error: appToastMocks.error } }))

const entry: ScannedEntry = {
  name: 'sample',
  path: 'C:/fixture/sample',
  kind: 'folder',
  code: null,
  mtimeMs: 0,
  size: 0,
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.data = undefined
  fixture.isError = false
  fixture.mutate.mockClear()
  fixture.refetch.mockClear()
  appToastMocks.error.mockClear()
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
    root.render(createElement(RatingMemoDialog, { entry, onClose: vi.fn() }))
  })
}

// Radix Dialog portals its content out of `container` into a node appended
// directly to document.body.
function star(index: number): HTMLButtonElement {
  return document.body.querySelectorAll('button')[index] as HTMLButtonElement
}

function textarea(): HTMLTextAreaElement {
  return document.body.querySelector('textarea')!
}

function saveButton(): HTMLButtonElement {
  return Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent === 'common.save'
  )!
}

it('does not save unknown rating/memo when Save is clicked before the initial load resolves', async () => {
  await render()
  expect(textarea().disabled).toBe(true)
  expect(saveButton().disabled).toBe(true)

  await act(async () => saveButton().click())
  expect(fixture.mutate).not.toHaveBeenCalled()
})

it('saves the real loaded values once the initial load resolves', async () => {
  await render()
  fixture.data = { rating: 4, memo: '보존할 메모' }
  await render()

  expect(textarea().value).toBe('보존할 메모')
  expect(textarea().disabled).toBe(false)
  await act(async () => star(0).click())
  await act(async () => saveButton().click())

  expect(fixture.mutate).toHaveBeenCalledTimes(1)
  expect(fixture.mutate).toHaveBeenLastCalledWith(
    { entry, rating: 1, memo: '보존할 메모' },
    expect.any(Object)
  )
})

it('allows editing immediately when the loaded record is null (no prior data)', async () => {
  fixture.data = null
  await render()

  expect(textarea().disabled).toBe(false)
  expect(saveButton().disabled).toBe(false)
})

it('disables editing and does not save when the initial load fails, and retry re-fetches', async () => {
  fixture.isError = true
  await render()

  expect(textarea().disabled).toBe(true)
  expect(saveButton().disabled).toBe(true)
  await act(async () => saveButton().click())
  expect(fixture.mutate).not.toHaveBeenCalled()

  const retry = Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent === 'common.retry'
  )!
  await act(async () => retry.click())
  expect(fixture.refetch).toHaveBeenCalledTimes(1)
})
