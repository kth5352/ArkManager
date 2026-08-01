export interface LibraryLike {
  id: string
  path: string
}

// Windows paths mix backslash/forward-slash and casing inconsistently -
// normalizes both sides the same way thumbnailProtocol.ts's
// isPathWithinAnyLibrary does for the same reason. Picks the longest
// matching library path if more than one matches (nested library
// registrations are unusual but this makes the tie-break correct rather
// than arbitrary).
export function findLibraryForPath<T extends LibraryLike>(
  entryPath: string,
  libraries: T[]
): T | undefined {
  const normalizedEntry = entryPath.toLowerCase().replace(/\\/g, '/')
  const matches = libraries.filter((library) => {
    const normalizedLibrary = library.path.toLowerCase().replace(/\\/g, '/')
    return (
      normalizedEntry === normalizedLibrary || normalizedEntry.startsWith(`${normalizedLibrary}/`)
    )
  })
  return matches.sort((a, b) => b.path.length - a.path.length)[0]
}
