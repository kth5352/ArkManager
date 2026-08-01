import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useLinkCode, useUnlinkCode } from '../../services/gameUserDataService'
import { useCrawlGameMetadata } from '../../services/metadataService'
import { parseCodeInput } from '../../pages/DlsiteSearch/parseCodeInput'
import { useTranslation } from '../../i18n/useTranslation'
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
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-t border-border pt-3">
      <button
        className="flex w-full items-center gap-1 text-xs font-medium text-muted-foreground"
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        {t('codeLink.manage')}
      </button>
      {expanded &&
        (game.code && game.codeSource === 'override' ? (
          <UnlinkSection game={game} />
        ) : !game.code ? (
          <LinkSection game={game} />
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t('codeLink.filenameCodeNoUnlink')}</p>
        ))}
    </div>
  )
}

function LinkSection({ game }: { game: ScannedEntry }) {
  const { t } = useTranslation()
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
          <p className="text-xs text-muted-foreground">{t('codeLink.linkHint')}</p>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('codeLink.codePlaceholder')}
            className="h-8 text-xs"
          />
          <Button size="sm" onClick={() => setConfirming(true)} disabled={!parsedCode}>
            {t('codeLink.next')}
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs">
            {t('codeLink.confirmLinkMessage', { code: parsedCode?.value ?? '' })}
          </p>
          {linkCode.isError && (
            <p className="text-xs text-destructive">{t('codeLink.linkFailed')}</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              {t('codeLink.back')}
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={!parsedCode || linkCode.isPending}>
              {t('codeLink.confirmLink')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function UnlinkSection({ game }: { game: ScannedEntry }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const unlinkCode = useUnlinkCode()

  const handleConfirm = (): void => {
    unlinkCode.mutate({ path: game.path }, { onSuccess: () => setConfirming(false) })
  }

  if (!confirming) {
    return (
      <div className="mt-2">
        <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          {t('codeLink.unlink')}
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-xs">
        {t('codeLink.confirmUnlinkMessage1', { code: game.code?.value ?? '' })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('codeLink.confirmUnlinkMessage2', { code: game.code?.value ?? '' })}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={unlinkCode.isPending}>
          {t('codeLink.unlink')}
        </Button>
      </div>
    </div>
  )
}
