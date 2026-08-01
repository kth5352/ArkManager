import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useClearCache() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (deleteSaveBackups: boolean) => window.api.cache.clear(deleteSaveBackups),
    onSuccess: () => {
      // Every crawled DLsite row (title/circle/genres/cover path) was just
      // wiped from game_metadata - without this, Gallery/List/DetailList and
      // the detail sidebar would keep showing whatever they last had cached
      // until each query's own staleTime happens to expire. useGameCoverImage
      // shares the 'metadata' key prefix, so this covers both.
      queryClient.invalidateQueries({ queryKey: ['metadata'] })
      queryClient.invalidateQueries({ queryKey: ['metadata-many'] })
    },
  })
}
