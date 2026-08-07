const ARCHIVE_EXTENSIONS = new Set([
  '.zip',
  '.7z',
  '.rar',
  '.egg',
  '.tar',
  '.gz',
  '.bz2',
  '.xz',
  '.lzh',
  '.cab',
  '.iso',
])

export function isArchiveFile(name: string): boolean {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex === -1) return false
  return ARCHIVE_EXTENSIONS.has(name.slice(dotIndex).toLowerCase())
}
