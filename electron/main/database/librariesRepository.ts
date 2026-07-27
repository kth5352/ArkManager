import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { libraries } from './schema'

export interface Library {
  id: string
  name: string
  path: string
  createdAt: string
}

// Windows filesystems are case-insensitive, so "D:\Games" and "d:\games" refer
// to the same folder. Lowercasing (and trimming a trailing slash) before the
// path hits the `unique` constraint stops a user from registering the same
// library twice under different casing.
export function normalizeLibraryPath(path: string): string {
  return path.toLowerCase().replace(/[\\/]+$/, '')
}

export function listLibraries(db: AppDatabase): Library[] {
  return db.select().from(libraries).all()
}

export function addLibrary(db: AppDatabase, name: string, path: string): Library {
  const library: Library = {
    id: crypto.randomUUID(),
    name,
    path: normalizeLibraryPath(path),
    createdAt: new Date().toISOString(),
  }
  db.insert(libraries).values(library).run()
  return library
}

export function removeLibrary(db: AppDatabase, id: string): void {
  db.delete(libraries).where(eq(libraries.id, id)).run()
}
