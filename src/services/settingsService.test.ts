import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WindowCloseBehavior } from '../../shared/types/ipc'
import {
  useMediaEqualizerQuery,
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

type EqualizerQueryOptions = {
  queryFn: () => Promise<number[]>
}

describe('media equalizer settings', () => {
  const getMediaEqualizerBands = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { api: { settings: { getMediaEqualizerBands } } },
    })
  })

  function useEqualizerQueryFn(): () => Promise<number[]> {
    useMediaEqualizerQuery()
    const query = reactQueryMocks.useQuery.mock.calls[0][0] as EqualizerQueryOptions
    return query.queryFn
  }

  it('accepts a well-formed persisted array', async () => {
    getMediaEqualizerBands.mockResolvedValue(JSON.stringify([1, 2, 3, 4, 5]))
    await expect(useEqualizerQueryFn()()).resolves.toEqual([1, 2, 3, 4, 5])
  })

  // Number.isFinite is the actual regression being guarded: `typeof g ===
  // 'number'` alone is true for Infinity, which would otherwise reach the
  // native mpv EQ addon unfiltered. JSON has no literal for NaN/Infinity,
  // but a numeric literal that overflows a JS double (e.g. 1e400) parses to
  // Infinity via JSON.parse - a raw string, not JSON.stringify, since
  // stringify itself can't produce this input.
  it('falls back to flat when a gain overflows to Infinity', async () => {
    getMediaEqualizerBands.mockResolvedValue('[0, 1e400, 0, 0, 0]')
    await expect(useEqualizerQueryFn()()).resolves.toEqual([0, 0, 0, 0, 0])
  })

  it('falls back to flat when a gain is outside the +-12dB range', async () => {
    getMediaEqualizerBands.mockResolvedValue(JSON.stringify([0, 0, 0, 0, 13]))
    await expect(useEqualizerQueryFn()()).resolves.toEqual([0, 0, 0, 0, 0])
  })
})
