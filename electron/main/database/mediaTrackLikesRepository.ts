import { desc, eq, sql } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { mediaTrackLikes } from './schema'

export function isTrackLiked(db: AppDatabase, path: string): boolean {
  return db.select().from(mediaTrackLikes).where(eq(mediaTrackLikes.path, path)).get() !== undefined
}

// Toggles like state for a single track - callers don't need to know the
// current state first (mirrors toggleFavorite's callers elsewhere in this
// codebase, which pass the NEXT desired state; this instead flips
// unconditionally since the renderer's one call site always wants "the
// opposite of whatever it is now").
export function toggleTrackLike(db: AppDatabase, path: string, name: string): void {
  const existing = db.select().from(mediaTrackLikes).where(eq(mediaTrackLikes.path, path)).get()
  if (existing) {
    db.delete(mediaTrackLikes).where(eq(mediaTrackLikes.path, path)).run()
    return
  }
  db.insert(mediaTrackLikes).values({ path, likedAt: new Date().toISOString() }).run()
  void name // name isn't stored - see listLikedTracks's own comment
}

// media_track_likes only stores `path` - the track's display name is
// whatever the caller already knows (the row that owns the heart button
// always already has the track's name in hand), so there's nothing to
// persist redundantly here. `name` is accepted by toggleTrackLike above
// purely for API-shape symmetry with sibling endpoints that DO need a name
// (e.g. setMediaPlaylistTracks) - it's discarded (`void name`), not
// resolved anywhere. listLikedTracks below returns bare `{path}[]`;
// mediaPlaylistService.ts's useLikedTracks passes that straight through
// with no name resolution of its own - callers needing a display name
// currently just derive one from the path itself (e.g.
// PlaylistManagementTab.tsx's `path.split(/[\\/]/).pop()`).
// Tiebreak on rowid (same pattern as gameUserDataRepository.ts's
// listRecentlyPlayed) - likedAt is an ISO string with millisecond
// precision, and two toggles in quick succession (e.g. back-to-back in a
// test, or a fast double-click in the app) can land in the same
// millisecond, making ORDER BY likedAt alone non-deterministic for ties.
// rowid always increases with insertion order within a session, so it
// recovers "most-recently-liked first" exactly when timestamps tie.
export function listLikedTracks(db: AppDatabase): { path: string }[] {
  return db
    .select({ path: mediaTrackLikes.path })
    .from(mediaTrackLikes)
    .orderBy(desc(mediaTrackLikes.likedAt), desc(sql`rowid`))
    .all()
}
