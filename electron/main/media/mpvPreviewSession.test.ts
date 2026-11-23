import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPreviewSession,
  PREVIEW_FRAME_BYTES,
  type PreviewAddon,
  type PreviewSessionOptions,
} from './mpvPreviewSession'

type MpvEvent = { name: string; error?: string }

class FakeAddon implements PreviewAddon {
  events: MpvEvent[] = []
  renderCalls = 0
  renderReturns: () => Buffer | null = () => Buffer.alloc(PREVIEW_FRAME_BYTES, this.renderCalls)
  init = vi.fn((_path: string, _w: number, _h: number, _hw: string, _o: { preview: true }) => 'OK')
  loadFile = vi.fn((_path: string) => 'OK')
  seek = vi.fn((_s: number, _m: 'keyframes') => 'OK')
  shutdown = vi.fn(() => 'OK')
  setPause = vi.fn()
  setVolume = vi.fn()
  pollEvent = vi.fn((): MpvEvent | null => this.events.shift() ?? null)
  renderFrame = vi.fn((_w: number, _h: number): Buffer | null => {
    this.renderCalls++
    return this.renderReturns()
  })
  push(...names: string[]): void {
    for (const name of names) this.events.push({ name })
  }
}

const TICK = 4
const options: PreviewSessionOptions = { now: () => Date.now() }

async function tick(n = 1): Promise<void> {
  await vi.advanceTimersByTimeAsync(TICK * n)
}

