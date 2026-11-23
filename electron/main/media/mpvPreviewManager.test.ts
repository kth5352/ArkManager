import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeProc extends EventEmitter {
  stdout = null
  stderr = null
  postMessage = vi.fn()
  kill = vi.fn(() => true)
}

const mocks = vi.hoisted(() => ({
  procs: [] as unknown[],
  fork: vi.fn(),
  loadState: { generation: 5, requestedPath: 'D:/v.mp4' as string | null, isVideo: true },
  loadedPath: 'D:\\v.mp4' as string | null,
}))

vi.mock('electron', () => ({
  utilityProcess: { fork: mocks.fork },
}))

vi.mock('./mpvProcessManager', () => ({
  getLoadState: () => ({ ...mocks.loadState }),
  getCurrentLoadedPath: () => mocks.loadedPath,
  resolveAddonDir: () => 'C:\\addon',
}))

type Manager = typeof import('./mpvPreviewManager')

const FRAME_BYTES = 240 * 135 * 4
const procAt = (i: number): FakeProc => mocks.procs[i] as FakeProc
const lastProc = (): FakeProc => mocks.procs[mocks.procs.length - 1] as FakeProc

function lastFrameMessage(proc: FakeProc): {
  type: string
  id: number
  seconds: number
  path: string
} {
  const calls = proc.postMessage.mock.calls.map((c) => c[0] as { type: string })
  const frames = calls.filter((m) => m.type === 'frame')
  return frames[frames.length - 1] as { type: string; id: number; seconds: number; path: string }
}

function reply(proc: FakeProc, data: Uint8Array | null = new Uint8Array(FRAME_BYTES)): void {
  proc.emit('message', { type: 'frame-result', id: lastFrameMessage(proc).id, data })
}

