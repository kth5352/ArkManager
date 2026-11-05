import { describe, expect, it, vi } from 'vitest'

const execFileMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile: execFileMock }))

import { readExeFileVersion } from './readExeFileVersion'

describe('readExeFileVersion (command-injection hardening)', () => {
  it('never uses a shell and passes the path only via an environment variable', async () => {
    execFileMock.mockImplementation((_file, _args, _opts, cb) => cb(null, '1.2.3\r\n'))
    const hostile = [
      'C:',
      String.fromCharCode(92),
      'games',
      String.fromCharCode(92),
      'x$(calc)',
      "'; Start-Process calc; '",
      '&',
      String.fromCharCode(96),
      '.exe',
    ].join('')

    await expect(readExeFileVersion(hostile)).resolves.toBe('1.2.3')

    const [file, args, options] = execFileMock.mock.calls[0]
    expect(String(file).toLowerCase()).toMatch(/powershell\.exe$/)
    expect(options.shell).toBeUndefined()
    expect(options.env.ARK_EXE_PATH).toBe(hostile)
    expect(options.env.PSModulePath).toBe('')
    // The attacker-controlled text must not appear anywhere in the argv/script.
    expect(args.join(' ')).not.toContain('calc')
    expect(args.join(' ')).not.toContain(hostile)
  })

  it('resolves null on failure, empty output, or an invalid path', async () => {
    execFileMock.mockImplementationOnce((_f, _a, _o, cb) => cb(new Error('boom'), ''))
    await expect(readExeFileVersion('C:/a.exe')).resolves.toBeNull()
    execFileMock.mockImplementationOnce((_f, _a, _o, cb) => cb(null, '  \n'))
    await expect(readExeFileVersion('C:/a.exe')).resolves.toBeNull()
    await expect(readExeFileVersion('')).resolves.toBeNull()
    await expect(readExeFileVersion('C:/a\0.exe')).resolves.toBeNull()
  })
})