describe('createPreviewSession', () => {
  let addon: FakeAddon

  beforeEach(() => {
    vi.useFakeTimers()
    addon = new FakeAddon()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Drives the first request through init + load: start-file, file-loaded and
  // the initial (pre-seek) playback-restart.
  async function primeLoad(): Promise<void> {
    addon.push('start-file', 'file-loaded', 'playback-restart')
    await tick()
  }

  it('inits the preview mpv on the first request with the fixed preview arguments', async () => {
    const session = createPreviewSession(addon, options)
    const result = session.requestFrame('D:\\v.mp4', 10)
    expect(addon.init).toHaveBeenCalledWith('D:\\v.mp4', 240, 135, 'no', { preview: true })
    await primeLoad()
    expect(addon.seek).toHaveBeenCalledWith(10, 'keyframes')
    addon.push('playback-restart')
    await tick()
    const frame = await result
    expect(frame).toBeInstanceOf(Uint8Array)
    expect(frame!.length).toBe(PREVIEW_FRAME_BYTES)
    expect(addon.loadFile).not.toHaveBeenCalled()
  })

  it('never un-pauses or touches the volume', async () => {
    const session = createPreviewSession(addon, options)
    const result = session.requestFrame('D:\\v.mp4', 1)
    await primeLoad()
    addon.push('playback-restart')
    await tick()
    await result
    expect(addon.setPause).not.toHaveBeenCalled()
    expect(addon.setVolume).not.toHaveBeenCalled()
  })

  it('renders on every tick while a seek is pending and returns only a frame rendered after playback-restart', async () => {
    const session = createPreviewSession(addon, options)
    const result = session.requestFrame('D:\\v.mp4', 5)
    await primeLoad()
    const before = addon.renderCalls
    await tick(5)
    // CONTRACT: the paused seek only completes when the VO keeps rendering.
    expect(addon.renderCalls - before).toBeGreaterThanOrEqual(5)
    let settled = false
    void result.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    addon.push('playback-restart')
    await tick()
    const frame = await result
    // The returned bytes are those of the render on the tick that saw the
    // restart (the fake stamps each buffer with its render counter).
    expect(frame![0]).toBe(addon.renderCalls & 0xff)
  })

  it('times out after 800ms without playback-restart and returns null', async () => {
    const session = createPreviewSession(addon, options)
    const result = session.requestFrame('D:\\v.mp4', 5)
    await primeLoad()
    await vi.advanceTimersByTimeAsync(820)
    await expect(result).resolves.toBeNull()
  })

  it('returns null when no successful render follows playback-restart before the timeout', async () => {
    const session = createPreviewSession(addon, options)
    const result = session.requestFrame('D:\\v.mp4', 5)
    await primeLoad()
    addon.renderReturns = () => null
    addon.push('playback-restart')
    await vi.advanceTimersByTimeAsync(820)
    await expect(result).resolves.toBeNull()
  })

  it('uses loadFile (not init) when the path changes, and skips loading for the same path', async () => {
    const session = createPreviewSession(addon, options)
    const first = session.requestFrame('D:\\a.mp4', 1)
    await primeLoad()
    addon.push('playback-restart')
    await tick()
    await first

    const same = session.requestFrame('D:\\a.mp4', 2)
    await tick()
    expect(addon.loadFile).not.toHaveBeenCalled()
    addon.push('playback-restart')
    await tick()
    await expect(same).resolves.not.toBeNull()

    const other = session.requestFrame('D:\\b.mp4', 3)
    expect(addon.loadFile).toHaveBeenCalledWith('D:\\b.mp4')
    expect(addon.init).toHaveBeenCalledTimes(1)
    addon.push('end-file', 'start-file', 'file-loaded', 'playback-restart')
    await tick()
    expect(addon.seek).toHaveBeenLastCalledWith(3, 'keyframes')
    addon.push('playback-restart')
    await tick()
    await expect(other).resolves.not.toBeNull()
  })

  it('does not take the initial playback-restart of a fresh load for the seek', async () => {
    const session = createPreviewSession(addon, options)
    const result = session.requestFrame('D:\\v.mp4', 30)
    addon.push('start-file', 'file-loaded')
    await tick()
    // Still loading: no seek before the initial restart arrives.
    expect(addon.seek).not.toHaveBeenCalled()
    addon.push('playback-restart')
    await tick()
    expect(addon.seek).toHaveBeenCalledTimes(1)
    let settled = false
    void result.then(() => (settled = true))
    await tick(3)
    expect(settled).toBe(false)
    addon.push('playback-restart')
    await tick()
    await expect(result).resolves.not.toBeNull()
  })

  it('times out a load that never reports file-loaded after 3s and reloads next time', async () => {
    const session = createPreviewSession(addon, options)
    const result = session.requestFrame('D:\\v.mp4', 1)
    addon.push('start-file')
    await vi.advanceTimersByTimeAsync(3020)
    await expect(result).resolves.toBeNull()
    expect(addon.seek).not.toHaveBeenCalled()
    const again = session.requestFrame('D:\\v.mp4', 1)
    expect(addon.loadFile).toHaveBeenCalledWith('D:\\v.mp4')
    addon.push('start-file', 'file-loaded', 'playback-restart')
    await tick()
    addon.push('playback-restart')
    await tick()
    await expect(again).resolves.not.toBeNull()
  })

  it('fails fast when the file ends before it loaded', async () => {
    const session = createPreviewSession(addon, options)
    const result = session.requestFrame('D:\\broken.mp4', 1)
    addon.push('start-file', 'end-file')
    await tick()
    await expect(result).resolves.toBeNull()
  })

  it('ignores stale events queued before the load', async () => {
    const session = createPreviewSession(addon, options)
    const first = session.requestFrame('D:\\a.mp4', 1)
    await primeLoad()
    addon.push('playback-restart')
    await tick()
    await first
    // Stale events left over from earlier activity.
    addon.push('file-loaded', 'playback-restart')
    const other = session.requestFrame('D:\\b.mp4', 1)
    await tick(3)
    expect(addon.seek).toHaveBeenCalledTimes(1)
    addon.push('start-file', 'file-loaded', 'playback-restart')
    await tick()
    addon.push('playback-restart')
    await tick()
    await expect(other).resolves.not.toBeNull()
  })

  it('returns null and shuts the addon down when init fails, then inits again', async () => {
    addon.init.mockReturnValueOnce('ERROR mpv_create returned NULL')
    const session = createPreviewSession(addon, options)
    await expect(session.requestFrame('D:\\v.mp4', 1)).resolves.toBeNull()
    expect(addon.shutdown).toHaveBeenCalledTimes(1)
    const again = session.requestFrame('D:\\v.mp4', 1)
    expect(addon.init).toHaveBeenCalledTimes(2)
    await primeLoad()
    addon.push('playback-restart')
    await tick()
    await expect(again).resolves.not.toBeNull()
  })

  it('rejects a frame of the wrong size', async () => {
    addon.renderReturns = () => Buffer.alloc(16)
    const session = createPreviewSession(addon, options)
    const result = session.requestFrame('D:\\v.mp4', 1)
    await primeLoad()
    addon.push('playback-restart')
    await vi.advanceTimersByTimeAsync(820)
    await expect(result).resolves.toBeNull()
  })

  it('shutdown releases the addon', async () => {
    const session = createPreviewSession(addon, options)
    const result = session.requestFrame('D:\\v.mp4', 1)
    await primeLoad()
    addon.push('playback-restart')
    await tick()
    await result
    session.shutdown()
    expect(addon.shutdown).toHaveBeenCalledTimes(1)
  })
})
