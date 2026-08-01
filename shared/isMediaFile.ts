const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.m4v'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'])

function getExtension(name: string): string {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex === -1) return ''
  return name.slice(dotIndex).toLowerCase()
}

export function isVideoFile(name: string): boolean {
  return VIDEO_EXTENSIONS.has(getExtension(name))
}

export function isAudioFile(name: string): boolean {
  return AUDIO_EXTENSIONS.has(getExtension(name))
}

export function isMediaFile(name: string): boolean {
  return isVideoFile(name) || isAudioFile(name)
}
