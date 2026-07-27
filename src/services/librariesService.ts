import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LibraryWithStatus } from '../../shared/types/ipc'

export const LIBRARIES_QUERY_KEY = ['libraries'] as const

export function useLibraries() {
  return useQuery<LibraryWithStatus[]>({
    queryKey: LIBRARIES_QUERY_KEY,
    queryFn: () => window.api.libraries.list(),
  })
}

export function useAddLibrary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, path }: { name: string; path: string }) =>
      window.api.libraries.add(name, path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIBRARIES_QUERY_KEY })
    },
  })
}

export function useRemoveLibrary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.libraries.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIBRARIES_QUERY_KEY })
    },
  })
}

export function usePickLibraryFolder() {
  return useMutation({
    mutationFn: () => window.api.libraries.pickFolder(),
  })
}
