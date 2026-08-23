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
// persist redundantly here. listLikedTracks can't return a `name` from
// this table alone; callers needing display names get them by joining
// against the same `MediaTrack[]` source the caller already scanned from,
// or the renderer can pass a name lookup - see mediaPlaylistService.ts's
// useLikedTracks for how the IPC layer resolves this.
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
