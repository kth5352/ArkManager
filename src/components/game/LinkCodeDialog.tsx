import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useLinkCode } from '../../services/gameUserDataService'
import { useCrawlGameMetadata } from '../../services/metadataService'
import { parseCodeInput } from '../../pages/DlsiteSearch/parseCodeInput'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface LinkCodeDialogProps {
  entry: ScannedEntry | null
  onClose: () => void
}

export function LinkCodeDialog({ entry, onClose }: LinkCodeDialogProps) {
  const [input, setInput] = useState('')
  const linkCode = useLinkCode()
  const crawlMetadata = useCrawlGameMetadata()

  const parsedCode = parseCodeInput(input)

  const handleConfirm = (): void => {
    if (!entry || !parsedCode) return
    linkCode.mutate(
      { path: entry.path, code: parsedCode },
      {
        onSuccess: () => {
          crawlMetadata.mutate(parsedCode)
          onClose()
        },
      }
    )
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>코드 연동 {entry ? `- ${entry.name}` : ''}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          폴더명을 직접 바꾸면 기존 즐겨찾기/평점 기록이 유지되지 않습니다. 데이터를 유지하려면
          여기서 코드를 연동하세요.
        </p>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="RJ01234567" />
        <Button onClick={handleConfirm} disabled={!parsedCode || linkCode.isPending}>
          연동
        </Button>
      </DialogContent>
    </Dialog>
  )
}
