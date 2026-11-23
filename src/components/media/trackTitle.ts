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

// An `ended` carries the identity of the load that reached EOF. If the user
// changed track in the same tick, the worker can post the PREVIOUS track's
// `ended` after the renderer already moved on; acting on it would skip the new
// track (or seek it to 0 under repeat-one). A null path has no load context
// and keeps the plain behavior.
export function shouldHandleEnded(
  endedLoadedPath: string | null,
  currentTrackPath: string | null
): boolean {
  return endedLoadedPath === null || endedLoadedPath === currentTrackPath
}
