import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { UpdateStatus } from '../../shared/types/ipc'

// Subscribes to the main process's update lifecycle (checking -> available
// -> downloading -> downloaded, or not-available/error) - pushed rather
// than polled since electron-updater's own check/download happen on its own
// schedule (including the silent startup check in updater.ts), not only in
// response to this window's own UPDATE_CHECK calls.
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => window.api.update.onStatus(setStatus), [])
  return status
}

export function useAppVersion() {
  return useQuery({
    queryKey: ['app-version'],
    queryFn: () => window.api.update.getVersion(),
    staleTime: Infinity,
  })
}

export function useCheckForUpdates() {
  return useMutation({
    mutationFn: () => window.api.update.check(),
  })
}

// Quits and installs the already-downloaded update - only meaningful once
// useUpdateStatus() reports { state: 'downloaded' }.
export function useInstallUpdate() {
  return useMutation({
    mutationFn: () => window.api.update.install(),
  })
}
