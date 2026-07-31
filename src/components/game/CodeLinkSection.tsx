import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useLinkCode, useUnlinkCode } from '../../services/gameUserDataService'
import { useCrawlGameMetadata } from '../../services/metadataService'
import { parseCodeInput } from '../../pages/DlsiteSearch/parseCodeInput'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface CodeLinkSectionProps {
  game: ScannedEntry
}

// Collapsible, starts collapsed. Branches on the same 3 resolveCode cases
// DetailOverlay's button visibility already relies on: no code -> link
// form, override-linked code -> unlink control, filename-derived code ->
// no action available (LinkCodeDialog/UnlinkCodeDialog were never reachable
// for that case either - this just also explains why, instead of showing
// nothing at all).
export function CodeLinkSection({ game }: CodeLinkSectionProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-t border-border pt-3">
      <button
        className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground"
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        코드 연동 관리
      </button>
      {expanded &&
        (game.code && game.codeSource === 'override' ? (
          <UnlinkSection game={game} />
        ) : !game.code ? (
          <LinkSection game={game} />
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            파일명에서 인식된 코드는 연동 해제를 지원하지 않습니다.
          </p>
        ))}
    </div>
  )
}

function LinkSection({ game }: { game: ScannedEntry }) {
  const [input, setInput] = useState('')
  const [confirming, setConfirming] = useState(false)
  const linkCode = useLinkCode()
  const crawlMetadata = useCrawlGameMetadata()

  const parsedCode = parseCodeInput(input)

  const handleConfirm = (): void => {
    if (!parsedCode) return
    linkCode.mutate(
      { path: game.path, code: parsedCode },
      {
        onSuccess: () => {
          crawlMetadata.mutate(parsedCode)
          setConfirming(false)
          setInput('')
        },
      }
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {!confirming ? (
        <>
          <p className="text-xs text-muted-foreground">
            폴더명을 직접 바꾸면 기존 즐겨찾기/평점 기록이 유지되지 않습니다. 데이터를 유지하려면
            여기서 코드를 연동하세요.
          </p>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="RJ01234567"
            className="h-8 text-xs"
          />
          <Button size="sm" onClick={() => setConfirming(true)} disabled={!parsedCode}>
            다음
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs">
            <span className="font-medium">{parsedCode?.value}</span>(으)로 연동합니다. 잘못
            연동했다면 나중에 &quot;연동 해제&quot;로 연동을 해제할 수 있습니다.
          </p>
          {linkCode.isError && (
            <p className="text-xs text-destructive">연동에 실패했습니다. 다시 시도해주세요.</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              뒤로
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={!parsedCode || linkCode.isPending}>
              연동 확정
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function UnlinkSection({ game }: { game: ScannedEntry }) {
  const [confirming, setConfirming] = useState(false)
  const unlinkCode = useUnlinkCode()

  const handleConfirm = (): void => {
    unlinkCode.mutate({ path: game.path }, { onSuccess: () => setConfirming(false) })
  }

  if (!confirming) {
    return (
      <div className="mt-2">
        <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          연동 해제
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-xs">
        <span className="font-medium">{game.code?.value}</span> 연동을 해제합니다. 이후 이 폴더는
        다시 코드없는 항목으로 표시됩니다.
      </p>
      <p className="text-xs text-muted-foreground">
        지금까지 쌓인 즐겨찾기·평점·메모·플레이타임 기록은 삭제되지 않고 {game.code?.value} 코드에
        그대로 남습니다. 같은 코드로 다시 연동하면 기록이 복원되지만, 다른 코드로 연동하면 이 기록을
        다시 찾을 수 없게 됩니다.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
          취소
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={unlinkCode.isPending}>
          연동 해제
        </Button>
      </div>
    </div>
  )
}
