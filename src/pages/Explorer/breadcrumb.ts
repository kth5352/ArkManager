export interface BreadcrumbSegment {
  label: string
  path: string
}

// Segment paths are reconstructed with the native backslash separator, not
// '/' - every other path in this app (scanned entry paths, from node:path's
// join() in the main process) uses backslash, and relativePath's prefix
// comparison against those paths would silently fail as soon as a user
// navigated via any breadcrumb segment past the first, since a '/'-joined
// path no longer matches a '\'-joined one by plain startsWith().
export function pathToBreadcrumbSegments(path: string): BreadcrumbSegment[] {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)

  return parts.map((label, index) => {
    // A bare drive letter ("C:") is not the same location as its root
    // ("C:\\") to Windows filesystem APIs - readdir("C:") resolves against
    // the process's own per-drive current directory, not the actual drive
    // root, so clicking this segment would silently browse the wrong
    // folder without a trailing separator.
    if (index === 0 && /^[A-Za-z]:$/.test(label)) {
      return { label, path: `${label}\\` }
    }
    return { label, path: parts.slice(0, index + 1).join('\\') }
  })
}
