export interface BreadcrumbSegment {
  label: string
  path: string
}

export function pathToBreadcrumbSegments(path: string): BreadcrumbSegment[] {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)

  return parts.map((label, index) => ({
    label,
    path: parts.slice(0, index + 1).join('/'),
  }))
}
