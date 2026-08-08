import { describe, expect, it, vi } from 'vitest'

import {
  createWindowCloseController,
  resolveWindowCloseBehavior,
  type WindowCloseControllerDeps,
} from './windowCloseBehavior'

function createDeps(overrides: Partial<WindowCloseControllerDeps> = {}): WindowCloseControllerDeps {
  return {
    getBehavior: () => 'ask',
    showPrompt: vi.fn().mockResolvedValue({ response: 'cancel', remember: false }),
    persistBehavior: vi.fn(),
    quit: vi.fn(),
    hide: vi.fn(),
    reportError: vi.fn(),
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

describe('resolveWindowCloseBehavior', () => {
  it.each(['ask', 'quit', 'tray'] as const)('keeps the valid %s stored value', (raw) => {
    expect(resolveWindowCloseBehavior(raw)).toBe(raw)
  })

  it('defaults a missing stored value to ask', () => {
    expect(resolveWindowCloseBehavior(undefined)).toBe('ask')
  })

  it('defaults an invalid stored value to ask', () => {
    expect(resolveWindowCloseBehavior('hide')).toBe('ask')
  })
})

describe('createWindowCloseController', () => {
  it('quits immediately for the remembered quit behavior', async () => {
    const deps = createDeps({ getBehavior: () => 'quit' })
    const controller = createWindowCloseController(deps)

    await controller.requestClose()

    expect(deps.showPrompt).not.toHaveBeenCalled()
    expect(deps.quit).toHaveBeenCalledOnce()
    expect(deps.hide).not.toHaveBeenCalled()
  })

  it('hides immediately for the remembered tray behavior', async () => {
    const deps = createDeps({ getBehavior: () => 'tray' })
    const controller = createWindowCloseController(deps)

    await controller.requestClose()

    expect(deps.showPrompt).not.toHaveBeenCalled()
    expect(deps.hide).toHaveBeenCalledOnce()
    expect(deps.quit).not.toHaveBeenCalled()
  })

  it('quits after an ask prompt chooses quit without remembering', async () => {
    const deps = createDeps({
      showPrompt: vi.fn().mockResolvedValue({ response: 'quit', remember: false }),
    })
    const controller = createWindowCloseController(deps)

    await controller.requestClose()

    expect(deps.persistBehavior).not.toHaveBeenCalled()
    expect(deps.quit).toHaveBeenCalledOnce()
    expect(deps.hide).not.toHaveBeenCalled()
  })

  it('persists quit and quits after an ask prompt remembers quit', async () => {
    const deps = createDeps({
      showPrompt: vi.fn().mockResolvedValue({ response: 'quit', remember: true }),
    })
    const controller = createWindowCloseController(deps)

    await controller.requestClose()

    expect(deps.persistBehavior).toHaveBeenCalledWith('quit')
    expect(deps.quit).toHaveBeenCalledOnce()
    expect(deps.hide).not.toHaveBeenCalled()
  })

  it('hides after an ask prompt chooses tray without remembering', async () => {
    const deps = createDeps({
      showPrompt: vi.fn().mockResolvedValue({ response: 'tray', remember: false }),
    })
    const controller = createWindowCloseController(deps)

    await controller.requestClose()

    expect(deps.persistBehavior).not.toHaveBeenCalled()
    expect(deps.hide).toHaveBeenCalledOnce()
    expect(deps.quit).not.toHaveBeenCalled()
  })

  it('persists tray and hides after an ask prompt remembers tray', async () => {
    const deps = createDeps({
      showPrompt: vi.fn().mockResolvedValue({ response: 'tray', remember: true }),
    })
    const controller = createWindowCloseController(deps)

    await controller.requestClose()

    expect(deps.persistBehavior).toHaveBeenCalledWith('tray')
    expect(deps.hide).toHaveBeenCalledOnce()
    expect(deps.quit).not.toHaveBeenCalled()
  })

  it('does nothing after an ask prompt is cancelled, even when remember is checked', async () => {
    const deps = createDeps({
      showPrompt: vi.fn().mockResolvedValue({ response: 'cancel', remember: true }),
    })
    const controller = createWindowCloseController(deps)

    await controller.requestClose()

    expect(deps.persistBehavior).not.toHaveBeenCalled()
    expect(deps.quit).not.toHaveBeenCalled()
    expect(deps.hide).not.toHaveBeenCalled()
  })

  it('shares one pending ask prompt across concurrent close requests', async () => {
    const prompt = createDeferred<{ response: 'quit'; remember: false }>()
    const deps = createDeps({ showPrompt: vi.fn(() => prompt.promise) })
    const controller = createWindowCloseController(deps)

    const firstRequest = controller.requestClose()
    const secondRequest = controller.requestClose()

    expect(deps.showPrompt).toHaveBeenCalledOnce()

    prompt.resolve({ response: 'quit', remember: false })
    await Promise.all([firstRequest, secondRequest])

    expect(deps.quit).toHaveBeenCalledOnce()
  })

  it('does nothing when an ask prompt rejects', async () => {
    const deps = createDeps({ showPrompt: vi.fn().mockRejectedValue(new Error('dialog closed')) })
    const controller = createWindowCloseController(deps)

    await controller.requestClose()

    expect(deps.persistBehavior).not.toHaveBeenCalled()
    expect(deps.quit).not.toHaveBeenCalled()
    expect(deps.hide).not.toHaveBeenCalled()
    expect(deps.reportError).not.toHaveBeenCalled()
  })

  it('allows a later close request after an ask prompt rejects', async () => {
    const deps = createDeps({
      showPrompt: vi
        .fn()
        .mockRejectedValueOnce(new Error('dialog closed'))
        .mockResolvedValueOnce({ response: 'tray', remember: false }),
    })
    const controller = createWindowCloseController(deps)

    await controller.requestClose()
    await controller.requestClose()

    expect(deps.showPrompt).toHaveBeenCalledTimes(2)
    expect(deps.hide).toHaveBeenCalledOnce()
  })

  it('reports a persistence failure and still quits', async () => {
    const persistenceError = new Error('database unavailable')
    const deps = createDeps({
      showPrompt: vi.fn().mockResolvedValue({ response: 'quit', remember: true }),
      persistBehavior: vi.fn().mockRejectedValue(persistenceError),
    })
    const controller = createWindowCloseController(deps)

    await controller.requestClose()

    expect(deps.reportError).toHaveBeenCalledWith(persistenceError)
    expect(deps.quit).toHaveBeenCalledOnce()
    expect(deps.hide).not.toHaveBeenCalled()
  })
})
