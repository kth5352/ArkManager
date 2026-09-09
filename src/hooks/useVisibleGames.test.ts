// @vitest-environment jsdom
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useVisibleGames } from './useVisibleGames'
import type { ScannedEntry } from '../../shared/types/scanner'

const fixture = vi.hoisted(() => ({
  games: [] as ScannedEntry[],
  excludedEntries: [] as { path: string }[],
  hiddenLibraryIds: new Set<string>(),
}))
vi.mock('../services/useGames', () => ({
  useGames: () => ({ data: fixture.games, isLoading: false, isError: false }),
}))
// A stable array reference, not a fresh `[]` per call - matches how a real
// TanStack Query result behaves (the same cached `data` object reference is
// returned across renders as long as the cache entry itself hasn't
// changed). A mock that returned a NEW array every call would make
// `libraries` itself referentially unstable and falsely fail the
// reference-stability test below for a reason that has nothing to do with
// useVisibleGames's own memoization.
const stableEmptyLibraries: unknown[] = []
vi.mock('../services/librariesService', () => ({
  useLibraries: () => ({ data: stableEmptyLibraries }),
}))
vi.mock('../services/excludedEntriesService', () => ({
  useExcludedEntries: () => ({ data: fixture.excludedEntries }),
}))
vi.mock('../stores/libraryVisibilityStore', () => ({
  useLibraryVisibilityStore: (selector: (s: { hiddenLibraryIds: Set<string> }) => unknown) =>
    selector({ hiddenLibraryIds: fixture.hiddenLibraryIds }),
}))

// Lowercase paths, matching normalizeLibraryPath's own canonical form -
// isEntryExcluded normalizes the entry's own path before comparing it
// against excludedPaths, but useVisibleGames builds that Set from
// excludedEntries' paths AS-IS (a pre-existing behavior, not something P1
// touches) - using already-normalized paths here avoids the test
// exercising that unrelated mismatch.
const game1: ScannedEntry = {
  name: 'Game 1',
  path: 'd:\\games\\game 1',
  kind: 'folder',
  mtimeMs: 0,
  size: 0,
  code: null,
}
const game2: ScannedEntry = {
  name: 'Game 2',
  path: 'd:\\games\\game 2',
  kind: 'folder',
  mtimeMs: 0,
  size: 0,
  code: null,
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.games = [game1, game2]
  fixture.excludedEntries = []
  fixture.hiddenLibraryIds = new Set()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

it('keeps the same data array reference across a re-render caused by unrelated state', async () => {
  const seen: unknown[] = []
  let forceRerender: (() => void) | null = null

  function Harness() {
    const [, setTick] = useState(0)
    forceRerender = () => setTick((t) => t + 1)
    const { data } = useVisibleGames()
    seen.push(data)
    return null
  }

  await act(async () => {
    root.render(createElement(Harness))
  })
  await act(async () => forceRerender!())
  await act(async () => forceRerender!())

  expect(seen).toHaveLength(3)
  expect(seen[0]).toBe(seen[1])
  expect(seen[1]).toBe(seen[2])
})

it('produces a new data array when games actually changes', async () => {
  const seen: unknown[] = []
  function Harness() {
    const { data } = useVisibleGames()
    seen.push(data)
    return null
  }

  await act(async () => {
    root.render(createElement(Harness))
  })
  fixture.games = [game1, game2, { ...game1, name: 'Game 3', path: 'D:\\Games\\Game 3' }]
  await act(async () => {
    root.render(createElement(Harness))
  })

  expect(seen[0]).not.toBe(seen[1])
  expect((seen[1] as ScannedEntry[]).length).toBe(3)
})

it('produces a new data array when excludedEntries actually changes, and filters accordingly', async () => {
  const seen: (ScannedEntry[] | undefined)[] = []
  function Harness() {
    const { data } = useVisibleGames()
    seen.push(data)
    return null
  }

  await act(async () => {
    root.render(createElement(Harness))
  })
  fixture.excludedEntries = [{ path: game1.path }]
  await act(async () => {
    root.render(createElement(Harness))
  })

  expect(seen[0]).not.toBe(seen[1])
  expect(seen[1]?.map((e) => e.path)).toEqual([game2.path])
})

it('produces a new data array when hiddenLibraryIds actually changes', async () => {
  const seen: unknown[] = []
  function Harness() {
    const { data } = useVisibleGames()
    seen.push(data)
    return null
  }

  await act(async () => {
    root.render(createElement(Harness))
  })
  fixture.hiddenLibraryIds = new Set(['some-library-id'])
  await act(async () => {
    root.render(createElement(Harness))
  })

  expect(seen[0]).not.toBe(seen[1])
})
