import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { addLibrary, listLibraries, normalizeLibraryPath, removeLibrary } from './librariesRepository'

describe('normalizeLibraryPath', () => {
  it('lowercases the path so case-only duplicates are treated as identical', () => {
    expect(normalizeLibraryPath('D:\\Games\\DLsite')).toBe('d:\\games\\dlsite')
  })

  it('trims trailing slashes', () => {
    expect(normalizeLibraryPath('D:\\Games\\')).toBe('d:\\games')
  })

  // A live user registered "F:" (their whole drive) as a library and got
  // zero games detected, with no error - traced to this: a bare drive
  // letter with no trailing backslash is NOT the same path as its root on
  // Windows. fs calls against "f:" alone resolve to that process's current
  // working directory ON the F: drive (a legacy per-drive-CWD quirk - e.g.
  // fs.readdirSync('C:') on this very machine returns this repo's own
  // files, not C:\'s root), not the drive's actual root, so the scanner
  // silently scanned the wrong directory (often empty or irrelevant)
  // instead of throwing anything a user could act on. Stripping trailing
  // slashes is safe for every other path ("F:\Games\" and "F:\Games" mean
  // the same thing) but corrupts a drive-root path's meaning entirely.
  it('keeps exactly one trailing backslash for a bare drive-letter root', () => {
    expect(normalizeLibraryPath('F:\\')).toBe('f:\\')
    expect(normalizeLibraryPath('F:')).toBe('f:\\')
    expect(normalizeLibraryPath('f:/')).toBe('f:\\')
  })

  it('still trims trailing slashes for an actual subfolder, drive-root fix aside', () => {
    expect(normalizeLibraryPath('F:\\Games\\')).toBe('f:\\games')
  })
})

describe('librariesRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns an empty list when no libraries are registered', () => {
    expect(listLibraries(db)).toEqual([])
  })

  it('adds a library and returns it with a generated id and timestamp', () => {
    const lib = addLibrary(db, 'Voice', 'D:\\Games\\DLsite')
    expect(lib.name).toBe('Voice')
    expect(lib.path).toBe('d:\\games\\dlsite')
    expect(typeof lib.id).toBe('string')
    expect(lib.id.length).toBeGreaterThan(0)
    expect(typeof lib.createdAt).toBe('string')
  })

  it('lists previously added libraries', () => {
    addLibrary(db, 'Voice', 'D:\\Games\\DLsite')
    addLibrary(db, 'RPG', 'F:\\RPG')
    const libs = listLibraries(db)
    expect(libs.map((l) => l.name).sort()).toEqual(['RPG', 'Voice'])
  })

  it('rejects adding the same path twice, even with different casing', () => {
    addLibrary(db, 'Voice', 'D:\\Games\\DLsite')
    expect(() => addLibrary(db, 'Voice Again', 'd:\\games\\dlsite')).toThrow()
  })

  it('removes a library by id', () => {
    const lib = addLibrary(db, 'Voice', 'D:\\Games\\DLsite')
    removeLibrary(db, lib.id)
    expect(listLibraries(db)).toEqual([])
  })
})
