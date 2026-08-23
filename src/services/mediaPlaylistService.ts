import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaPlaylistDto, MediaPlaylistTrackDto } from '../../shared/types/ipc'

export const MEDIA_PLAYLISTS_QUERY_KEY = ['media-playlists'] as const
export const mediaPlaylistTracksQueryKey = (id: string) => ['media-playlist-tracks', id] as const
export const LIKED_TRACKS_QUERY_KEY = ['media-track-likes'] as const
export const isTrackLikedQueryKey = (path: string) => ['media-track-liked', path] as const

export function useMediaPlaylists() {
  return useQuery<MediaPlaylistDto[]>({
    queryKey: MEDIA_PLAYLISTS_QUERY_KEY,
    queryFn: () => window.api.mediaPlaylist.list(),
  })
}

export function useMediaPlaylistTracks(id: string) {
  return useQuery<MediaPlaylistTrackDto[]>({
    queryKey: mediaPlaylistTracksQueryKey(id),
    queryFn: () => window.api.mediaPlaylist.getTracks(id),
  })
}

export function useCreateMediaPlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => window.api.mediaPlaylist.create(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEDIA_PLAYLISTS_QUERY_KEY }),
  })
}

export function useRenameMediaPlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      window.api.mediaPlaylist.rename(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEDIA_PLAYLISTS_QUERY_KEY }),
  })
}

export function useDeleteMediaPlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.mediaPlaylist.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEDIA_PLAYLISTS_QUERY_KEY }),
  })
}

export function useSetMediaPlaylistTracks(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tracks: MediaPlaylistTrackDto[]) => window.api.mediaPlaylist.setTracks(id, tracks),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaPlaylistTracksQueryKey(id) })
      queryClient.invalidateQueries({ queryKey: MEDIA_PLAYLISTS_QUERY_KEY })
    },
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
