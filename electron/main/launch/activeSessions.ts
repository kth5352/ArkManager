// Tracks games currently being launched (spawned but not yet exited) so
// `before-quit` can flush their elapsed time before the process ends -
// without this, closing the app while a game is still running loses that
// entire session, since recordPlaySession only ever ran after the child
// process's own exit event (which may never fire if the app quits first).
export interface ActiveSession {
  key: string
  keyType: 'code' | 'path'
  startedAt: number
}

const activeSessions = new Map<string, ActiveSession>()

export function startSession(key: string, keyType: 'code' | 'path'): void {
  activeSessions.set(key, { key, keyType, startedAt: Date.now() })
}

export function endSession(key: string): void {
  activeSessions.delete(key)
}

export function getActiveSessions(): ActiveSession[] {
  return [...activeSessions.values()]
}
