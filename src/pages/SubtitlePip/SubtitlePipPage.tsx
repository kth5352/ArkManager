import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '../../i18n/useTranslation'
import type { SubtitleLinePayload } from '../../../shared/types/ipc'

// #/subtitle-pip에서 로드되는, 이 창의 전체 콘텐츠(main.tsx 참고 - AppLayout/
// 라우터를 거치지 않고 직접 마운트된다, PlayerWindowPage.tsx와 동일한 패턴).
// Zustand 스토어를 전혀 구독하지 않는다 - 재생 상태 전체가 필요 없고, 오직
// SUBTITLE_PIP_LINE_UPDATE로 받은 값을 그대로 표시하기만 한다. 마지막으로
// 받은 'line' 텍스트를 별도로 기억해뒀다가 'no-active-line'(일시정지 등으로
// 지금 이 순간 활성 줄이 없음)을 받으면 그 값을 계속 보여준다 - 브레인스토밍
// 확정 사항("일시정지 중엔 마지막 줄 유지").
export function SubtitlePipPage() {
  const { t } = useTranslation()
  const [payload, setPayload] = useState<SubtitleLinePayload>({ kind: 'no-track' })
  const [lastLineText, setLastLineText] = useState<string | null>(null)

  useEffect(() => {
    return window.api.media.onSubtitlePipLineUpdate((next) => {
      setPayload(next)
      if (next.kind === 'line') setLastLineText(next.text)
    })
  }, [])

  const displayText =
    payload.kind === 'line'
      ? payload.text
      : payload.kind === 'no-active-line' && lastLineText !== null
        ? lastLineText
        : payload.kind === 'no-lyrics'
          ? t('media.subtitlePipNoLyrics')
          : payload.kind === 'no-track'
            ? t('media.subtitlePipNoTrack')
            : null

  if (!displayText) return null

  return (
    <div
      style={{ WebkitAppRegion: 'drag', userSelect: 'none' } as CSSProperties}
      className="flex h-screen w-screen items-center justify-center p-2"
    >
      <div
        className="max-w-full rounded-lg px-4 py-2 text-center text-base font-semibold text-white"
        style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
      >
        {displayText}
      </div>
    </div>
  )
}
