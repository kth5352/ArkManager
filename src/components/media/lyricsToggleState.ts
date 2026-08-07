export function isLyricsEnabledForTrack(
  trackPath: string | null,
  hasLyrics: boolean,
  disabledTrackPaths: Set<string>
): boolean {
  return trackPath !== null && hasLyrics && !disabledTrackPaths.has(trackPath)
}

export function toggleLyricsDisabledForTrack(
  trackPath: string,
  disabledTrackPaths: Set<string>
): Set<string> {
  const next = new Set(disabledTrackPaths)
  if (next.has(trackPath)) next.delete(trackPath)
  else next.add(trackPath)
  return next
}
