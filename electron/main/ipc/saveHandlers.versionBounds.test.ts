import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { addLibrary } from '../database/librariesRepository'
import { registerSaveHandlers } from './saveHandlers'

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
}))
const detectGameVersionMock = vi.hoisted(() => vi.fn(async () => '1.0.0'))

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\ArkManagerTest' },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: electronMocks.handle },
  shell: { showItemInFolder: vi.fn() },
}))
vi.mock('../save/detectGameVersion', () => ({ detectGameVersion: detectGameVersionMock }))

function handler(channel: string) {
  const registration = electronMocks.handle.mock.calls.find(([c]) => c === channel)
  if (!registration) throw new Error(`${channel} not registered`)
  return registration[1] as (_event: unknown, payload: unknown) => Promise<unknown>
}

const TIMESTAMP = '2026-01-02T03-04-05-678Z'

// detectGameVersion lists every .exe in identifier.path and runs PowerShell
// to read their version resources. identifier.path comes straight from the
// renderer, so it is now only used when it lies inside a registered library.
describe('SAVE_CHECK_VERSION_MISMATCH version detection bounds', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    detectGameVersionMock.mockClear()
    db = createDbClient(':memory:')
    addLibrary(db, 'Lib', 'D:\\Games')
    registerSaveHandlers(db)
  })

  afterEach(() => {
    db.$client.close()
  })

  it('detects the version for an entry inside a library', async () => {
    const result = await handler(IPC_CHANNELS.SAVE_CHECK_VERSION_MISMATCH)(
      {},
      { identifier: { code: null, path: 'D:\\Games\\MyGame' }, timestamp: TIMESTAMP }
    )
    expect(detectGameVersionMock).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ currentVersion: '1.0.0' })
  })

  it('does not probe a folder outside every library', async () => {
    const result = await handler(IPC_CHANNELS.SAVE_CHECK_VERSION_MISMATCH)(
      {},
      { identifier: { code: null, path: 'C:\\Windows\\System32' }, timestamp: TIMESTAMP }
    )
    expect(detectGameVersionMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({ currentVersion: null })
  })
})
