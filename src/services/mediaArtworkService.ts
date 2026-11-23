import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaCoverInfo } from '../../shared/types/ipc'

const COVER_INFO_KEY = 'media-cover-info'

// Cover/accent/aspect info for one media file. Refetched (with a new
// `version`) whenever main reports that file's artwork - or every work cover
// (filePath null) - changed.
export function useMediaCoverInfo(filePath: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    return window.api.media.onArtworkChanged(({ filePath: changed }) => {
      void queryClient.invalidateQueries({
        queryKey: changed === null ? [COVER_INFO_KEY] : [COVER_INFO_KEY, changed],
      })
    })
  }, [queryClient])

  return useQuery<MediaCoverInfo>({
    queryKey: [COVER_INFO_KEY, filePath],
    queryFn: () => window.api.media.getCoverInfo(filePath as string),
    enabled: filePath !== null,
  })
}
