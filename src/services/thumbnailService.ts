import { useQuery } from '@tanstack/react-query'

export function useThumbnail(entryPath: string, kind: 'folder' | 'file') {
  return useQuery<string | null>({
    queryKey: ['thumbnail', entryPath],
    queryFn: () => window.api.scanner.getThumbnail(entryPath),
    enabled: kind === 'folder',
    staleTime: Infinity,
  })
}
