import { useQuery } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'

export function useFolderScan(path: string) {
  return useQuery<ScannedEntry[]>({
    queryKey: ['folder-scan', path],
    queryFn: () => window.api.scanner.scanShallow(path),
  })
}

// Only fires when a search query is active (see FolderView.tsx) - reuses the
// same scanner:scan-recursive IPC endpoint Gallery/List/DetailList already
// use for whole-library scans, just rooted at a single arbitrary folder
// instead of a registered library path (scanLibraryRecursive accepts any
// path string, so this needs no new IPC channel).
export function useFolderScanRecursive(path: string, options: { enabled: boolean }) {
  return useQuery<ScannedEntry[]>({
    queryKey: ['folder-scan-recursive', path],
    queryFn: () => window.api.scanner.scanRecursive([path]),
    enabled: options.enabled,
  })
}
