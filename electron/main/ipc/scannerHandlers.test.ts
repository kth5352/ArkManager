import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { registerScannerHandlers } from './scannerHandlers'

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: electronMocks.handle },
}))

type RegisteredHandler = (_event: unknown, payload?: unknown) => unknown

function registeredHandler(channel: string): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  )
  if (!registration) throw new Error(`${channel} handler was not registered`)
  return registration[1] as RegisteredHandler
}

function fakeEvent() {
  return { sender: { send: vi.fn() } }
}

describe('SCANNER_SCAN_RECURSIVE partial-failure policy (D3)', () => {
  let db: AppDatabase
  let goodDir: string
  const missingPath = join(tmpdir(), 'ark-manager-scanner-handlers-missing-does-not-exist')

  beforeEach(async () => {
    electronMocks.handle.mockClear()
    db = createDbClient(':memory:')
    goodDir = await mkdtemp(join(tmpdir(), 'ark-manager-scanner-handlers-'))
    await mkdir(join(goodDir, 'subfolder'))
    registerScannerHandlers(db)
  })

  afterEach(async () => {
    db.$client.close()
    await rm(goodDir, { recursive: true, force: true })
  })

  // This is the plan's D3 reproduction: a registered-library Gallery scan is
  // supposed to tolerate one offline/missing library and still return
  // results for the rest (see the 2+-path branch below), regardless of how
  // many libraries happen to be registered. But scannerHandlers.ts currently
  // decides that policy from libraryPaths.length alone - and Explorer's own
  // "search from here down" request (useFolderScanRecursive) also always
  // sends exactly one path. A user with exactly ONE registered library hits
  // the identical code path as Explorer, so the whole Gallery scan throws
  // instead of degrading to an empty (partial) result - a real, reachable
  // policy inconsistency, not just a theoretical one.
  it('lets a genuinely single-path (Explorer) request throw on a missing folder', async () => {
    const handler = registeredHandler(IPC_CHANNELS.SCANNER_SCAN_RECURSIVE)

    await expect(handler(fakeEvent(), { libraryPaths: [missingPath] })).rejects.toThrow()
  })

  it('tolerates one offline library among several registered libraries, returning partial results', async () => {
    const handler = registeredHandler(IPC_CHANNELS.SCANNER_SCAN_RECURSIVE)

    const result = await handler(fakeEvent(), { libraryPaths: [goodDir, missingPath] })

    expect(result).toEqual([])
  })

  it('tolerates a single offline library when Gallery has exactly one registered library, matching the multi-library policy', async () => {
    const handler = registeredHandler(IPC_CHANNELS.SCANNER_SCAN_RECURSIVE)

    const result = await handler(fakeEvent(), {
      libraryPaths: [missingPath],
      allowPartial: true,
    })

    expect(result).toEqual([])
  })
})
