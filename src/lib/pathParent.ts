export function getParentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalized.startsWith('//')) {
    const parts = normalized.slice(2).split('/').filter(Boolean)
    if (parts.length === 0) return '\\\\'
    if (parts.length === 1) return `\\\\${parts[0]}\\`
    const root = `\\\\${parts[0]}\\${parts[1]}`
    if (parts.length === 2) return `${root}\\`
    if (parts.length === 3) return `${root}\\`
    return `${root}\\${parts.slice(2, -1).join('\\')}`.replace(/\\$/, '') || `${root}\\`
  }
  const parts = normalized.split('/').filter(Boolean)
  parts.pop()
  if (parts.length === 1 && /^[A-Za-z]:$/.test(parts[0])) return `${parts[0]}\\`
  return parts.join('\\')
}
