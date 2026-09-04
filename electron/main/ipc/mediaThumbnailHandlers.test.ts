import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { addLibrary } from '../database/librariesRepository'
import { createMediaPlaylist, setMediaPlaylistTracks } from '../database/mediaPlaylistsRepository'
import { toggleTrackLike } from '../database/mediaTrackLikesRepository'
import { getMediaThumbnailOverride } from '../database/mediaThumbnailOverridesRepository'
import { AudioCoverRestoreError } from '../media/audioCover'
import { keyToSafeDirName } from '../save/keyToSafeDirName'
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

// mediaThumbnailCacheDir() itself is genuinely called (not mocked away) by
// the new cache-invalidation test below, but it normally resolves under
// electronMocks.getPath's fake 'C:\ArkManagerTest' - not a real writable
// path in a test environment. Overridden to a real temp directory ONLY for
// that one test (see its own beforeEach/afterEach), real implementation
// everywhere else.
const mediaThumbnailProtocolMocks = vi.hoisted(() => ({
  mediaThumbnailCacheDir: vi.fn<() => string>(),
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
vi.mock('../mediaThumbnailProtocol', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mediaThumbnailProtocol')>()),
  mediaThumbnailCacheDir: mediaThumbnailProtocolMocks.mediaThumbnailCacheDir,
}))

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
    mediaThumbnailProtocolMocks.mediaThumbnailCacheDir.mockReset()
    mediaThumbnailProtocolMocks.mediaThumbnailCacheDir.mockReturnValue('C:\\ArkManagerTest\\cache')
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

  it('invalidates a stale cached auto-extraction thumbnail when a cover is embedded', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'ark-manager-thumbnail-cache-'))
    mediaThumbnailProtocolMocks.mediaThumbnailCacheDir.mockReturnValue(cacheDir)
    const directory = await mkdtemp(join(tmpdir(), 'ark-manager-thumbnail-'))
    const sourcePath = join(directory, 'cover.jpg')
    const filePath = 'D:\\Music\\Song.mp3'
    // Simulates a thumbnail already cached for this track from BEFORE the
    // embed - e.g. resolveMediaThumbnail's directory-image tier, which
    // caches one for every track in a folder containing a cover.jpg, not
    // just ones the user has individually edited.
    const cachedThumbnailPath = join(cacheDir, `${keyToSafeDirName(filePath)}.webp`)
    try {
      await writeFile(sourcePath, Buffer.from('image'))
      await mkdir(cacheDir, { recursive: true })
      await writeFile(cachedThumbnailPath, Buffer.from('stale cached thumbnail'))
      electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourcePath] })
      audioCoverMocks.writeAudioCoverWithBackup.mockResolvedValue({ ok: true, mode: 'embedded' })

      await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE)({})
      const result = await registeredHandler(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE)(
        {},
        { filePath, sourcePath }
      )

      expect(result).toEqual({ mode: 'embedded', warning: undefined })
      // The stale cache entry must be gone - the next request has to
      // re-extract fresh art from the just-updated file, not keep serving
      // the pre-embed image.
      await expect(access(cachedThumbnailPath)).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
      await rm(cacheDir, { recursive: true, force: true })
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
