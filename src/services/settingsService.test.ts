import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WindowCloseBehavior } from '../../shared/types/ipc'
import {
  useSetWindowCloseBehaviorMutation,
  useWindowCloseBehaviorQuery,
  WINDOW_CLOSE_BEHAVIOR_QUERY_KEY,
} from './settingsService'

const reactQueryMocks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  useQueryClient: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => reactQueryMocks)

type QueryOptions = {
  queryKey: readonly string[]
  queryFn: () => Promise<WindowCloseBehavior>
}

type MutationOptions = {
  mutationFn: (behavior: WindowCloseBehavior) => Promise<void>
  onSuccess: (_data: void, behavior: WindowCloseBehavior) => void
}

describe('window close behavior settings', () => {
  const setQueryData = vi.fn()
  const getWindowCloseBehavior = vi.fn()
  const setWindowCloseBehavior = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    reactQueryMocks.useQueryClient.mockReturnValue({ setQueryData })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        api: {
          settings: {
            getWindowCloseBehavior,
            setWindowCloseBehavior,
          },
        },
      },
    })
  })

  it('defaults a missing close behavior to ask', async () => {
    getWindowCloseBehavior.mockResolvedValue(null)

    useWindowCloseBehaviorQuery()

    const query = reactQueryMocks.useQuery.mock.calls[0][0] as QueryOptions
    expect(query.queryKey).toEqual(WINDOW_CLOSE_BEHAVIOR_QUERY_KEY)
    await expect(query.queryFn()).resolves.toBe('ask')
  })

  it('persists the selection and updates the query cache', async () => {
    useSetWindowCloseBehaviorMutation()

    const mutation = reactQueryMocks.useMutation.mock.calls[0][0] as MutationOptions
    await mutation.mutationFn('tray')
    mutation.onSuccess(undefined, 'tray')

    expect(setWindowCloseBehavior).toHaveBeenCalledWith('tray')
    expect(setQueryData).toHaveBeenCalledWith(WINDOW_CLOSE_BEHAVIOR_QUERY_KEY, 'tray')
  })
})
