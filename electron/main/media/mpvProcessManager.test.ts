import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeProc extends EventEmitter {
  stdout = null
  stderr = null
  postMessage = vi.fn()
}

const electronMocks = vi.hoisted(() => ({ procs: [] as unknown[] }))

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: class {},
  MessageChannelMain: class {
    port1 = {}
    port2 = {}
  },
  utilityProcess: {
    fork: vi.fn(() => {
      const p = new FakeProc()
      electronMocks.procs.push(p)
      return p
    }),
  },
}))

import * as mpv from './mpvProcessManager'

const lastProc = (): FakeProc => electronMocks.procs[electronMocks.procs.length - 1] as FakeProc

describe('mpvProcessManager load generation', () => {
  beforeEach(() => {
    // Drop the current child so each test starts from a fresh respawn; the
    // generation counter is deliberately NOT reset by this.
    if (electronMocks.procs.length) lastProc().emit('exit', 1)
  })

  it('increments only on real loads', () => {
    const g0 = mpv.getLoadState().generation
    mpv.loadFile('C:\\a.mp3', 1, 1, false, 'C:/a.mp3')
    expect(mpv.getLoadState().generation).toBe(g0 + 1)
    mpv.loadFile('C:\\a.mp3', 1, 1, false, 'C:/a.mp3')
    expect(mpv.getLoadState().generation).toBe(g0 + 1)
    mpv.loadFile('C:\\b.mp3', 1, 1, false, 'C:/b.mp3')
    expect(mpv.getLoadState().generation).toBe(g0 + 2)
    const types = lastProc().postMessage.mock.calls.map((c) => (c[0] as { type: string }).type)
    expect(types).toEqual(['init', 'load'])
  })

  it('posts the generation and requested path with init and load', () => {
    mpv.loadFile('C:\\d.mp3', 1, 1, false, 'C:/d.mp3')
    mpv.loadFile('C:\\e.mp3', 1, 1, false, 'C:/e.mp3')
    const g = mpv.getLoadState().generation
    const [init, load] = lastProc().postMessage.mock.calls.map((c) => c[0])
    expect(init).toMatchObject({ type: 'init', generation: g - 1, requestedPath: 'C:/d.mp3' })
    expect(load).toMatchObject({ type: 'load', generation: g, requestedPath: 'C:/e.mp3' })
  })

  it('reports the requested path and video flag of the loaded file', () => {
    mpv.loadFile('C:\\v.mp4', 1, 1, true, 'C:/v.mp4')
    expect(mpv.getLoadState()).toMatchObject({ requestedPath: 'C:/v.mp4', isVideo: true })
  })

  it('does not reset the counter on respawn but clears the companion state', () => {
    mpv.loadFile('C:\\c.mp3', 1, 1, false, 'C:/c.mp3')
    const g = mpv.getLoadState().generation
    lastProc().emit('exit', 1)
    expect(mpv.getLoadState()).toEqual({ generation: g, requestedPath: null, isVideo: false })
    mpv.loadFile('C:\\c.mp3', 1, 1, false, 'C:/c.mp3')
    expect(mpv.getLoadState().generation).toBe(g + 1)
    expect(lastProc().postMessage.mock.calls[0][0]).toMatchObject({ type: 'init' })
  })
})
