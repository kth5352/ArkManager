export interface MediaLyricsFile {
  path: string
  text: string
}

export function getMediaLyrics(filePath: string): Promise<MediaLyricsFile | null> {
  return window.api.mediaLyrics.get(filePath)
}
