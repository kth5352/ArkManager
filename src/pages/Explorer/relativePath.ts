// root and fullPath can each independently use either separator style (a
// tab's path can come from window.api.libraries.pickFolder(), which may
// return forward slashes, while fullPath always comes from the scanner's
// own native-backslash output) - comparing them directly could miss a real
// match entirely, not just mis-detect the boundary. slashesToBackslashes is
// a 1:1 character substitution (same length), so slicing the ORIGINAL
// fullPath at an index computed from the normalized copies still lands on
// the same character position.
function slashesToBackslashes(path: string): string {
  return path.replace(/\//g, '\\')
}

export function relativePath(root: string, fullPath: string): string {
  const normalizedRoot = slashesToBackslashes(root).replace(/\\+$/, '')
  const normalizedFullPath = slashesToBackslashes(fullPath)
  if (normalizedFullPath === normalizedRoot) return ''
  if (!normalizedFullPath.startsWith(normalizedRoot)) return fullPath
  // A plain startsWith() would also match a sibling folder that merely
  // shares a literal prefix (e.g. root "D:\game" against fullPath
  // "D:\games\file.zip") - require the next character to be a path
  // separator (or nothing) to confirm fullPath is actually a descendant.
  const boundaryChar = normalizedFullPath[normalizedRoot.length]
  if (boundaryChar !== undefined && boundaryChar !== '\\') return fullPath
  return fullPath.slice(normalizedRoot.length).replace(/^[\\/]+/, '')
}