describe('mpvPreviewManager', () => {
  let manager: Manager

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.procs.length = 0
    mocks.fork.mockReset()
    mocks.fork.mockImplementation(() => {
      const p = new FakeProc()
      mocks.procs.push(p)
      return p
    })
    mocks.loadState = { generation: 5, requestedPath: 'D:/v.mp4', isVideo: true }
    mocks.loadedPath = 'D:\\v.mp4'
    vi.resetModules()
    manager = await import('./mpvPreviewManager')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const request = (seconds = 10, generation = 5, requestId = 1) =>
    manager.requestPreviewFrame({ seconds, generation, requestId })

  it('returns null for a stale generation without spawning a child', async () => {
    await expect(request(10, 4)).resolves.toBeNull()
    expect(mocks.fork).not.toHaveBeenCalled()
  })

  it('returns null when the main mpv file is not a video', async () => {
    mocks.loadState.isVideo = false
    await expect(request()).resolves.toBeNull()
    expect(mocks.fork).not.toHaveBeenCalled()
  })

  it('returns null when nothing is loaded in the main mpv', async () => {
    mocks.loadedPath = null
    await expect(request()).resolves.toBeNull()
    expect(mocks.fork).not.toHaveBeenCalled()
  })

  it('lazily forks the preview worker with the addon dir on the first valid request', async () => {
    expect(mocks.fork).not.toHaveBeenCalled()
    const pending = request(12.5, 5, 9)
    expect(mocks.fork).toHaveBeenCalledTimes(1)
    const [script, , options] = mocks.fork.mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string> },
    ]
    expect(script).toMatch(/mpvPreviewWorker\.js$/)
    expect(options.env.MPV_ADDON_DIR).toBe('C:\\addon')
    const data = new Uint8Array(FRAME_BYTES).fill(7)
    reply(lastProc(), data)
    await expect(pending).resolves.toEqual({
      generation: 5,
      requestId: 9,
      seconds: 12.5,
      width: 240,
      height: 135,
      data,
    })
    // A second request reuses the same child.
    const again = request(20)
    reply(lastProc())
    await again
    expect(mocks.fork).toHaveBeenCalledTimes(1)
  })

  it('takes the path from the main manager state, never from the request', async () => {
    mocks.loadedPath = 'D:\\resolved\\movie.mp4'
    const pending = manager.requestPreviewFrame({
      seconds: 3,
      generation: 5,
      requestId: 1,
      // A smuggled path must be ignored even if it ever got past the schema.
      path: 'C:\\evil.mp4',
    } as never)
    expect(lastFrameMessage(lastProc())).toMatchObject({
      type: 'frame',
      seconds: 3,
      path: 'D:\\resolved\\movie.mp4',
    })
    reply(lastProc())
    await pending
  })

  it('returns null when the generation changes while the worker is busy', async () => {
    const pending = request()
    mocks.loadState.generation = 6
    reply(lastProc())
    await expect(pending).resolves.toBeNull()
  })

  it('resolves a replaced waiting request null and only runs the latest', async () => {
    const first = request(1, 5, 1)
    const second = request(2, 5, 2)
    const third = request(3, 5, 3)
    await expect(second).resolves.toBeNull()
    reply(lastProc())
    await expect(first).resolves.toMatchObject({ requestId: 1 })
    await vi.waitFor(() => expect(lastFrameMessage(lastProc()).seconds).toBe(3))
    reply(lastProc())
    await expect(third).resolves.toMatchObject({ requestId: 3 })
  })

  it('drops a wrong-sized frame from the worker', async () => {
    const pending = request()
    reply(lastProc(), new Uint8Array(10))
    await expect(pending).resolves.toBeNull()
  })

  it('shuts the idle worker down after 60s without requests', async () => {
    const pending = request()
    reply(lastProc())
    await pending
    const proc = lastProc()
    await vi.advanceTimersByTimeAsync(59_000)
    expect(proc.postMessage).not.toHaveBeenCalledWith({ type: 'shutdown' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(proc.postMessage).toHaveBeenCalledWith({ type: 'shutdown' })
    proc.emit('exit', 0)
    // An expected exit is not a crash, and the next request forks afresh.
    const next = request()
    expect(mocks.fork).toHaveBeenCalledTimes(2)
    reply(lastProc())
    await expect(next).resolves.not.toBeNull()
  })

  it('resolves the in-flight request null on a crash and respawns on the next request', async () => {
    const pending = request()
    procAt(0).emit('exit', 1)
    await expect(pending).resolves.toBeNull()
    const next = request()
    expect(mocks.fork).toHaveBeenCalledTimes(2)
    reply(lastProc())
    await expect(next).resolves.not.toBeNull()
  })

  it('disables previews after 3 crashes within 60s', async () => {
    for (let i = 0; i < 3; i++) {
      const pending = request()
      lastProc().emit('exit', 1)
      await expect(pending).resolves.toBeNull()
      await vi.advanceTimersByTimeAsync(10_000)
    }
    expect(mocks.fork).toHaveBeenCalledTimes(3)
    await expect(request()).resolves.toBeNull()
    await vi.advanceTimersByTimeAsync(120_000)
    await expect(request()).resolves.toBeNull()
    expect(mocks.fork).toHaveBeenCalledTimes(3)
  })

  it('keeps previews enabled when the crashes are spread over more than 60s', async () => {
    for (let i = 0; i < 3; i++) {
      const pending = request()
      lastProc().emit('exit', 1)
      await pending
      await vi.advanceTimersByTimeAsync(31_000)
    }
    const next = request()
    expect(mocks.fork).toHaveBeenCalledTimes(4)
    reply(lastProc())
    await expect(next).resolves.not.toBeNull()
  })

  it('kills a hung worker and resolves its request null', async () => {
    const pending = request()
    const proc = lastProc()
    await vi.advanceTimersByTimeAsync(6_000)
    await expect(pending).resolves.toBeNull()
    expect(proc.kill).toHaveBeenCalled()
  })

  it('replaces a killed hung worker for the next queued job and counts the hang once', async () => {
    const hung = request(1, 5, 1)
    const waiting = request(2, 5, 2)
    const hungProc = procAt(0)
    await vi.advanceTimersByTimeAsync(6_000)
    await expect(hung).resolves.toBeNull()
    expect(hungProc.kill).toHaveBeenCalledTimes(1)
    // The waiting job goes to a NEW worker, not to the dying one.
    await vi.waitFor(() => expect(mocks.fork).toHaveBeenCalledTimes(2))
    expect(hungProc.postMessage.mock.calls.filter((c) => c[0].type === 'frame')).toHaveLength(1)
    expect(lastFrameMessage(procAt(1)).seconds).toBe(2)
    // The killed process's exit arrives later and must not count again.
    hungProc.emit('exit', 1)
    reply(procAt(1))
    await expect(waiting).resolves.toMatchObject({ requestId: 2 })
    // One crash so far: two more within the window disable previews...
    for (let i = 0; i < 2; i++) {
      const pending = request()
      lastProc().emit('exit', 1)
      await pending
    }
    await expect(request()).resolves.toBeNull()
    expect(mocks.fork).toHaveBeenCalledTimes(3)
  })

  it('counts a killed hung worker once even after its exit event', async () => {
    const hung = request()
    await vi.advanceTimersByTimeAsync(6_000)
    await hung
    procAt(0).emit('exit', 1)
    // Hang = 1 crash; one more crash (2 total) must NOT disable previews.
    const second = request()
    lastProc().emit('exit', 1)
    await second
    const third = request()
    expect(mocks.fork).toHaveBeenCalledTimes(3)
    reply(lastProc())
    await expect(third).resolves.not.toBeNull()
  })

  it('shutdownPreview posts shutdown to the worker and stops further previews', async () => {
    const pending = request()
    reply(lastProc())
    await pending
    manager.shutdownPreview()
    expect(lastProc().postMessage).toHaveBeenCalledWith({ type: 'shutdown' })
    await expect(request()).resolves.toBeNull()
    expect(mocks.fork).toHaveBeenCalledTimes(1)
  })

  it('shutdownPreview without a worker does not fork one', () => {
    manager.shutdownPreview()
    expect(mocks.fork).not.toHaveBeenCalled()
  })
})
