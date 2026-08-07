import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GameCode } from '../../shared/types/scanner'
import type {
  GameMetadataDto,
  MetadataSearchResultDto,
  MetadataSearchSource,
} from '../../shared/types/ipc'

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

export function useGameCoverImage(code: GameCode | null) {
  return useQuery<string | null>({
    queryKey: code ? ['metadata', 'cover-image', code.value] : ['metadata', 'cover-image', 'none'],
    queryFn: () => window.api.metadata.getCoverImage(code!),
    enabled: code !== null,
  })
}

export function useSearchMetadata(source: MetadataSearchSource) {
  return useMutation({
    mutationFn: (query: string): Promise<MetadataSearchResultDto[]> =>
      window.api.metadata.search(source, query),
  })
}

export function useCrawlGameMetadata() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (code: GameCode) => window.api.metadata.crawlAndSave(code),
    onSuccess: (result, code) => {
      if (result) queryClient.setQueryData(metadataQueryKey(code), result)
      // Gallery/List/DetailList read genre badges via useGameMetadataMany, whose
      // query key includes a per-call-site sorted codes array - invalidate by
      // prefix so every variation picks up the freshly crawled metadata.
      queryClient.invalidateQueries({ queryKey: ['metadata-many'] })
    },
  })
}
