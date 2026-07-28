import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SortPage, SortPreference } from '../../shared/types/ipc'

function sortQueryKey(page: SortPage) {
  return ['sort', page] as const
}

const DEFAULT_SORT: SortPreference = { field: 'name', direction: 'asc' }

export function useSortPreference(page: SortPage) {
  const queryClient = useQueryClient()

  const { data } = useQuery<SortPreference | null>({
    queryKey: sortQueryKey(page),
    queryFn: () => window.api.sort.get(page),
  })

  const setSortMutation = useMutation({
    mutationFn: (preference: SortPreference) =>
      window.api.sort.set(page, preference.field, preference.direction),
    onSuccess: (_result, preference) => {
      queryClient.setQueryData(sortQueryKey(page), preference)
    },
  })

  const preference = data ?? DEFAULT_SORT

  return {
    field: preference.field,
    direction: preference.direction,
    setSort: (field: SortPreference['field'], direction: SortPreference['direction']) =>
      setSortMutation.mutate({ field, direction }),
  }
}
