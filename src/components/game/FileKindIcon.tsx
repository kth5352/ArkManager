import { Archive, File, Folder } from 'lucide-react'
import { isArchiveFile } from '../../lib/isArchiveFile'

interface FileKindIconProps {
  kind: 'folder' | 'file'
  name: string
  className?: string
}

// Distinguishes an extracted folder from a still-compressed archive file
// (zip/7z/rar/...) from any other loose file - the three don't otherwise
// look any different in Gallery/List/DetailList at a glance.
export function FileKindIcon({ kind, name, className }: FileKindIconProps) {
  if (kind === 'folder') return <Folder className={className} />
  if (isArchiveFile(name)) return <Archive className={className} />
  return <File className={className} />
}
