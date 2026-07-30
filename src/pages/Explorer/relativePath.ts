export function relativePath(root: string, fullPath: string): string {
  const normalizedRoot = root.replace(/[\\/]+$/, '')
  if (fullPath === normalizedRoot) return ''
  if (!fullPath.startsWith(normalizedRoot)) return fullPath
  return fullPath.slice(normalizedRoot.length).replace(/^[\\/]+/, '')
}
