import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { addLibrary } from '../database/librariesRepository'
import { registerMediaThumbnailHandlers } from './mediaThumbnailHandlers'

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(() => 'C:\\ArkManagerTest'),
  handle: vi.fn(),
  showOpenDialog: vi.fn(),
}))

const audioCoverMocks = vi.hoisted(() => ({
  getAudioCoverWriteSupport: vi.fn(() => 'supported' as const),
  writeAudioCoverWithBackup: vi.fn(),
}))

const customCoverMocks = vi.hoisted(() => ({
  saveCustomCoverImage: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: electronMocks.getPath },
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
  ipcMain: { handle: electronMocks.handle },
}))

vi.mock('../media/audioCover', () => audioCoverMocks)
vi.mock('../customCover/saveCustomCoverImage', () => customCoverMocks)

type RegisteredHandler = (_event: unknown, payload?: unknown) => unknown

function registeredHandler(channel: string): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  )
  if (!registration) throw new Error(`${channel} handler was not registered`)
  return registration[1] as RegisteredHandler
}

describe('MEDIA_THUMBNAIL_SET_FROM_FILE', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    electronMocks.showOpenDialog.mockReset()
    audioCoverMocks.writeAudioCoverWithBackup.mockReset()
    customCoverMocks.saveCustomCoverImage.mockReset()
    db = createDbClient(':memory:')
    addLibrary(db, 'Music', 'D:\\Music')
    registerMediaThumbnailHandlers(db)
  })

  afterEach(() => {
    db.$client.close()
  })

  it('rejects a destination outside registered libraries and the media folder', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:\\Pictures\\Cover.jpg'],
    })
    await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE)({})

    await expect(
      registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE)({}, {
        filePath: 'C:\\Windows\\Media\\alarm.mp3',
        sourcePath: 'C:\\Pictures\\Cover.jpg',
      })
    ).rejects.toThrow(/authorized/i)
    expect(audioCoverMocks.writeAudioCoverWithBackup).not.toHaveBeenCalled()
    expect(customCoverMocks.saveCustomCoverImage).not.toHaveBeenCalled()
  })
})
