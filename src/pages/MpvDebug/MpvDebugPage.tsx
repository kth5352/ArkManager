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
    window.api.mpv.onFramePort((port) => {
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
    })
    return window.api.mpv.onStateUpdate(setState)
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
        <button className="border px-3 py-1" onClick={() => window.api.mpv.load(filePath)}>
          Load
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
