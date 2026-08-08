import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { addLibrary } from '../database/librariesRepository'
import { getMediaThumbnailOverride } from '../database/mediaThumbnailOverridesRepository'
import { AudioCoverRestoreError } from '../media/audioCover'
import { registerMediaThumbnailHandlers } from './mediaThumbnailHandlers'

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(() => 'C:\\ArkManagerTest'),
  handle: vi.fn(),
  showOpenDialog: vi.fn(),
}))

const audioCoverMocks = vi.hoisted(() => ({
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

vi.mock('../media/audioCover', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media/audioCover')>()),
  writeAudioCoverWithBackup: audioCoverMocks.writeAudioCoverWithBackup,
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
      registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE)(
        {},
        {
          filePath: 'C:\\Windows\\Media\\alarm.mp3',
          sourcePath: 'C:\\Pictures\\Cover.jpg',
        }
      )
    ).rejects.toThrow(/authorized/i)
    expect(audioCoverMocks.writeAudioCoverWithBackup).not.toHaveBeenCalled()
    expect(customCoverMocks.saveCustomCoverImage).not.toHaveBeenCalled()
  })

  it('stores a WAV cover as an app-local override without attempting embedding', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ark-manager-thumbnail-'))
    const sourcePath = join(directory, 'cover.jpg')
    try {
      await writeFile(sourcePath, Buffer.from('image'))
      electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
      customCoverMocks.saveCustomCoverImage.mockResolvedValue(
        'C:\\ArkManagerTest\\cache\\cover.webp'
      )
      audioCoverMocks.writeAudioCoverWithBackup.mockResolvedValue({ ok: true, mode: 'embedded' })

      await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE)({})
      const result = await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE)(
        {},
        {
          filePath: 'D:\\Music\\Song.wav',
          sourcePath,
        }
      )

      expect(result).toEqual({ mode: 'override', warning: undefined })
      expect(audioCoverMocks.writeAudioCoverWithBackup).not.toHaveBeenCalled()
      expect(getMediaThumbnailOverride(db, 'D:\\Music\\Song.wav')).toBe(
        'C:\\ArkManagerTest\\cache\\cover.webp'
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('sanitizes a fatal restore failure before rejecting the renderer request', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ark-manager-thumbnail-'))
    const sourcePath = join(directory, 'cover.jpg')
    const restoreError = new AudioCoverRestoreError(
      new Error('ffmpeg -i D:\\private\\song.mp3 stderr: disk write failed')
    )
    try {
      await writeFile(sourcePath, Buffer.from('image'))
      electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
      audioCoverMocks.writeAudioCoverWithBackup.mockRejectedValue(restoreError)

      await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE)({})
      const error = await Promise.resolve(
        registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE)(
          {},
          {
            filePath: 'D:\\Music\\Song.mp3',
            sourcePath,
          }
        )
      ).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBe(restoreError)
      expect((error as Error).message).toBe(
        'Audio cover update failed; the recovery backup was retained.'
      )
      expect((error as Error).message).not.toContain('ffmpeg')
      expect((error as Error).message).not.toContain('stderr')
      expect(customCoverMocks.saveCustomCoverImage).not.toHaveBeenCalled()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
