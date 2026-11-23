import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/types/ipc'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  requestPreviewFrame: vi.fn(),
}))

vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('../media/mpvPreviewManager', () => ({ requestPreviewFrame: mocks.requestPreviewFrame }))

import { registerMpvPreviewHandlers } from './mpvPreviewHandlers'

type Handler = (event: unknown, payload?: unknown) => unknown

function handler(): Handler {
  const call = mocks.handle.mock.calls.find(([c]) => c === IPC_CHANNELS.MPV_PREVIEW_FRAME)
  if (!call) throw new Error('not registered')
  return call[1] as Handler
}

describe('MPV_PREVIEW_FRAME', () => {
  beforeEach(() => {
    mocks.handle.mockClear()
    mocks.requestPreviewFrame.mockReset()
    registerMpvPreviewHandlers()
  })

  it('passes the validated request to the manager and returns its result', async () => {
    mocks.requestPreviewFrame.mockResolvedValue(null)
    await expect(handler()({}, { seconds: 1, generation: 2, requestId: 3 })).resolves.toBeNull()
    expect(mocks.requestPreviewFrame).toHaveBeenCalledWith({
      seconds: 1,
      generation: 2,
      requestId: 3,
    })
  })

  it('rejects a payload carrying a path without reaching the manager', () => {
    expect(() =>
      handler()({}, { seconds: 1, generation: 2, requestId: 3, path: 'C:/evil.mp4' })
    ).toThrow()
    expect(mocks.requestPreviewFrame).not.toHaveBeenCalled()
  })

  it('rejects a non-finite time', () => {
    expect(() => handler()({}, { seconds: Infinity, generation: 2, requestId: 3 })).toThrow()
    expect(mocks.requestPreviewFrame).not.toHaveBeenCalled()
  })
})
