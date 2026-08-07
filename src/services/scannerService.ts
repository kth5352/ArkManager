import { useQuery } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'

export function useFolderScan(path: string, options?: { enabled?: boolean }) {
  return useQuery<ScannedEntry[]>({
    queryKey: ['folder-scan', path],
    queryFn: () => window.api.scanner.scanShallow(path),
    // ExplorerSidebar.tsx passes enabled: false for a collapsed tree node -
    // no reason to scan a folder nobody has expanded yet. Defaults to true
    // so FolderView.tsx's existing unconditional useFolderScan(path) call
    // (which always wants the active tab's folder scanned) is unaffected.
    enabled: options?.enabled ?? true,
    // Same mitigation as useGames - without this, staleTime: 0's default
    // refetch-on-mount/refocus re-runs a filesystem scan every time a tab
    // is revisited or the window regains focus.
    staleTime: 5 * 60_000,
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
    // Same mitigation as useGames/useFolderScan - a recursive scan is the
    // most expensive of the three, so paying staleTime: 0's refetch-on-
    // refocus cost here is even less justified.
    staleTime: 5 * 60_000,
  })
}
