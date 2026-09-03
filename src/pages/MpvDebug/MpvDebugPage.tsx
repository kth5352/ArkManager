import { useEffect, useRef, useState } from 'react'

export function MpvDebugPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [filePath, setFilePath] = useState('')
  const [state, setState] = useState<{ isPlaying: boolean; currentTime: number; duration: number | null }>({
    isPlaying: false,
    currentTime: 0,
    duration: null,
  })

  useEffect(() => {
    // The mpv frame-delivery MessagePort cannot be handed across
    // contextBridge (see electron/preload/index.ts's long comment on the
    // `mpv` namespace) - preload only relays it via window.postMessage, so
    // this main-world code must listen for that relay directly with a
    // plain DOM API, not through window.api.
    const handleMessage = (event: MessageEvent): void => {
      if (event.source !== window || event.data !== 'mpv-frame-port-relay' || !event.ports[0]) return
      const port = event.ports[0]
      port.onmessage = (e: MessageEvent) => {
        const { frame, width, height } = e.data as { frame: ArrayBuffer; width: number; height: number }
        const canvas = canvasRef.current
        if (!canvas) return
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const imageData = new ImageData(new Uint8ClampedArray(frame), width, height)
        ctx.putImageData(imageData, 0, 0)
      }
    }
    window.addEventListener('message', handleMessage)
    const unsubscribeStateUpdate = window.api.mpv.onStateUpdate(setState)
    return () => {
      window.removeEventListener('message', handleMessage)
      unsubscribeStateUpdate()
    }
  }, [])

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-bold">mpv debug harness (Plan A verification only)</h1>
      <input
        className="border px-2 py-1"
        value={filePath}
        onChange={(e) => setFilePath(e.target.value)}
        placeholder="D:\path\to\file.mp4"
      />
      <div className="flex gap-2">
        {/* isVideo is hardcoded per-button rather than sniffed - this is a
            throwaway harness, and two buttons is the cheapest way to exercise
            both sides of the worker's isVideo gate by hand. */}
        <button className="border px-3 py-1" onClick={() => window.api.mpv.load(filePath, true)}>
          Load (video)
        </button>
        <button className="border px-3 py-1" onClick={() => window.api.mpv.load(filePath, false)}>
          Load (audio-only)
        </button>
        <button className="border px-3 py-1" onClick={() => window.api.mpv.play()}>
          Play
        </button>
        <button className="border px-3 py-1" onClick={() => window.api.mpv.pause()}>
          Pause
        </button>
        <button className="border px-3 py-1" onClick={() => window.api.mpv.seek(30)}>
          Seek to 30s
        </button>
        <button className="border px-3 py-1" onClick={() => window.api.mpv.setVolume(0.5)}>
          Volume 50%
        </button>
      </div>
      <p>
        isPlaying: {String(state.isPlaying)} | currentTime: {state.currentTime.toFixed(1)} | duration:{' '}
        {state.duration?.toFixed(1) ?? 'unknown'}
      </p>
      <canvas ref={canvasRef} className="border" style={{ width: 640, height: 360 }} />
    </div>
  )
}
