import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'
import type { GameCode } from '../../shared/types/scanner'
import type { GameUserDataDto } from '../../shared/types/ipc'

function identifierKey(entry: Pick<ScannedEntry, 'code' | 'path'>): string {
  return entry.code ? entry.code.value : entry.path
}

export function userDataQueryKey(entry: Pick<ScannedEntry, 'code' | 'path'>) {
  return ['game-user-data', identifierKey(entry)] as const
}

export function useGameUserData(entry: Pick<ScannedEntry, 'code' | 'path'>) {
  return useQuery<GameUserDataDto | null>({
    queryKey: userDataQueryKey(entry),
    queryFn: () => window.api.gameUserData.get(entry.code, entry.path),
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      entry,
      isFavorite,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      isFavorite: boolean
    }) => window.api.gameUserData.setFavorite(entry.code, entry.path, isFavorite),
    onSuccess: (_result, { entry, isFavorite }) => {
      queryClient.setQueryData<GameUserDataDto | null>(userDataQueryKey(entry), (prev) => ({
        isFavorite,
        rating: prev?.rating ?? null,
        memo: prev?.memo ?? null,
        totalPlaytimeMs: prev?.totalPlaytimeMs ?? 0,
      }))
      queryClient.invalidateQueries({ queryKey: ['game-user-data', 'favorite-keys'] })
    },
  })
}

export function useSetRatingAndMemo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      entry,
      rating,
      memo,
    }: {
      entry: Pick<ScannedEntry, 'code' | 'path'>
      rating: number | null
      memo: string | null
    }) => window.api.gameUserData.setRatingAndMemo(entry.code, entry.path, rating, memo),
    onSuccess: (_result, { entry, rating, memo }) => {
      queryClient.setQueryData<GameUserDataDto | null>(userDataQueryKey(entry), (prev) => ({
        isFavorite: prev?.isFavorite ?? false,
        rating,
        memo,
        totalPlaytimeMs: prev?.totalPlaytimeMs ?? 0,
      }))
    },
  })
}

export function useFavoriteKeys() {
  return useQuery<string[]>({
    queryKey: ['game-user-data', 'favorite-keys'],
    queryFn: () => window.api.gameUserData.listFavoriteKeys(),
  })
}

export function useRecentlyPlayed() {
  return useQuery<{ key: string; lastPlayedAt: string }[]>({
    queryKey: ['game-user-data', 'recently-played'],
    queryFn: () => window.api.gameUserData.listRecentlyPlayed(),
  })
}

export function useLinkCode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, code }: { path: string; code: GameCode }) =>
      window.api.gameUserData.linkCode(path, code),
    onSuccess: () => {
      // The linked entry's identity changed (path-keyed -> code-keyed), and
      // its ScannedEntry.code will only reflect that after a rescan - the
      // simplest correct invalidation is all three caches that could now be
      // stale: this entry's own user-data cache (key changed), the
      // favorite/recently-played lists (could now show under a new key),
      // and the live scan results Gallery/List/DetailList/Explorer read.
      queryClient.invalidateQueries({ queryKey: ['game-user-data'] })
      queryClient.invalidateQueries({ queryKey: ['games'] })
      queryClient.invalidateQueries({ queryKey: ['folder-scan'] })
    },
  })
}
