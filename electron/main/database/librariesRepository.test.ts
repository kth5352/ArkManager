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
