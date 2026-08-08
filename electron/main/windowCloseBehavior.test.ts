import { describe, expect, it, vi } from 'vitest'

import {
  createQuitLifecycle,
  createWindowCloseController,
  getOrCreateMainWindow,
  getWindowClosePrompt,
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

describe('getWindowClosePrompt', () => {
  it('returns the Korean close prompt', () => {
    expect(getWindowClosePrompt('ko')).toEqual({
      title: 'Ark Manager 닫기',
      message: 'Ark Manager를 종료하거나 시스템 트레이에서 계속 실행할 수 있습니다.',
      buttons: ['프로그램 종료', '시스템 트레이에서 계속 실행', '취소'],
      checkboxLabel: '항상 이 옵션 사용',
    })
  })

  it('returns the Japanese close prompt', () => {
    expect(getWindowClosePrompt('ja')).toEqual({
      title: 'Ark Managerを閉じる',
      message: 'Ark Managerを終了するか、システムトレイで実行を続けるか選択してください。',
      buttons: ['アプリを終了', 'システムトレイで実行を続ける', 'キャンセル'],
      checkboxLabel: '常にこのオプションを使用',
    })
  })

  it('returns the English close prompt', () => {
    expect(getWindowClosePrompt('en')).toEqual({
      title: 'Close Ark Manager',
      message: 'Quit Ark Manager or keep it running in the system tray?',
      buttons: ['Quit Ark Manager', 'Keep Running in System Tray', 'Cancel'],
      checkboxLabel: 'Always use this option',
    })
  })

  it('falls back to the Korean close prompt for an invalid locale', () => {
    expect(getWindowClosePrompt('fr')).toEqual({
      title: 'Ark Manager 닫기',
      message: 'Ark Manager를 종료하거나 시스템 트레이에서 계속 실행할 수 있습니다.',
      buttons: ['프로그램 종료', '시스템 트레이에서 계속 실행', '취소'],
      checkboxLabel: '항상 이 옵션 사용',
    })
  })
})

describe('getOrCreateMainWindow', () => {
  it('does not create a window before the close controller is ready', () => {
    const createWindow = vi.fn(() => ({ id: 'created' }))

    expect(getOrCreateMainWindow(false, null, createWindow)).toBeNull()
    expect(createWindow).not.toHaveBeenCalled()
  })

  it('reuses an existing window instead of replacing it during startup', () => {
    const existingWindow = { id: 'existing' }
    const createWindow = vi.fn(() => ({ id: 'replacement' }))

    expect(getOrCreateMainWindow(true, existingWindow, createWindow)).toBe(existingWindow)
    expect(createWindow).not.toHaveBeenCalled()
  })
})

describe('createQuitLifecycle', () => {
  it('rolls reversible updater admission back without running quit cleanup', () => {
    const cleanup = vi.fn()
    const lifecycle = createQuitLifecycle(cleanup)

    const rollback = lifecycle.beginUpdateQuit()
    expect(lifecycle.isQuitting()).toBe(true)
    expect(cleanup).not.toHaveBeenCalled()

    rollback()
    expect(lifecycle.isQuitting()).toBe(false)
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('keeps committed before-quit state when a pending updater rollback fires', () => {
    const cleanup = vi.fn()
    const lifecycle = createQuitLifecycle(cleanup)
    const rollback = lifecycle.beginUpdateQuit()

    lifecycle.commitQuit()
    rollback()

    expect(lifecycle.isQuitting()).toBe(true)
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('commits direct application quit cleanup exactly once', () => {
    const cleanup = vi.fn()
    const lifecycle = createQuitLifecycle(cleanup)

    lifecycle.commitQuit()
    lifecycle.commitQuit()

    expect(lifecycle.isQuitting()).toBe(true)
    expect(cleanup).toHaveBeenCalledOnce()
  })
})

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

    expect(secondRequest).toBe(firstRequest)
    expect(deps.showPrompt).toHaveBeenCalledOnce()

    prompt.resolve({ response: 'quit', remember: false })
    await Promise.all([firstRequest, secondRequest])

    expect(deps.quit).toHaveBeenCalledOnce()
  })

  it('keeps an ask prompt pending when the stored policy changes', async () => {
    let behavior = 'ask'
    const prompt = createDeferred<{ response: 'tray'; remember: false }>()
    const deps = createDeps({
      getBehavior: () => behavior,
      showPrompt: vi.fn(() => prompt.promise),
    })
    const controller = createWindowCloseController(deps)

    const firstRequest = controller.requestClose()
    behavior = 'quit'
    const secondRequest = controller.requestClose()

    expect(secondRequest).toBe(firstRequest)
    expect(deps.quit).not.toHaveBeenCalled()

    prompt.resolve({ response: 'tray', remember: false })
    await Promise.all([firstRequest, secondRequest])

    expect(deps.hide).toHaveBeenCalledOnce()
    expect(deps.quit).not.toHaveBeenCalled()
  })

  it('keeps actions bound to the window that started the pending close request', async () => {
    const prompt = createDeferred<{ response: 'tray'; remember: false }>()
    const showPrompt = vi.fn((_window: string) => prompt.promise)
    const hide = vi.fn((_window: string) => undefined)
    const controller = createWindowCloseController<string>({
      getBehavior: () => 'ask',
      showPrompt,
      persistBehavior: vi.fn(),
      quit: vi.fn(),
      hide,
      reportError: vi.fn(),
    })

    const firstRequest = controller.requestClose('originating-window')
    const secondRequest = controller.requestClose('later-window')
    prompt.resolve({ response: 'tray', remember: false })
    await Promise.all([firstRequest, secondRequest])

    expect(showPrompt).toHaveBeenCalledWith('originating-window')
    expect(hide).toHaveBeenCalledWith('originating-window')
  })

  it('keeps persistence pending when the stored policy changes', async () => {
    let behavior = 'ask'
    const persistence = createDeferred<void>()
    const deps = createDeps({
      getBehavior: () => behavior,
      showPrompt: vi.fn().mockResolvedValue({ response: 'tray', remember: true }),
      persistBehavior: vi.fn(() => persistence.promise),
    })
    const controller = createWindowCloseController(deps)

    const firstRequest = controller.requestClose()
    await Promise.resolve()
    behavior = 'quit'
    const secondRequest = controller.requestClose()

    expect(secondRequest).toBe(firstRequest)
    expect(deps.persistBehavior).toHaveBeenCalledWith('tray')
    expect(deps.quit).not.toHaveBeenCalled()

    persistence.resolve()
    await Promise.all([firstRequest, secondRequest])

    expect(deps.hide).toHaveBeenCalledOnce()
    expect(deps.quit).not.toHaveBeenCalled()
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

    const firstRequest = controller.requestClose()

    expect(firstRequest).toBeInstanceOf(Promise)

    await firstRequest
    await controller.requestClose()

    expect(deps.showPrompt).toHaveBeenCalledTimes(2)
    expect(deps.hide).toHaveBeenCalledOnce()
  })

  it('allows a later close request after an ask prompt throws synchronously', async () => {
    const deps = createDeps({
      showPrompt: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('dialog unavailable')
        })
        .mockResolvedValueOnce({ response: 'tray', remember: false }),
    })
    const controller = createWindowCloseController(deps)

    const firstRequest = controller.requestClose()

    expect(firstRequest).toBeInstanceOf(Promise)

    await firstRequest
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
