import { describe, it, expect } from 'vitest'
import { launchGame } from './launchGame'

describe('launchGame', () => {
  it('waits for the process to exit and reports a non-negative session duration', async () => {
    // help.exe는 Windows에 기본 내장되어 있고 도움말을 출력한 뒤 바로
    // 종료되므로, 테스트를 오래 걸리게 하거나 사람의 조작을 기다리지
    // 않는다.
    const result = await launchGame({ executablePath: 'help.exe', launchMode: 'normal' })
    expect(result.sessionMs).toBeGreaterThanOrEqual(0)
  }, 10_000)

  it('rejects when the executable does not exist', async () => {
    await expect(
      launchGame({ executablePath: 'C:\\does\\not\\exist.exe', launchMode: 'normal' })
    ).rejects.toThrow()
  })
})
