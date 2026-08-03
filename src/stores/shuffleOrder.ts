// Fisher-Yates - unbiased, in-place on a copy so callers never see their
// input array mutated.
function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function allIndices(length: number): number[] {
  return Array.from({ length }, (_, i) => i)
}

// Used when shuffle mode is turned ON - the currently-playing track must
// stay playing, so it's pinned to position 0 (shufflePosition starts at 0
// to match) while every other track is shuffled behind it.
export function generateShuffleOrderKeepingFront(
  playlistLength: number,
  frontIndex: number
): number[] {
  const rest = allIndices(playlistLength).filter((i) => i !== frontIndex)
  return [frontIndex, ...shuffle(rest)]
}

// Used when a shuffle cycle finishes and a new one starts - the just-
// finished track must NOT be able to play twice in a row across the cycle
// boundary, so it's excluded from position 0 (swapped elsewhere if a plain
// shuffle happens to land it there). With only one track total there's no
// other position to put it, so it's returned as-is.
export function generateShuffleOrderAvoidingFront(
  playlistLength: number,
  avoidIndex: number
): number[] {
  const order = shuffle(allIndices(playlistLength))
  if (playlistLength <= 1 || order[0] !== avoidIndex) return order
  const swapWith = 1 + Math.floor(Math.random() * (order.length - 1))
  ;[order[0], order[swapWith]] = [order[swapWith], order[0]]
  return order
}
