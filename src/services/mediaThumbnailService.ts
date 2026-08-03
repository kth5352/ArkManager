import { useMutation } from '@tanstack/react-query'

export function usePickMediaThumbnailFile() {
  return useMutation({
    mutationFn: (): Promise<string | null> => window.api.mediaThumbnail.pickFile(),
  })
}

export function useSetMediaThumbnailFromFile() {
  return useMutation({
    mutationFn: ({ filePath, sourcePath }: { filePath: string; sourcePath: string }) =>
      window.api.mediaThumbnail.setFromFile(filePath, sourcePath),
  })
}
