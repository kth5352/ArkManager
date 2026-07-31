import { useMutation } from '@tanstack/react-query'
import type { GameCode } from '../../shared/types/scanner'

export function useOpenExternal() {
  return useMutation({
    mutationFn: (code: GameCode) => window.api.shell.openExternal(code),
  })
}

export function useShowItemInFolder() {
  return useMutation({
    mutationFn: (path: string) => window.api.shell.showItemInFolder(path),
  })
}
