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

export interface WindowClosePromptResult {
  response: 'quit' | 'tray' | 'cancel'
  remember: boolean
}

export interface WindowCloseControllerDeps {
  getBehavior(): string | undefined
  showPrompt(): Promise<WindowClosePromptResult>
  persistBehavior(behavior: Exclude<WindowCloseBehavior, 'ask'>): void | Promise<void>
  quit(): void
  hide(): void
  reportError(error: unknown): void
}

export function resolveWindowCloseBehavior(raw: string | undefined): WindowCloseBehavior {
  return WindowCloseBehaviorSchema.safeParse(raw).data ?? 'ask'
}

export function createWindowCloseController(deps: WindowCloseControllerDeps): {
  requestClose(): Promise<void>
} {
  let pendingRequest: Promise<void> | null = null

  async function requestPrompt(): Promise<void> {
    try {
      let result: WindowClosePromptResult

      try {
        result = await deps.showPrompt()
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
        deps.hide()
      }
    } finally {
      pendingRequest = null
    }
  }

  function requestClose(): Promise<void> {
    if (pendingRequest) return pendingRequest

    const behavior = resolveWindowCloseBehavior(deps.getBehavior())

    if (behavior === 'quit') {
      deps.quit()
      return Promise.resolve()
    }

    if (behavior === 'tray') {
      deps.hide()
      return Promise.resolve()
    }

    let resolvePending!: () => void
    let rejectPending!: (error: unknown) => void
    const currentRequest = new Promise<void>((resolve, reject) => {
      resolvePending = resolve
      rejectPending = reject
    })
    pendingRequest = currentRequest

    void requestPrompt().then(resolvePending, rejectPending)
    return currentRequest
  }

  return { requestClose }
}
