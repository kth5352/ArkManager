import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC_CHANNELS, type MediaCoverInfo } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { addLibrary } from '../database/librariesRepository'
import { createArtworkCache } from './mediaArtworkCache'
import { createMediaArtworkServices, type MediaArtworkServices } from './mediaArtworkServices'
import { registerMediaThumbnailHandlers } from '../ipc/mediaThumbnailHandlers'
import { registerMediaThumbnailProtocolHandler } from '../mediaThumbnailProtocol'

// End to end through the real artwork pipeline: real cache + resolveMediaArtwork
// (only the ffmpeg extractors and the folder scan are faked), the real services
// object, the real get-cover-info handler and the real mediathumb:// handler for
// both the `thumbnail` and the `cover` host.
const mocks = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  protocolHandle: vi.fn(),
  embedded: new Map<string, Buffer>(),
}))

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\ArkManagerTest' },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: mocks.ipcHandle },
  protocol: { handle: mocks.protocolHandle, registerSchemesAsPrivileged: vi.fn() },
}))
vi.mock('./extractAudioArt', () => ({
  extractAudioArt: async (audioPath: string, outputPath: string) => {
    const art = mocks.embedded.get(audioPath)
    if (!art) return false
    await writeFile(outputPath, art)
    return true
  },
}))
vi.mock('./extractVideoFrame', () => ({ extractVideoFrame: async () => false }))
vi.mock('../scanner/thumbnail', () => ({ findThumbnailPath: async () => null }))

const png = (background: string): Promise<Buffer> =>
  sharp({ create: { width: 64, height: 64, channels: 3, background } })
    .png()
    .toBuffer()

describe('media artwork pipeline (cache -> services -> cover info + protocol)', () => {
  let dir: string
  let library: string
  let db: AppDatabase
  let services: MediaArtworkServices
  let workCoverPath: string | null
  const notify = vi.fn()

  beforeEach(async () => {
    mocks.ipcHandle.mockClear()
    mocks.protocolHandle.mockClear()
    mocks.embedded.clear()
    notify.mockClear()
    dir = await mkdtemp(join(tmpdir(), 'ark-manager-artwork-e2e-'))
    library = join(dir, 'Music')
    await mkdir(library, { recursive: true })
    db = createDbClient(':memory:')
    addLibrary(db, 'Music', library)
    const cache = createArtworkCache({
      thumbDir: join(dir, 'cache', 'thumbs'),
      coverDir: join(dir, 'cache', 'covers'),
    })
    await cache.loadWorkCoverGeneration()
    workCoverPath = null
    services = createMediaArtworkServices(cache, notify, async () => workCoverPath)
    registerMediaThumbnailHandlers(db, services)
    registerMediaThumbnailProtocolHandler(db, services)
  })

  afterEach(async () => {
    db.$client.close()
    await rm(dir, { recursive: true, force: true })
  })

  async function coverInfo(filePath: string): Promise<MediaCoverInfo> {
    const call = mocks.ipcHandle.mock.calls.find(([ch]) => ch === IPC_CHANNELS.MEDIA_GET_COVER_INFO)
    const handler = call![1] as (e: unknown, p: unknown) => Promise<MediaCoverInfo>
    return handler({}, { filePath })
  }

  async function fetchArt(host: 'thumbnail' | 'cover', filePath: string): Promise<Buffer> {
    const handler = mocks.protocolHandle.mock.calls[0][1] as (r: {
      url: string
    }) => Promise<Response>
    const response = await handler({
      url: `mediathumb://${host}/${encodeURIComponent(filePath)}`,
    })
    expect(response.status).toBe(200)
    return Buffer.from(await response.arrayBuffer())
  }

  it('invalidateTrack changes the version and the next requests serve the new art', async () => {
    const track = join(library, 'song.mp3')
    mocks.embedded.set(track, await png('#cc2222'))

    const before = await coverInfo(track)
    expect(before.hasCover).toBe(true)
    const thumbBefore = await fetchArt('thumbnail', track)
    const coverBefore = await fetchArt('cover', track)

    // The embedded cover is replaced (e.g. MEDIA_THUMBNAIL_SET_FROM_FILE).
    mocks.embedded.set(track, await png('#2244cc'))
    // Still cached until invalidated.
    expect((await fetchArt('thumbnail', track)).equals(thumbBefore)).toBe(true)

    await services.invalidateTrack(track)
    expect(notify).toHaveBeenCalledWith(track)
    const after = await coverInfo(track)
    expect(after.version).not.toBe(before.version)
    expect(after.accent).not.toBe(before.accent)
    expect((await fetchArt('thumbnail', track)).equals(thumbBefore)).toBe(false)
    expect((await fetchArt('cover', track)).equals(coverBefore)).toBe(false)
  })

  it('bumpWorkCover changes the version and a work-cover track serves the new cover', async () => {
    const track = join(library, 'voice.mp3')
    workCoverPath = join(dir, 'work-a.png')
    await writeFile(workCoverPath, await png('#22aa22'))

    const before = await coverInfo(track)
    expect(before.hasCover).toBe(true)
    const thumbBefore = await fetchArt('thumbnail', track)
    const coverBefore = await fetchArt('cover', track)

    // A crawl / custom cover replaced the work's cover.
    workCoverPath = join(dir, 'work-b.png')
    await writeFile(workCoverPath, await png('#aa22aa'))
    await services.bumpWorkCover()
    expect(notify).toHaveBeenCalledWith(null)

    const after = await coverInfo(track)
    expect(after.version).not.toBe(before.version)
    expect((await fetchArt('thumbnail', track)).equals(thumbBefore)).toBe(false)
    expect((await fetchArt('cover', track)).equals(coverBefore)).toBe(false)
  })

  it('a track without art is a 404 and gains art after a work-cover bump', async () => {
    const track = join(library, 'bare.mp3')
    const handler = mocks.protocolHandle.mock.calls[0][1] as (r: {
      url: string
    }) => Promise<Response>
    const url = `mediathumb://cover/${encodeURIComponent(track)}`
    expect((await coverInfo(track)).hasCover).toBe(false)
    expect((await handler({ url })).status).toBe(404)

    workCoverPath = join(dir, 'work.png')
    await writeFile(workCoverPath, await png('#2222aa'))
    // The cached .notfound still answers until the generation moves.
    expect((await coverInfo(track)).hasCover).toBe(false)
    await services.bumpWorkCover()
    expect((await coverInfo(track)).hasCover).toBe(true)
    expect((await handler({ url })).status).toBe(200)
  })
})
