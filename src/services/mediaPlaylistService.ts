import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaPlaylistDto, MediaPlaylistTrackDto } from '../../shared/types/ipc'
import { appToast } from '../lib/appToast'
import { useTranslation } from '../i18n/useTranslation'

export const MEDIA_PLAYLISTS_QUERY_KEY = ['media-playlists'] as const
// "좋아요" 가상 재생목록을 가리키는 합성 ID - media_playlists에 실제 행이
// 없으므로 진짜 UUID와 절대 충돌하지 않는다. PlaylistManagementTab.tsx가
// 이 값으로 selectedPlaylistId를 설정하면, PlaylistDetailView가 이를 보고
// useLikedTracks()로 트랙을 가져오는 읽기 전용 변형을 렌더링한다.
export const LIKED_PLAYLIST_ID = 'liked'
export const mediaPlaylistTracksQueryKey = (id: string) => ['media-playlist-tracks', id] as const
export const LIKED_TRACKS_QUERY_KEY = ['media-track-likes'] as const
export const isTrackLikedQueryKey = (path: string) => ['media-track-liked', path] as const

export function useMediaPlaylists() {
  return useQuery<MediaPlaylistDto[]>({
    queryKey: MEDIA_PLAYLISTS_QUERY_KEY,
    queryFn: () => window.api.mediaPlaylist.list(),
  })
}

export function useMediaPlaylistTracks(id: string, options?: { enabled?: boolean }) {
  return useQuery<MediaPlaylistTrackDto[]>({
    queryKey: mediaPlaylistTracksQueryKey(id),
    queryFn: () => window.api.mediaPlaylist.getTracks(id),
    enabled: options?.enabled ?? true,
    // This is locally-stored SQLite data that only ever changes from inside
    // this same app (via useSetMediaPlaylistTracks, which already
    // invalidates this exact query key on success) - nothing external can
    // mutate it out from under the cache. Without a staleTime, the default
    // refetchOnWindowFocus=true (see main.tsx's default QueryClient) means
    // every time the Electron window regains focus while a playlist is
    // expanded, a background refetch briefly flips tracksQuery.isFetching
    // true, which PlaylistManagementTab.tsx's UserPlaylistRow uses to guard
    // remove/reorder - a visible button flicker, and a window where an
    // in-flight drag can silently no-op. 5s is short enough that a genuine
    // external edit (there is none today) would still show up almost
    // immediately, while comfortably covering the normal
    // click-away-and-back window-focus case.
    staleTime: 5_000,
  })
}

// onError toasts below are the only user-facing error feedback anywhere in
// the playlist CRUD flows (create/rename/delete/remove-track/reorder/
// add-to-saved-playlist all funnel through these four hooks - see each
// hook's call sites in PlaylistManagementTab.tsx and
// AddToSavedPlaylistDialog.tsx) - before this, a failed mutation just did
// nothing visible beyond the existing disabled-state feedback. Wired here at
// the hook level (rather than at each call site) since both of those files
// share these exact hooks and the failure message is the same regardless of
// which one triggered it.

export function useCreateMediaPlaylist() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: (name: string) => window.api.mediaPlaylist.create(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEDIA_PLAYLISTS_QUERY_KEY }),
    onError: () => appToast.error(t('media.createPlaylistFailed')),
  })
}

export function useRenameMediaPlaylist() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      window.api.mediaPlaylist.rename(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEDIA_PLAYLISTS_QUERY_KEY }),
    onError: () => appToast.error(t('media.renamePlaylistFailed')),
  })
}

export function useDeleteMediaPlaylist() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: (id: string) => window.api.mediaPlaylist.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEDIA_PLAYLISTS_QUERY_KEY }),
    onError: () => appToast.error(t('media.deletePlaylistFailed')),
  })
}

export function useSetMediaPlaylistTracks(id: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: (tracks: MediaPlaylistTrackDto[]) => window.api.mediaPlaylist.setTracks(id, tracks),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaPlaylistTracksQueryKey(id) })
      queryClient.invalidateQueries({ queryKey: MEDIA_PLAYLISTS_QUERY_KEY })
    },
    onError: () => appToast.error(t('media.updatePlaylistTracksFailed')),
  })
}

export function useIsTrackLiked(path: string) {
  return useQuery<boolean>({
    queryKey: isTrackLikedQueryKey(path),
    queryFn: () => window.api.mediaPlaylist.isTrackLiked(path),
  })
}

export function useLikedTracks() {
  return useQuery<{ path: string }[]>({
    queryKey: LIKED_TRACKS_QUERY_KEY,
    queryFn: () => window.api.mediaPlaylist.listLikedTracks(),
  })
}

export function useToggleTrackLike() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, name }: { path: string; name: string }) =>
      window.api.mediaPlaylist.toggleTrackLike(path, name),
    onSuccess: (_data, { path }) => {
      queryClient.invalidateQueries({ queryKey: isTrackLikedQueryKey(path) })
      queryClient.invalidateQueries({ queryKey: LIKED_TRACKS_QUERY_KEY })
    },
  })
}

export function usePickPlaylistCoverFile() {
  return useMutation({
    mutationFn: (): Promise<string | null> => window.api.mediaPlaylist.pickCoverFile(),
  })
}

export function useSetPlaylistCover() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ playlistId, sourcePath }: { playlistId: string; sourcePath: string }) =>
      window.api.mediaPlaylist.setCover(playlistId, sourcePath),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEDIA_PLAYLISTS_QUERY_KEY }),
  })
}

export function useClearPlaylistCover() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playlistId: string) => window.api.mediaPlaylist.clearCover(playlistId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEDIA_PLAYLISTS_QUERY_KEY }),
  })
}
