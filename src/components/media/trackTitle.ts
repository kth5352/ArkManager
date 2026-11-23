// mpv's `media-title` falls back to the file name when a file has no title
// tag, so an equal value means "no real title" - show the extension-less file
// name instead of a name that still carries ".mp3".
export function displayTitle(mediaTitle: string | null, fileName: string): string {
  if (mediaTitle && mediaTitle !== fileName) return mediaTitle
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

// A state update describes the track the worker had loaded when it was
// produced. After a track change a late update of the previous track can still
// arrive, so its title/identity may only be adopted when its loadedPath is the
// exact string the renderer sent for the CURRENT track.
export function shouldAdoptLoadIdentity(
  updateLoadedPath: string | null,
  currentTrackPath: string
): boolean {
  return updateLoadedPath !== null && updateLoadedPath === currentTrackPath
}
