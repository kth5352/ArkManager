import { describe, expect, it } from 'vitest'
import { libraryPathRejection } from './libraryPathPolicy'

const B = String.fromCharCode(92)
const p = (...parts: string[]): string => parts.join(B)

const loc = {
  userDataDir: p('C:', 'Users', 'me', 'AppData', 'Roaming', 'Ark Manager'),
  windowsDir: p('C:', 'Windows'),
  programFilesDirs: [p('C:', 'Program Files'), p('C:', 'Program Files (x86)')],
  programDataDir: p('C:', 'ProgramData'),
}

describe('libraryPathRejection', () => {
  it('rejects folders that contain or are the app data folder', () => {
    for (const candidate of [
      'C:' + B,
      p('C:', 'Users'),
      p('C:', 'Users', 'me'),
      p('C:', 'Users', 'me', 'AppData'),
      p('C:', 'Users', 'me', 'AppData', 'Roaming'),
      p('C:', 'Users', 'me', 'AppData', 'Roaming', 'Ark Manager'),
      p('c:', 'users', 'ME', 'appdata', 'roaming', 'ark manager', 'saves'),
    ]) {
      expect(libraryPathRejection(candidate, loc), candidate).not.toBeNull()
    }
  })

  it('rejects Windows, Program Files and ProgramData (and parents/children)', () => {
    for (const candidate of [
      p('C:', 'Windows'),
      p('C:', 'Windows', 'System32'),
      p('C:', 'Program Files'),
      p('C:', 'Program Files', 'Foo'),
      p('C:', 'ProgramData', 'x'),
    ]) {
      expect(libraryPathRejection(candidate, loc), candidate).not.toBeNull()
    }
  })

  it('accepts ordinary game folders and other drives, including a whole data drive', () => {
    for (const candidate of [
      p('D:', 'Games'),
      'D:' + B,
      p('E:', 'ASMR', '2024'),
      p('C:', 'Users', 'me', 'Documents', 'Games'),
    ]) {
      expect(libraryPathRejection(candidate, loc), candidate).toBeNull()
    }
  })

  it('rejects NUL bytes', () => {
    expect(libraryPathRejection('D:' + B + 'a\0b', loc)).not.toBeNull()
  })
})
