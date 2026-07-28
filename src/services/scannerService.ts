import { useQuery } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'

export function useFolderScan(path: string) {
  return useQuery<ScannedEntry[]>({
    queryKey: ['folder-scan', path],
    queryFn: () => window.api.scanner.scanShallow(path),
  })
}
