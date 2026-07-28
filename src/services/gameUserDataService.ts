import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'
import type { GameUserDataDto } from '../../shared/types/ipc'

function identifierKey(entry: Pick<ScannedEntry, 'code' | 'path'>): string {
  return entry.code ? entry.code.value : entry.path
}

function userDataQueryKey(entry: Pick<ScannedEntry, 'code' | 'path'>) {
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
      }))
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
