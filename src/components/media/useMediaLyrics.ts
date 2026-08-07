import { useQuery } from '@tanstack/react-query'
import { getMediaLyrics } from '../../services/mediaLyricsService'

export function useMediaLyrics(trackPath: string | null) {
  return useQuery({
    queryKey: ['media-lyrics', trackPath],
    queryFn: () => getMediaLyrics(trackPath!),
    enabled: trackPath !== null,
  })
}
