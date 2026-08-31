export const PLAYLIST_DETAIL_NARROW_BREAKPOINT = 560

export type PlaylistDetailWidthMode = 'wide' | 'narrow'

// 560px is the measured lower bound at which the wide layout's fixed
// ~200px cover panel plus a minimally-usable track list still physically
// fit - see docs/superpowers/specs/2026-08-26-playlist-thumbnail-detail-view-design.md
// section 6 for the derivation (this app's 720px minimum window width minus
// the media sidebar's maximum 480px width lands right around this value).
export function getPlaylistDetailWidthMode(width: number): PlaylistDetailWidthMode {
  return width < PLAYLIST_DETAIL_NARROW_BREAKPOINT ? 'narrow' : 'wide'
}
