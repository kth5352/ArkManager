export function relativePath(root: string, fullPath: string): string {
  const normalizedRoot = root.replace(/[\\/]+$/, '')
  if (fullPath === normalizedRoot) return ''
  if (!fullPath.startsWith(normalizedRoot)) return fullPath
  // A plain startsWith() would also match a sibling folder that merely
  // shares a literal prefix (e.g. root "D:\game" against fullPath
  // "D:\games\file.zip") - require the next character to be a path
  // separator (or nothing) to confirm fullPath is actually a descendant.
  const boundaryChar = fullPath[normalizedRoot.length]
  if (boundaryChar !== undefined && boundaryChar !== '\\' && boundaryChar !== '/') return fullPath
  return fullPath.slice(normalizedRoot.length).replace(/^[\\/]+/, '')
}
