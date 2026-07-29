import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GameCode } from '../../shared/types/scanner'
import type { GameMetadataDto } from '../../shared/types/ipc'

function metadataQueryKey(code: GameCode) {
  return ['metadata', code.value] as const
}

export function useGameMetadata(code: GameCode | null) {
  return useQuery<GameMetadataDto | null>({
    queryKey: code ? metadataQueryKey(code) : ['metadata', 'none'],
    queryFn: () => window.api.metadata.get(code!),
    enabled: code !== null,
  })
}

export function useGameMetadataMany(codes: string[]) {
  return useQuery<Record<string, GameMetadataDto>>({
    queryKey: ['metadata-many', [...codes].sort()],
    queryFn: () => window.api.metadata.getMany(codes),
    enabled: codes.length > 0,
  })
}

export function useCrawlGameMetadata() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (code: GameCode) => window.api.metadata.crawlAndSave(code),
    onSuccess: (result, code) => {
      if (result) queryClient.setQueryData(metadataQueryKey(code), result)
    },
  })
}
