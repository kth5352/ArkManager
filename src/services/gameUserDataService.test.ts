// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useCustomCoverImage, useSetCustomCoverFromFile } from './gameUserDataService'
import type { ScannedEntry } from '../../shared/types/scanner'

const apiMocks = vi.hoisted(() => ({
  getCustomCoverImage: vi.fn<() => Promise<string | null>>(),
  setCustomCoverFromFile: vi.fn<() => Promise<void>>(),
}))

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  apiMocks.getCustomCoverImage.mockReset()
  apiMocks.setCustomCoverFromFile.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        gameUserData: {
          getCustomCoverImage: apiMocks.getCustomCoverImage,
          setCustomCoverFromFile: apiMocks.setCustomCoverFromFile,
        },
      },
    },
  })
})

const entry: Pick<ScannedEntry, 'code' | 'path'> = { code: null, path: 'C:/fixture/game' }

// See metadataService.test.ts's identical helper for why a real macrotask
// tick (not just microtasks) is needed to observe a query's result land in
// a rendered component.
async function flushQuery(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
}

function CoverProbe({ onSrc }: { onSrc: (src: string | null | undefined) => void }) {
  const { data } = useCustomCoverImage(entry)
  onSrc(data)
  return null
}

function SetterProbe({ onMutate }: { onMutate: (mutate: () => void) => void }) {
  const setFromFile = useSetCustomCoverFromFile()
  onMutate(() => setFromFile.mutate({ entry, sourcePath: 'C:/fixture/new-cover.png' }))
  return null
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

it('does not re-fetch on remount within staleTime, and a custom-cover mutation success invalidates and refreshes it', async () => {
  apiMocks.getCustomCoverImage.mockResolvedValue('data:image/webp;base64,ORIGINAL')
  const queryClient = new QueryClient()
  let lastSrc: string | null | undefined
  let triggerSet: (() => void) | null = null

  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(CoverProbe, { onSrc: (src) => (lastSrc = src) }),
        createElement(SetterProbe, { onMutate: (m) => (triggerSet = m) })
      )
    )
  })
  await flushQuery()
  expect(apiMocks.getCustomCoverImage).toHaveBeenCalledTimes(1)
  expect(lastSrc).toBe('data:image/webp;base64,ORIGINAL')

  // Unmount + remount the cover consumer only (simulating react-window
  // recycling), setter probe stays mounted throughout.
  await act(async () => root.unmount())
  root = createRoot(container)
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(CoverProbe, { onSrc: (src) => (lastSrc = src) })
      )
    )
  })
  await flushQuery()
  expect(apiMocks.getCustomCoverImage).toHaveBeenCalledTimes(1)

  // Now mount the setter and trigger the mutation - onSuccess must
  // invalidate this entry's customCoverImageQueryKey (see
  // invalidateCustomCover) and the query must refetch and surface the new
  // value, not keep serving the stale cached one.
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(CoverProbe, { onSrc: (src) => (lastSrc = src) }),
        createElement(SetterProbe, { onMutate: (m) => (triggerSet = m) })
      )
    )
  })
  await flushQuery()
  apiMocks.getCustomCoverImage.mockResolvedValue('data:image/webp;base64,UPDATED')
  await act(async () => {
    triggerSet!()
  })
  await flushQuery()

  expect(apiMocks.setCustomCoverFromFile).toHaveBeenCalledTimes(1)
  expect(apiMocks.getCustomCoverImage).toHaveBeenCalledTimes(2)
  expect(lastSrc).toBe('data:image/webp;base64,UPDATED')
})
