import {
  LocaleSchema,
  WindowCloseBehaviorSchema,
  type Locale,
  type WindowCloseBehavior,
} from '../../shared/types/ipc'

export interface WindowClosePrompt {
  title: string
  message: string
  buttons: [quit: string, tray: string, cancel: string]
  checkboxLabel: string
}

const WINDOW_CLOSE_PROMPTS: Record<Locale, WindowClosePrompt> = {
  ko: {
    title: 'Ark Manager 닫기',
    message: 'Ark Manager를 종료하거나 시스템 트레이에서 계속 실행할 수 있습니다.',
    buttons: ['프로그램 종료', '시스템 트레이에서 계속 실행', '취소'],
    checkboxLabel: '항상 이 옵션 사용',
  },
  ja: {
    title: 'Ark Managerを閉じる',
    message: 'Ark Managerを終了するか、システムトレイで実行を続けるか選択してください。',
    buttons: ['アプリを終了', 'システムトレイで実行を続ける', 'キャンセル'],
    checkboxLabel: '常にこのオプションを使用',
  },
  en: {
    title: 'Close Ark Manager',
    message: 'Quit Ark Manager or keep it running in the system tray?',
    buttons: ['Quit Ark Manager', 'Keep Running in System Tray', 'Cancel'],
    checkboxLabel: 'Always use this option',
  },
}

export function getWindowClosePrompt(locale: string | undefined): WindowClosePrompt {
  const parsedLocale = LocaleSchema.safeParse(locale)
  return WINDOW_CLOSE_PROMPTS[parsedLocale.success ? parsedLocale.data : 'ko']
}

export interface MainWindowVisibilityController {
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export function getOrCreateMainWindow<TWindow extends MainWindowVisibilityController>(
  isReady: boolean,
  currentWindow: TWindow | null,
  createWindow: () => TWindow
): TWindow | null {
  if (!isReady) return null
  if (!currentWindow) return createWindow()

  if (currentWindow.isMinimized()) currentWindow.restore()
  currentWindow.show()
  currentWindow.focus()
  return currentWindow
}

export function createQuitLifecycle(commitCleanup: () => void): {
  isQuitting(): boolean
  beginUpdateQuit(): () => void
  commitQuit(): void
} {
  let state: 'running' | 'update-admitted' | 'committed' = 'running'
  let admissionToken = 0

  function beginUpdateQuit(): () => void {
    if (state === 'committed') return () => undefined

    state = 'update-admitted'
    const token = ++admissionToken
    let active = true

    return () => {
      if (!active) return
      active = false
      if (state === 'update-admitted' && admissionToken === token) state = 'running'
    }
  }

  function commitQuit(): void {
    if (state === 'committed') return
    state = 'committed'
    commitCleanup()
  }

  return {
    isQuitting: () => state !== 'running',
    beginUpdateQuit,
    commitQuit,
  }
}

export interface WindowClosePromptResult {
  response: 'quit' | 'tray' | 'cancel'
  remember: boolean
}

export interface WindowCloseControllerDeps<TTarget = void> {
  getBehavior(): string | undefined
  showPrompt(target: TTarget): Promise<WindowClosePromptResult>
  persistBehavior(behavior: Exclude<WindowCloseBehavior, 'ask'>): void | Promise<void>
  quit(): void
  hide(target: TTarget): void
  reportError(error: unknown): void
}

export function resolveWindowCloseBehavior(raw: string | undefined): WindowCloseBehavior {
  return WindowCloseBehaviorSchema.safeParse(raw).data ?? 'ask'
}

export function createWindowCloseController<TTarget = void>(
  deps: WindowCloseControllerDeps<TTarget>
): {
  requestClose(target: TTarget): Promise<void>
} {
  let pendingRequest: Promise<void> | null = null

  async function requestPrompt(target: TTarget): Promise<void> {
    try {
      let result: WindowClosePromptResult

      try {
        result = await deps.showPrompt(target)
      } catch {
        return
      }

      if (result.response === 'cancel') return

      if (result.remember) {
        try {
          await deps.persistBehavior(result.response)
        } catch (error) {
          deps.reportError(error)
        }
      }

      if (result.response === 'quit') {
        deps.quit()
      } else {
        deps.hide(target)
      }
    } finally {
      pendingRequest = null
    }
  }

  function requestClose(target: TTarget): Promise<void> {
    if (pendingRequest) return pendingRequest

    const behavior = resolveWindowCloseBehavior(deps.getBehavior())

    if (behavior === 'quit') {
      deps.quit()
      return Promise.resolve()
    }

    if (behavior === 'tray') {
      deps.hide(target)
      return Promise.resolve()
    }

    let resolvePending!: () => void
    let rejectPending!: (error: unknown) => void
    const currentRequest = new Promise<void>((resolve, reject) => {
      resolvePending = resolve
      rejectPending = reject
    })
    pendingRequest = currentRequest

    void requestPrompt(target).then(resolvePending, rejectPending)
    return currentRequest
  }

  return { requestClose }
}
