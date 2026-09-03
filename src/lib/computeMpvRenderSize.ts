// Converts a canvas element's CSS box size into the pixel dimensions to
// request mpv render at - matches device pixels 1:1 (like devicePixelRatio-
// aware canvas sizing everywhere else), clamped to a sane minimum so a
// ResizeObserver firing during initial layout (before the container has a
// real size) never requests a degenerate 0x0 or 1x1 render.
export function computeMpvRenderSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number
): { width: number; height: number } {
  const width = Math.max(2, Math.round(cssWidth * devicePixelRatio))
  const height = Math.max(2, Math.round(cssHeight * devicePixelRatio))
  return { width, height }
}
