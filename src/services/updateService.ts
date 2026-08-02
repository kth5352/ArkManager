import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { UpdateStatus } from '../../shared/types/ipc'

// Subscribes to the main process's update lifecycle (checking -> available
// -> downloading -> downloaded, or not-available/error) - pushed rather
// than polled since electron-updater's own check/download happen on its own
// schedule (including the silent startup check in updater.ts), not only in
// response to this window's own UPDATE_CHECK calls.
//
// Also seeds from getStatus() on mount - the silent startup check runs
// before the Settings page (the only place this hook is used) has ever
// mounted, so without this a completed background check is invisible until
// the user happens to trigger a new one themselves. receivedPushRef makes
// sure a push event that arrives while getStatus()'s own request is still
// in flight always wins over that now-stale response, rather than the
// slower getStatus() call clobbering fresher data once it resolves.
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const receivedPushRef = useRef(false)

  useEffect(() => {
    const unsubscribe = window.api.update.onStatus((next) => {
      receivedPushRef.current = true
      setStatus(next)
    })
    window.api.update.getStatus().then((initial) => {
      if (!receivedPushRef.current) setStatus(initial)
    })
    return unsubscribe
  }, [])

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
