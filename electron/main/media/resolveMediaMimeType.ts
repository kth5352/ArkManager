import { extname } from 'node:path'

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.m4v': 'video/x-m4v',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
}

// Chromium's media engine leans on Content-Type to decide how to demux/play
// a response at all - an unset or generic type (the default a raw fs stream
// would otherwise carry no opinion on) can make it refuse to treat the
// resource as playable media in the first place.
export function resolveMediaMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}
