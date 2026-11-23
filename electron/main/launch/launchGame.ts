import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import { detectLocaleEmulator } from './localeEmulator'
import type { LaunchConfig } from '../database/gameUserDataRepository'

export async function launchGame(
  config: LaunchConfig,
  localeEmulatorOverridePath?: string | null
): Promise<{ sessionMs: number }> {
  const [command, args] = await resolveCommand(config, localeEmulatorOverridePath)
  const start = Date.now()

  return new Promise((resolve, reject) => {
    // Run with the game's own folder as working directory (like a shortcut
    // or Explorer double-click would) - many games resolve assets relative
    // to it. Also set in LE mode, where LEProc starts the game (whether LEProc
    // forwards its own cwd to the game has not been verified on a real install).
    const child = spawn(command, args, {
      windowsHide: false,
      cwd: dirname(config.executablePath),
    })

    child.once('error', (error) => reject(error))
    child.once('exit', () => resolve({ sessionMs: Date.now() - start }))
  })
}

async function resolveCommand(
  config: LaunchConfig,
  localeEmulatorOverridePath?: string | null
): Promise<[string, string[]]> {
  if (config.launchMode === 'normal') {
    return [config.executablePath, []]
  }

  const leProcPath = await detectLocaleEmulator(localeEmulatorOverridePath)
  if (!leProcPath) {
    throw new Error('Locale Emulator가 설치되어 있지 않습니다.')
  }
  // 최선으로 알려진 사용법: 대상 exe 경로를 인자로 넘기면 LE GUI에서 설정한
  // 기본 프로파일(보통 일본어)로 실행됨 - 공식 문서로 검증하지 못한 가정이므로
  // 로컬에 LE가 설치되어 있다면 실제로 확인할 것 (이 태스크의 Global
  // Constraints 참고).
  return [leProcPath, [config.executablePath]]
}
