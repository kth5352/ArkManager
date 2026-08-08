import { WindowCloseBehaviorSchema, type WindowCloseBehavior } from '../../shared/types/ipc'

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
