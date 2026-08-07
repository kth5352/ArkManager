import { useMutation } from '@tanstack/react-query'
import type { SetMediaThumbnailFromFileResult } from '../../shared/types/ipc'

export function usePickMediaThumbnailFile() {
  return useMutation({
    mutationFn: (): Promise<string | null> => window.api.mediaThumbnail.pickFile(),
  })
}

export function useSetMediaThumbnailFromFile() {
  return useMutation({
    mutationFn: ({
      filePath,
      sourcePath,
    }: {
      filePath: string
      sourcePath: string
    }): Promise<SetMediaThumbnailFromFileResult> =>
      window.api.mediaThumbnail.setFromFile(filePath, sourcePath),
  })
}
