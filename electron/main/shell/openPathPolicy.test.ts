import { describe, expect, it } from 'vitest'
import { isRiskyToOpen } from './openPathPolicy'

const B = String.fromCharCode(92)
const p = (...parts: string[]): string => parts.join(B)

describe('isRiskyToOpen', () => {
  it('flags launchers, scripts, shortcuts and disguised names', () => {
    for (const name of [
      'setup.exe', 'a.EXE', 'a.lnk', 'a.bat', 'a.cmd', 'a.js', 'a.hta', 'a.ps1', 'a.msi',
      'a.url', 'a.exe.', 'a.exe ', 'a.txt:evil.exe', 'README', 'a.iso',
    ]) {
      expect(isRiskyToOpen(p('C:', 'g', name)), name).toBe(true)
    }
  })

  it('lets ordinary documents and media open directly', () => {
    for (const name of ['readme.txt', 'cg01.png', 'a.mp3', 'b.pdf', 'c.jpg']) {
      expect(isRiskyToOpen(p('C:', 'g', name)), name).toBe(false)
    }
  })
})
