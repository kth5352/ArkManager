import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { addLibrary } from '../database/librariesRepository'
import { createMediaPlaylist, setMediaPlaylistTracks } from '../database/mediaPlaylistsRepository'
import { toggleTrackLike } from '../database/mediaTrackLikesRepository'
import {
  getMediaThumbnailOverride,
  setMediaThumbnailOverride,
} from '../database/mediaThumbnailOverridesRepository'
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

const artworkStub = {
  cache: { trackGeneration: () => 0, workCoverGeneration: () => 1 },
  resolve: vi.fn(async () => null),
  invalidateTrack: vi.fn(async () => undefined),
  bumpWorkCover: vi.fn(async () => undefined),
} as unknown as import('../media/mediaArtworkServices').MediaArtworkServices

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
    registerMediaThumbnailHandlers(db, artworkStub)
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

  it('accepts a destination outside every library that is saved in a playlist', async () => {
    createMediaPlaylist(db, 'p1', 'My Playlist')
    setMediaPlaylistTracks(db, 'p1', [{ path: 'C:\\Users\\external\\clip.mp4', name: 'clip.mp4' }])
    const directory = await mkdtemp(join(tmpdir(), 'ark-manager-thumbnail-'))
    const sourcePath = join(directory, 'cover.jpg')
    try {
      await writeFile(sourcePath, Buffer.from('image'))
      electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
      customCoverMocks.saveCustomCoverImage.mockResolvedValue(
        'C:\\ArkManagerTest\\cache\\clip.webp'
      )

      await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE)({})
      const result = await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE)(
        {},
        { filePath: 'C:\\Users\\external\\clip.mp4', sourcePath }
      )

      expect(result).toEqual({ mode: 'override', warning: undefined })
      expect(audioCoverMocks.writeAudioCoverWithBackup).not.toHaveBeenCalled()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('accepts a destination outside every library that is liked', async () => {
    toggleTrackLike(db, 'C:\\Users\\external\\liked.mp4', 'liked.mp4')
    const directory = await mkdtemp(join(tmpdir(), 'ark-manager-thumbnail-'))
    const sourcePath = join(directory, 'cover.jpg')
    try {
      await writeFile(sourcePath, Buffer.from('image'))
      electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
      customCoverMocks.saveCustomCoverImage.mockResolvedValue(
        'C:\\ArkManagerTest\\cache\\liked.webp'
      )

      await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE)({})
      const result = await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE)(
        {},
        { filePath: 'C:\\Users\\external\\liked.mp4', sourcePath }
      )

      expect(result).toEqual({ mode: 'override', warning: undefined })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
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

  it('invalidates the track artwork (and notifies) when a cover is embedded', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ark-manager-thumbnail-'))
    const sourcePath = join(directory, 'cover.jpg')
    const filePath = 'D:\\Music\\Song.mp3'
    try {
      await writeFile(sourcePath, Buffer.from('image'))
      electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
      audioCoverMocks.writeAudioCoverWithBackup.mockResolvedValue({ ok: true, mode: 'embedded' })
      vi.mocked(artworkStub.invalidateTrack).mockClear()

      await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE)({})
      const result = await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE)(
        {},
        { filePath, sourcePath }
      )

      expect(result).toEqual({ mode: 'embedded', warning: undefined })
      expect(artworkStub.invalidateTrack).toHaveBeenCalledWith(filePath)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('invalidates the track artwork when a user override thumbnail is set', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ark-manager-thumbnail-'))
    const sourcePath = join(directory, 'cover.jpg')
    const filePath = 'D:\\Music\\Song.wav'
    try {
      await writeFile(sourcePath, Buffer.from('image'))
      electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
      customCoverMocks.saveCustomCoverImage.mockResolvedValue(join(directory, 'key.webp'))
      vi.mocked(artworkStub.invalidateTrack).mockClear()

      await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE)({})
      await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE)(
        {},
        { filePath, sourcePath }
      )

      expect(artworkStub.invalidateTrack).toHaveBeenCalledWith(filePath)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('MEDIA_GET_COVER_INFO returns the same no-cover shape outside authorized roots', async () => {
    const outside = await registeredHandler(IPC_CHANNELS.MEDIA_GET_COVER_INFO)(
      {},
      { filePath: 'C:\\Windows\\a.mp3' }
    )
    const trusted = await registeredHandler(IPC_CHANNELS.MEDIA_GET_COVER_INFO)(
      {},
      { filePath: 'D:\\Music\\Song.mp3' }
    )
    expect(outside).toEqual(trusted)
    expect(outside).toEqual({ hasCover: false, accent: null, aspectRatio: null, version: '0-1' })
  })

  it('MEDIA_GET_COVER_INFO reports an override-only track and prefers it over a resolved cover', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ark-manager-override-info-'))
    const overridePath = join(directory, 'key.webp')
    try {
      await sharp({ create: { width: 40, height: 20, channels: 3, background: '#cc2222' } })
        .webp()
        .toFile(overridePath)
      setMediaThumbnailOverride(db, 'D:\\Music\\Song.mp3', overridePath)
      vi.mocked(artworkStub.resolve).mockResolvedValueOnce({
        thumb: 't',
        cover: 'c',
        info: { source: 'embedded', workCoverGeneration: 1, accent: '#00ff00', aspectRatio: 1 },
      })

      const info = (await registeredHandler(IPC_CHANNELS.MEDIA_GET_COVER_INFO)(
        {},
        { filePath: 'D:\\Music\\Song.mp3' }
      )) as { hasCover: boolean; accent: string; aspectRatio: number }

      expect(info.hasCover).toBe(true)
      expect(info.accent).toMatch(/^#[0-9a-f]{6}$/)
      expect(info.accent).not.toBe('#00ff00')
      expect(info.aspectRatio).toBeCloseTo(2, 5)
      // The override short-circuits resolve; clear the unconsumed Once value.
    } finally {
      vi.mocked(artworkStub.resolve).mockReset()
      vi.mocked(artworkStub.resolve).mockResolvedValue(null)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('MEDIA_GET_COVER_INFO returns version and no cover when nothing resolves', async () => {
    const info = await registeredHandler(IPC_CHANNELS.MEDIA_GET_COVER_INFO)(
      {},
      { filePath: 'D:\\Music\\Song.mp3' }
    )
    expect(info).toEqual({ hasCover: false, accent: null, aspectRatio: null, version: '0-1' })
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
