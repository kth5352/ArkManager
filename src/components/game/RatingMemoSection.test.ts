// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RatingMemoSection } from './RatingMemoSection'
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

const game: ScannedEntry = {
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
    root.render(createElement(RatingMemoSection, { game }))
  })
}

function star(index: number): HTMLButtonElement {
  return container.querySelectorAll('button')[index] as HTMLButtonElement
}

function textarea(): HTMLTextAreaElement {
  return container.querySelector('textarea')!
}

function setNativeValue(el: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

it('does not save unknown memo during cold load, then preserves the loaded memo', async () => {
  await render()
  await act(async () => star(4).click())
  expect(fixture.mutate).not.toHaveBeenCalled()
  expect(textarea().disabled).toBe(true)

  fixture.data = { rating: 4, memo: '보존할 메모' }
  await render()
  expect(textarea().value).toBe('보존할 메모')
  await act(async () => star(0).click())
  expect(fixture.mutate).toHaveBeenLastCalledWith(
    { entry: game, rating: 1, memo: '보존할 메모' },
    expect.any(Object)
  )
})

it('allows editing immediately when the loaded record is null (no prior data)', async () => {
  fixture.data = null
  await render()
  expect(textarea().disabled).toBe(false)
  await act(async () => star(2).click())
  expect(fixture.mutate).toHaveBeenLastCalledWith(
    { entry: game, rating: 3, memo: null },
    expect.any(Object)
  )
})

it('disables editing and does not write when the initial load fails', async () => {
  fixture.data = undefined
  fixture.isError = true
  await render()
  expect(textarea().disabled).toBe(true)
  await act(async () => star(0).click())
  expect(fixture.mutate).not.toHaveBeenCalled()
  await act(async () => textarea().dispatchEvent(new Event('focusout', { bubbles: true })))
  expect(fixture.mutate).not.toHaveBeenCalled()
  await act(async () => container.querySelector('[data-testid="rating-memo-retry"]')!.dispatchEvent(
    new MouseEvent('click', { bubbles: true })
  ))
  expect(fixture.refetch).toHaveBeenCalledTimes(1)
})

it('allows editing immediately from warm cache (data already present on mount)', async () => {
  fixture.data = { rating: 2, memo: 'warm' }
  await render()
  expect(textarea().disabled).toBe(false)
  expect(textarea().value).toBe('warm')
})

it('keeps a local memo draft when a stale query response arrives after the edit', async () => {
  fixture.data = { rating: 1, memo: 'original' }
  await render()
  setNativeValue(textarea(), 'draft in progress')
  await act(async () => {
    textarea().dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(textarea().value).toBe('draft in progress')

  // A stale response for the SAME query key arriving after the user has
  // already started editing must not clobber the in-progress draft - this
  // component intentionally hydrates from userData only once (see its own
  // comment), not on every cache update.
  await render()
  expect(textarea().value).toBe('draft in progress')
})

it('shows no saved indicator when the save mutation fails', async () => {
  fixture.data = { rating: 1, memo: 'original' }
  fixture.mutate.mockImplementation((_vars, opts: { onError?: () => void }) => {
    opts.onError?.()
  })
  await render()
  await act(async () => star(4).click())
  expect(container.textContent).not.toContain('ratingMemo.saved')
  expect(appToastMocks.error).toHaveBeenCalledWith('ratingMemo.saveFailed')
})
