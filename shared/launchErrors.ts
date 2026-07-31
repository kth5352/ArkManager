// Shared between electron/main/ipc/launchHandlers.ts (which throws this
// exact message) and any renderer code that needs to distinguish "no
// launch config yet" from other launch failures (spawn errors, Locale
// Emulator missing, etc.) - keeping both sides referencing one constant
// instead of two copies of the same Korean string avoids them drifting.
export const NO_LAUNCH_CONFIG_ERROR_MESSAGE = '실행 설정이 없습니다. 먼저 실행파일을 지정해 주세요.'

export function isNoLaunchConfigError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(NO_LAUNCH_CONFIG_ERROR_MESSAGE)
}
