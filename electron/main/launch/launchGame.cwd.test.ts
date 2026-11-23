import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))
vi.mock('./localeEmulator', () => ({
  detectLocaleEmulator: async () => 'C:\\Tools\\LE\\LEProc.exe',
}))

import { launchGame } from './launchGame'

function fakeChild(): EventEmitter {
  const child = new EventEmitter()
  setTimeout(() => child.emit('exit', 0), 0)
  return child
}

// Games launched from a shortcut or Explorer start with their own folder as
// the working directory, and many (older engines especially) load assets
// via relative paths. spawn() without cwd inherited Ark Manager's own
// working directory instead.
describe('launchGame working directory', () => {
  it("starts the game in the executable's own folder", async () => {
    spawnMock.mockImplementation(fakeChild)
    await launchGame({ executablePath: 'D:\\Games\\RJ01234567\\Game.exe', launchMode: 'normal' })
    expect(spawnMock).toHaveBeenCalledWith(
      'D:\\Games\\RJ01234567\\Game.exe',
      [],
      expect.objectContaining({ cwd: 'D:\\Games\\RJ01234567' })
    )
  })

  it('uses the game folder (not the Locale Emulator folder) in LE mode', async () => {
    spawnMock.mockReset()
    spawnMock.mockImplementation(fakeChild)
    await launchGame({
      executablePath: 'D:\\Games\\RJ01234567\\Game.exe',
      launchMode: 'locale-emulator',
    })
    expect(spawnMock).toHaveBeenCalledWith(
      'C:\\Tools\\LE\\LEProc.exe',
      ['D:\\Games\\RJ01234567\\Game.exe'],
      expect.objectContaining({ cwd: 'D:\\Games\\RJ01234567' })
    )
  })
})
