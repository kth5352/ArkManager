import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { createMediaPlaylist, getPlaylistCoverPath } from '../database/mediaPlaylistsRepository'
import { registerMediaPlaylistCoverHandlers } from './mediaPlaylistCoverHandlers'

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(() => 'C:\\ArkManagerTest'),
  handle: vi.fn(),
  showOpenDialog: vi.fn(),
}))

const customCoverMocks = vi.hoisted(() => ({
  saveCustomCoverImage: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: electronMocks.getPath },
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
  ipcMain: { handle: electronMocks.handle },
}))

vi.mock('../customCover/saveCustomCoverImage', () => customCoverMocks)

type RegisteredHandler = (_event: unknown, payload?: unknown) => unknown

function registeredHandler(channel: string): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  )
  if (!registration) throw new Error(`${channel} handler was not registered`)
  return registration[1] as RegisteredHandler
}

describe('MEDIA_PLAYLIST_SET_COVER / MEDIA_PLAYLIST_CLEAR_COVER', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    electronMocks.showOpenDialog.mockReset()
    customCoverMocks.saveCustomCoverImage.mockReset()
    db = createDbClient(':memory:')
    createMediaPlaylist(db, 'pl-1', 'Test Playlist')
    registerMediaPlaylistCoverHandlers(db)
  })

  afterEach(() => {
    db.$client.close()
  })

  it('rejects a sourcePath that was not just returned by the picker', async () => {
    await expect(
      registeredHandler(IPC_CHANNELS.MEDIA_PLAYLIST_SET_COVER)(
        {},
        { playlistId: 'pl-1', sourcePath: 'C:\\Pictures\\Cover.jpg' }
      )
    ).rejects.toThrow(/선택된 파일이 아닙니다/)
    expect(customCoverMocks.saveCustomCoverImage).not.toHaveBeenCalled()
  })

  it('saves the picked file and stores its cached path on the playlist', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ark-manager-playlist-cover-'))
    const sourcePath = join(directory, 'cover.jpg')
    try {
      await writeFile(sourcePath, Buffer.from('image'))
      electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
      customCoverMocks.saveCustomCoverImage.mockResolvedValue(
        'C:\\ArkManagerTest\\cache\\playlist-covers\\pl-1.webp'
      )

      await registeredHandler(IPC_CHANNELS.MEDIA_PLAYLIST_COVER_PICK_FILE)({})
      const result = await registeredHandler(IPC_CHANNELS.MEDIA_PLAYLIST_SET_COVER)(
        {},
        { playlistId: 'pl-1', sourcePath }
      )

      expect(result).toBe('C:\\ArkManagerTest\\cache\\playlist-covers\\pl-1.webp')
      expect(getPlaylistCoverPath(db, 'pl-1')).toBe(
        'C:\\ArkManagerTest\\cache\\playlist-covers\\pl-1.webp'
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('clears a previously-set cover', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ark-manager-playlist-cover-'))
    const sourcePath = join(directory, 'cover.jpg')
    try {
      await writeFile(sourcePath, Buffer.from('image'))
      electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
      customCoverMocks.saveCustomCoverImage.mockResolvedValue(
        'C:\\ArkManagerTest\\cache\\playlist-covers\\pl-1.webp'
      )
      await registeredHandler(IPC_CHANNELS.MEDIA_PLAYLIST_COVER_PICK_FILE)({})
      await registeredHandler(IPC_CHANNELS.MEDIA_PLAYLIST_SET_COVER)(
        {},
        { playlistId: 'pl-1', sourcePath }
      )

      await registeredHandler(IPC_CHANNELS.MEDIA_PLAYLIST_CLEAR_COVER)({}, { playlistId: 'pl-1' })

      expect(getPlaylistCoverPath(db, 'pl-1')).toBeNull()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
