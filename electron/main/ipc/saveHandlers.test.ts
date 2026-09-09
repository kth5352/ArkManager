import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { getGameUserData, setSavePath } from '../database/gameUserDataRepository'
import { registerSaveHandlers } from './saveHandlers'

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  showOpenDialog: vi.fn(),
  getPath: vi.fn(() => 'C:\\ArkManagerTest'),
}))

vi.mock('electron', () => ({
  app: { getPath: electronMocks.getPath },
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
  ipcMain: { handle: electronMocks.handle },
  shell: { showItemInFolder: vi.fn() },
}))

type RegisteredHandler = (_event: unknown, payload?: unknown) => unknown

function registeredHandler(channel: string): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  )
  if (!registration) throw new Error(`${channel} handler was not registered`)
  return registration[1] as RegisteredHandler
}

// Lowercase, matching normalizeLibraryPath's own canonical form - the
// stored lookup key is normalized on write (see resolveGameEntryKey), so a
// differently-cased lookup here would silently miss the row.
const identifier = { code: null, path: 'd:\\games\\mygame' }

describe('SAVE_SET_PATH pinning', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    electronMocks.showOpenDialog.mockReset()
    db = createDbClient(':memory:')
    registerSaveHandlers(db)
  })

  afterEach(() => {
    db.$client.close()
  })

  it('accepts a path that was actually just returned by the folder picker', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:\\Users\\external\\AppData\\MyGameSave'],
    })
    const picked = await registeredHandler(IPC_CHANNELS.SAVE_PICK_FOLDER)({}, { startPath: null })
    expect(picked).toBe('C:\\Users\\external\\AppData\\MyGameSave')

    await registeredHandler(IPC_CHANNELS.SAVE_SET_PATH)(
      {},
      { identifier, savePath: 'C:\\Users\\external\\AppData\\MyGameSave' }
    )

    expect(getGameUserData(db, 'd:\\games\\mygame')?.savePath).toBe(
      'C:\\Users\\external\\AppData\\MyGameSave'
    )
  })

  it('rejects a savePath that was never returned by the folder picker', () => {
    // No SAVE_PICK_FOLDER call at all - a compromised or buggy renderer
    // calling SAVE_SET_PATH directly with an arbitrary path (e.g. a system
    // folder) must not be able to set it, since SAVE_RESTORE_SNAPSHOT would
    // later write snapshot content into whatever this path is.
    //
    // SAVE_SET_PATH's handler throws synchronously (before any await), so
    // the rejection must be asserted via a wrapping function, not `.rejects`
    // (which requires the call itself to not throw but return a rejecting
    // promise).
    expect(() =>
      registeredHandler(IPC_CHANNELS.SAVE_SET_PATH)(
        {},
        { identifier, savePath: 'C:\\Windows\\System32' }
      )
    ).toThrow(/선택된 폴더가 아닙니다/)

    expect(getGameUserData(db, 'd:\\games\\mygame')?.savePath ?? null).toBeNull()
  })

  it('is one-shot - a second SET_PATH call with the same picked path is rejected', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:\\Users\\external\\AppData\\MyGameSave'],
    })
    await registeredHandler(IPC_CHANNELS.SAVE_PICK_FOLDER)({}, { startPath: null })
    await registeredHandler(IPC_CHANNELS.SAVE_SET_PATH)(
      {},
      { identifier, savePath: 'C:\\Users\\external\\AppData\\MyGameSave' }
    )

    expect(() =>
      registeredHandler(IPC_CHANNELS.SAVE_SET_PATH)(
        {},
        { identifier, savePath: 'C:\\Users\\external\\AppData\\MyGameSave' }
      )
    ).toThrow(/선택된 폴더가 아닙니다/)
  })
})

describe('SAVE_DIFF missing-root policy', () => {
  let db: AppDatabase
  let userDataRoot: string
  const timestamp = '2026-01-01T00-00-00-000Z'

  beforeEach(async () => {
    electronMocks.handle.mockClear()
    userDataRoot = await mkdtemp(join(tmpdir(), 'ark-manager-save-diff-'))
    electronMocks.getPath.mockReturnValue(userDataRoot)
    db = createDbClient(':memory:')
    registerSaveHandlers(db)
  })

  afterEach(async () => {
    db.$client.close()
    await rm(userDataRoot, { recursive: true, force: true })
  })

  async function diff(timestampArg: string | null, mode: 'save' | 'restore') {
    return registeredHandler(IPC_CHANNELS.SAVE_DIFF)(
      {},
      { identifier, timestamp: timestampArg, mode }
    )
  }

  it('rejects a save-mode preview when the live save folder does not exist', async () => {
    setSavePath(db, 'd:\\games\\mygame', 'path', join(userDataRoot, 'missing-live'))

    await expect(diff(null, 'save')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('allows a restore-mode preview when the live save folder does not exist yet', async () => {
    // Build the snapshot directory via the same key-to-dir-name helper the
    // handler itself uses, rather than guessing its exact output.
    const { keyToSafeDirName } = await import('../save/keyToSafeDirName')
    const realSnapshotDir = join(
      userDataRoot,
      'saves',
      keyToSafeDirName('d:\\games\\mygame'),
      timestamp
    )
    await mkdir(realSnapshotDir, { recursive: true })
    await writeFile(join(realSnapshotDir, 'save1.dat'), 'from snapshot')
    setSavePath(db, 'd:\\games\\mygame', 'path', join(userDataRoot, 'missing-live'))

    const result = await diff(timestamp, 'restore')

    // Raw helper-level status is left(snapshot)->right(live): present in
    // the snapshot, absent from the (missing) live folder, is 'removed'
    // from this comparison's point of view. The UI layer inverts this for
    // display (see SaveManagerDialog.tsx's displayStatus) since a restore
    // ADDS the file back, but that inversion isn't this handler's concern.
    expect(result).toEqual([{ relativePath: 'save1.dat', status: 'removed' }])
  })

  it('rejects a restore-mode preview when the explicitly chosen snapshot is missing', async () => {
    const liveDir = join(userDataRoot, 'live')
    await mkdir(liveDir, { recursive: true })
    setSavePath(db, 'd:\\games\\mygame', 'path', liveDir)

    // No snapshot directory was ever created for this timestamp - unlike a
    // null timestamp (no prior snapshot to compare, normal), an explicitly
    // named snapshot going missing is a real error.
    await expect(diff(timestamp, 'restore')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('defaults a legacy payload with no mode field to save-mode policy', async () => {
    // SaveDiffRequestSchema.default('save') is what makes this channel
    // backward-compatible - a payload from before `mode` existed must still
    // get the strict (save-mode) behavior, not silently become permissive.
    setSavePath(db, 'd:\\games\\mygame', 'path', join(userDataRoot, 'missing-live'))

    await expect(
      registeredHandler(IPC_CHANNELS.SAVE_DIFF)({}, { identifier, timestamp: null })
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
