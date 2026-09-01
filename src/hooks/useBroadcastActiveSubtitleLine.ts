import { useEffect, useRef } from 'react'
import { getActiveLyricLine, type ParsedLyrics } from '../lib/lrc'
import type { SubtitleLinePayload } from '../../shared/types/ipc'

export function computeSubtitleLinePayload(
  parsedLyrics: ParsedLyrics | null,
  currentTime: number,
  hasTrack: boolean
): SubtitleLinePayload {
  if (!hasTrack) return { kind: 'no-track' }
  if (!parsedLyrics || parsedLyrics.kind !== 'synced') return { kind: 'no-lyrics' }
  const active = getActiveLyricLine(parsedLyrics, currentTime)
  return active ? { kind: 'line', text: active.text } : { kind: 'no-active-line' }
}

export function payloadsEqual(a: SubtitleLinePayload, b: SubtitleLinePayload): boolean {
  if (a.kind !== b.kind) return false
  return a.kind === 'line' && b.kind === 'line' ? a.text === b.text : true
}

// PIP 창(subtitle-pip 라우트)에 "지금 활성화된 자막 줄"을 전송한다 - 재생
// 위치(currentTime) 자체는 여전히 창 간에 브로드캐스트하지 않는다(너무 잦음,
// mediaPlayerStore.ts의 기존 결정 유지) - 계산된 결과가 실제로 바뀔 때만
// 보낸다. isHost가 false면(이 창이 지금 재생을 호스팅하지 않음) 아무 것도
// 계산·전송하지 않는다 - 호스팅 중이 아닌 창은 currentTime이 멈춰있는 채로
// 남아있을 뿐 사라지지 않으므로, 이 가드 없이는 분리 전환 시점에 멈춰있는
// 값 기준의 활성 줄을 한 번 잘못 보내는 경쟁 상태가 생긴다.
export function useBroadcastActiveSubtitleLine(
  parsedLyrics: ParsedLyrics | null,
  currentTime: number,
  hasTrack: boolean,
  isHost: boolean
): void {
  const lastPayloadRef = useRef<SubtitleLinePayload | null>(null)

  useEffect(() => {
    if (!isHost) return
    const payload = computeSubtitleLinePayload(parsedLyrics, currentTime, hasTrack)
    if (lastPayloadRef.current && payloadsEqual(lastPayloadRef.current, payload)) return
    lastPayloadRef.current = payload
    window.api.media.broadcastSubtitleLine(payload)
  }, [parsedLyrics, currentTime, hasTrack, isHost])
}
