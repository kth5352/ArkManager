// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { useGameCoverImage } from './metadataService'
import type { GameCode } from '../../shared/types/scanner'

const getCoverImageMock = vi.fn<(code: GameCode) => Promise<string | null>>()

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  getCoverImageMock.mockReset()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { api: { metadata: { getCoverImage: getCoverImageMock } } },
  })
})

const code: GameCode = { type: 'RJ', value: 'RJ01234567' }

// TanStack Query's fetch -> cache-update -> notify -> React-rerender
// pipeline hops through several real event-loop turns (the mock's own
// resolved promise, then the query's internal state machine, then its
// notifyManager, then React's scheduler) - draining microtasks alone
// wasn't enough to observe the result land in a rendered component; a real
// macrotask tick between checks is what actually lets every stage settle.
async function flushQuery(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
}

function CoverProbe({ onSrc }: { onSrc: (src: string | null | undefined) => void }) {
  const { data } = useGameCoverImage(code)
  onSrc(data)
  return null
}

async function mount(
  queryClient: QueryClient,
  onSrc: (src: string | null | undefined) => void
): Promise<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client: queryClient }, createElement(CoverProbe, { onSrc }))
    )
  })
  await flushQuery()
  return { root, container }
}

async function unmount(root: ReturnType<typeof createRoot>, container: HTMLDivElement): Promise<void> {
  await act(async () => root.unmount())
  container.remove()
}

it('does not re-fetch on remount within staleTime, but does after an exact invalidation, and reflects the new value', async () => {
  getCoverImageMock.mockResolvedValue('data:image/webp;base64,FIRST')
  const queryClient = new QueryClient()
  let lastSrc: string | null | undefined

  // Mount -> GET once.
  let { root, container } = await mount(queryClient, (src) => (lastSrc = src))
  expect(getCoverImageMock).toHaveBeenCalledTimes(1)
  expect(lastSrc).toBe('data:image/webp;base64,FIRST')
  await unmount(root, container)

  // Remount (react-window-style recycle) -> still once, staleTime not elapsed.
  ;({ root, container } = await mount(queryClient, (src) => (lastSrc = src)))
  expect(getCoverImageMock).toHaveBeenCalledTimes(1)
  expect(lastSrc).toBe('data:image/webp;base64,FIRST')

  // Exact invalidation (what a crawl/cache-clear/custom-cover mutation does
  // via the shared ['metadata'] prefix) -> re-fetches, and the new value
  // actually reaches the consumer.
  getCoverImageMock.mockResolvedValue('data:image/webp;base64,SECOND')
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ['metadata', 'cover-image', code.value], exact: true })
  })
  await flushQuery()
  expect(getCoverImageMock).toHaveBeenCalledTimes(2)
  expect(lastSrc).toBe('data:image/webp;base64,SECOND')

  await unmount(root, container)
})

it('caches a null (no cover found) result the same way, and a later crawl-triggered invalidation surfaces a real image', async () => {
  getCoverImageMock.mockResolvedValue(null)
  const queryClient = new QueryClient()
  let lastSrc: string | null | undefined

  const { root, container } = await mount(queryClient, (src) => (lastSrc = src))
  expect(getCoverImageMock).toHaveBeenCalledTimes(1)
  expect(lastSrc).toBeNull()

  // Simulates useCrawlGameMetadata's onSettled: invalidates the whole
  // 'metadata' prefix, which this query's key falls under, after the crawl
  // found real art this time.
  getCoverImageMock.mockResolvedValue('data:image/webp;base64,CRAWLED')
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ['metadata'] })
  })
  await flushQuery()
  expect(getCoverImageMock).toHaveBeenCalledTimes(2)
  expect(lastSrc).toBe('data:image/webp;base64,CRAWLED')

  await unmount(root, container)
})
