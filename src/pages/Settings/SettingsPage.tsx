import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog'
import { HoverTooltip } from '../../components/ui/hover-tooltip'
import { SettingsSection } from './SettingsSection'
import { UI_MOTION } from '../../lib/motion'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import {
  useAddLibrary,
  useLibraries,
  usePickLibraryFolder,
  useRemoveLibrary,
} from '../../services/librariesService'
import { useClearCache } from '../../services/cacheService'
import {
  LOCALE_EMULATOR_AVAILABLE_QUERY_KEY,
  useLocaleEmulatorAvailable,
  usePickLocaleEmulatorPath,
} from '../../services/launchService'
import {
  useLanguageQuery,
  useLocaleEmulatorPathQuery,
  useExternalMetadataProviderSettings,
  useSetLanguageMutation,
  useSetExternalMetadataProviderSettings,
  useSetLocaleEmulatorPathMutation,
  useSetWindowCloseBehaviorMutation,
  useWindowCloseBehaviorQuery,
} from '../../services/settingsService'
import {
  useAppVersion,
  useCheckForUpdates,
  useInstallUpdate,
  useUpdateStatus,
} from '../../services/updateService'
import { useTranslation } from '../../i18n/useTranslation'
import { deriveNameFromPath } from '../../lib/deriveNameFromPath'
import { useState, type DragEvent } from 'react'
import type {
  Locale,
  ReleaseNote,
  UpdateStatus,
  WindowCloseBehavior,
} from '../../../shared/types/ipc'
import type { ExternalMetadataProviderSettings } from '../../services/settingsService'

function AddLibraryDialog() {
  const { t } = useTranslation()
  const librarySchema = z.object({
    name: z.string(),
    path: z.string().min(1, t('settings.pathRequired')),
  })
  type LibraryFormValues = z.infer<typeof librarySchema>

  const [open, setOpen] = useState(false)
  const addLibrary = useAddLibrary()
  const pickFolder = usePickLibraryFolder()
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<LibraryFormValues>({ resolver: zodResolver(librarySchema) })

  const onSubmit = (values: LibraryFormValues): void => {
    const name = values.name.trim() !== '' ? values.name.trim() : deriveNameFromPath(values.path)
    addLibrary.mutate(
      { name, path: values.path },
      {
        onSuccess: () => {
          reset()
          setOpen(false)
        },
      }
    )
  }

  const handlePickFolder = async (): Promise<void> => {
    const path = await pickFolder.mutateAsync()
    if (path) setValue('path', path, { shouldValidate: true })
  }

  const [isDragOver, setIsDragOver] = useState(false)

  const handleDrop = (e: DragEvent<HTMLFormElement>): void => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const path = window.api.libraries.getPathForFile(file)
    if (path) setValue('path', path, { shouldValidate: true })
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) reset()
    addLibrary.reset()
    setOpen(nextOpen)
  }

  const addLibraryErrorMessage = addLibrary.isError
    ? /UNIQUE constraint/i.test(addLibrary.error.message)
      ? t('settings.duplicatePath')
      : t('settings.addLibraryFailed')
    : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>{t('settings.addLibrary')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.newLibrary')}</DialogTitle>
        </DialogHeader>
        <form
          className={`flex flex-col gap-4 rounded-md border-2 border-dashed p-2 transition-colors ${
            isDragOver ? 'border-primary bg-accent' : 'border-transparent'
          }`}
          onSubmit={handleSubmit(onSubmit)}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <Input placeholder={t('settings.namePlaceholder')} {...register('name')} />
          <div className="flex gap-2">
            <Input placeholder={t('settings.pathPlaceholder')} {...register('path')} />
            <Button type="button" variant="secondary" onClick={handlePickFolder}>
              {t('settings.pickFolder')}
            </Button>
          </div>
          {errors.path && <p className="-mt-2 text-xs text-destructive">{errors.path.message}</p>}
          <p className="-mt-2 text-xs text-muted-foreground">{t('settings.dragHint')}</p>
          {addLibraryErrorMessage && (
            <p className="-mt-2 text-xs text-destructive">{addLibraryErrorMessage}</p>
          )}
          <Button type="submit">{t('common.save')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ClearCacheDialog() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [deleteSaveBackups, setDeleteSaveBackups] = useState(false)
  const clearCache = useClearCache()

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) setDeleteSaveBackups(false)
    clearCache.reset()
    setOpen(nextOpen)
  }

  const handleConfirm = (): void => {
    clearCache.mutate(deleteSaveBackups, { onSuccess: () => setOpen(false) })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive">{t('settings.clearCache')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.clearCache')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <p>{t('settings.clearCacheDesc1')}</p>
          <p className="text-muted-foreground">{t('settings.clearCacheDesc2')}</p>
          <label className="flex items-start gap-2 rounded-md border border-border p-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={deleteSaveBackups}
              onChange={(e) => setDeleteSaveBackups(e.target.checked)}
            />
            <span>
              <span className="block font-medium">{t('settings.deleteSaveBackupsLabel')}</span>
              <span className="block text-xs text-muted-foreground">
                {t('settings.deleteSaveBackupsDesc')}
              </span>
            </span>
          </label>
          {clearCache.isError && (
            <p className="text-xs text-destructive">{t('settings.clearCacheFailed')}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleConfirm} disabled={clearCache.isPending}>
              {clearCache.isPending ? t('common.deleting') : t('common.delete')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Unlike ClearCacheDialog (which only deletes derived/regenerable cache
// data), removing a library here drops its registration outright with no
// way to undo it from the UI - matches the confirm-before-destructive-action
// pattern already established by DeletePlaylistConfirmDialog.tsx.
function RemoveLibraryConfirmDialog({
  library,
  onClose,
}: {
  library: { id: string; name: string } | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const removeLibrary = useRemoveLibrary()

  const handleConfirm = (): void => {
    if (!library) return
    removeLibrary.mutate(library.id, { onSuccess: onClose })
  }

  return (
    <Dialog open={library !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.removeLibraryConfirmTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {library && t('settings.removeLibraryConfirmBody', { name: library.name })}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={removeLibrary.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={removeLibrary.isPending}>
            {removeLibrary.isPending ? t('common.deleting') : t('common.delete')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LocaleEmulatorSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: available, isLoading: isCheckingAvailable } = useLocaleEmulatorAvailable()
  const { data: overridePath = '' } = useLocaleEmulatorPathQuery()
  const setPath = useSetLocaleEmulatorPathMutation()
  const pickPath = usePickLocaleEmulatorPath()

  // Auto-detect only checks known install folders (Program Files, per-user
  // Programs) - a custom install location needs this manual override, since
  // there's no officially documented registry key to search instead.
  const handlePick = async (): Promise<void> => {
    const path = await pickPath.mutateAsync()
    if (!path) return
    setPath.mutate(path, {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: LOCALE_EMULATOR_AVAILABLE_QUERY_KEY }),
    })
  }

  const handleReset = (): void => {
    setPath.mutate('', {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: LOCALE_EMULATOR_AVAILABLE_QUERY_KEY }),
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Locale Emulator</h3>
          <p className="text-xs text-muted-foreground">
            {isCheckingAvailable
              ? t('settings.localeEmulatorChecking')
              : available
                ? t('settings.localeEmulatorDetected')
                : t('settings.localeEmulatorNotDetected')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {overridePath && (
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={setPath.isPending}>
              {t('settings.reset')}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePick}
            disabled={pickPath.isPending || setPath.isPending}
          >
            {t('settings.pickLeProcPath')}
          </Button>
        </div>
      </div>
      {overridePath && (
        <p className="mt-2 truncate text-xs text-muted-foreground">
          {t('settings.specifiedPath')} {overridePath}
        </p>
      )}
    </div>
  )
}

function ReleaseNotesDialog({
  open,
  onOpenChange,
  notes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  notes: ReleaseNote[]
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.releaseNotesTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-96 flex-col gap-4 overflow-y-auto text-sm">
          {notes.length === 0 ? (
            <p className="text-muted-foreground">{t('settings.releaseNotesEmpty')}</p>
          ) : (
            notes.map((entry) => (
              <div key={entry.version}>
                <h3 className="text-sm font-semibold">{entry.version}</h3>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                  {entry.note}
                </p>
              </div>
            ))
          )}
        </div>
        <Button onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
      </DialogContent>
    </Dialog>
  )
}

function UpdateSection() {
  const { t } = useTranslation()
  const { data: version } = useAppVersion()
  const status = useUpdateStatus()
  const checkForUpdates = useCheckForUpdates()
  const installUpdate = useInstallUpdate()
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)
  // Tracks which status object this component has already reacted to -
  // adjusted during render (React's documented pattern for "state that
  // depends on a changing value from outside", already used elsewhere in
  // this codebase, e.g. useMediaPlayback's resetForPath) rather than in a
  // useEffect, which would call setState after an extra commit instead of
  // before this same render finishes.
  const [lastStatus, setLastStatus] = useState<UpdateStatus | null>(null)

  const releaseNotes =
    status.state === 'available' || status.state === 'downloaded' ? status.releaseNotes : []

  // Surfaces what's new the moment an update finishes downloading (the
  // point where the user actually has to decide whether to restart and
  // install) rather than requiring an extra click to discover it - still
  // dismissible, and reopenable any time via the button below.
  if (status !== lastStatus) {
    setLastStatus(status)
    if (status.state === 'downloaded') setReleaseNotesOpen(true)
  }

  const statusMessage = (() => {
    switch (status.state) {
      case 'checking':
        return t('settings.updateChecking')
      case 'not-available':
        return t('settings.updateNotAvailable')
      case 'available':
        return t('settings.updateAvailable', { version: status.version })
      case 'downloading':
        return t('settings.updateDownloading', { percent: status.percent })
      case 'downloaded':
        return t('settings.updateDownloaded', { version: status.version })
      case 'error':
        // The generic UI message is deliberately not the raw error (a
        // GitHub feed error is technical, not something a user can act
        // on) - logged instead so it's actually findable when diagnosing
        // a real failure, rather than just vanishing.
        console.error('Update check failed:', status.message)
        return t('settings.updateError')
      default:
        return null
    }
  })()

  const isBusy =
    checkForUpdates.isPending || status.state === 'checking' || status.state === 'downloading'

  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{t('settings.updateTitle')}</h3>
          {version && (
            <p className="text-xs text-muted-foreground">
              {t('settings.currentVersion', { version })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(status.state === 'available' || status.state === 'downloaded') && (
            <Button variant="ghost" size="sm" onClick={() => setReleaseNotesOpen(true)}>
              {t('settings.viewReleaseNotes')}
            </Button>
          )}
          {status.state === 'downloaded' ? (
            <Button
              size="sm"
              onClick={() => installUpdate.mutate()}
              disabled={installUpdate.isPending}
            >
              {t('settings.installUpdateNow')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => checkForUpdates.mutate()}
              disabled={isBusy}
            >
              {t('settings.checkForUpdate')}
            </Button>
          )}
        </div>
      </div>
      {statusMessage && <p className="mt-2 text-xs text-muted-foreground">{statusMessage}</p>}
      <ReleaseNotesDialog
        open={releaseNotesOpen}
        onOpenChange={setReleaseNotesOpen}
        notes={releaseNotes}
      />
    </div>
  )
}

function LanguageSection() {
  const { t } = useTranslation()
  const { data: locale = 'ko' } = useLanguageQuery()
  const setLanguage = useSetLanguageMutation()

  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-medium">{t('settings.language')}</h3>
      <Select value={locale} onValueChange={(value) => setLanguage.mutate(value as Locale)}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ko">한국어</SelectItem>
          <SelectItem value="ja">日本語</SelectItem>
          <SelectItem value="en">English</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function WindowCloseBehaviorSection() {
  const { t } = useTranslation()
  const { data: behavior = 'ask' } = useWindowCloseBehaviorQuery()
  const setWindowCloseBehavior = useSetWindowCloseBehaviorMutation()

  return (
    <div className="flex items-center justify-between border-t border-border pt-3">
      <div>
        <h3 className="text-sm font-medium">{t('settings.windowCloseBehavior')}</h3>
        <p className="text-xs text-muted-foreground">{t('settings.windowCloseBehaviorDesc')}</p>
      </div>
      <Select
        value={behavior}
        onValueChange={(value) => setWindowCloseBehavior.mutate(value as WindowCloseBehavior)}
        disabled={setWindowCloseBehavior.isPending}
      >
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ask">{t('settings.windowCloseBehaviorAsk')}</SelectItem>
          <SelectItem value="quit">{t('settings.windowCloseBehaviorQuit')}</SelectItem>
          <SelectItem value="tray">{t('settings.windowCloseBehaviorTray')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function ExternalMetadataProviderForm({
  settings,
  isPending,
  onUpdate,
}: {
  settings: ExternalMetadataProviderSettings
  isPending: boolean
  onUpdate: (settings: Partial<ExternalMetadataProviderSettings>) => void
}) {
  const { t } = useTranslation()
  const [urlDraft, setUrlDraft] = useState(settings.url)
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.apiKey)

  return (
    <>
      <Input
        value={urlDraft}
        onChange={(event) => setUrlDraft(event.target.value)}
        onBlur={() => onUpdate({ url: urlDraft })}
        placeholder={t('settings.externalMetadataProviderUrl')}
        disabled={isPending}
      />
      <Input
        type="password"
        value={apiKeyDraft}
        onChange={(event) => setApiKeyDraft(event.target.value)}
        onBlur={() => onUpdate({ apiKey: apiKeyDraft })}
        placeholder={t('settings.externalMetadataProviderApiKey')}
        disabled={isPending}
      />
    </>
  )
}

function ExternalMetadataProviderSection() {
  const { t } = useTranslation()
  const { data: settings } = useExternalMetadataProviderSettings()
  const setSettings = useSetExternalMetadataProviderSettings()

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div>
        <h3 className="text-sm font-medium">{t('settings.externalMetadataProvider')}</h3>
        <p className="text-xs text-muted-foreground">
          {t('settings.externalMetadataProviderDesc')}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings?.enabled ?? false}
          onChange={(event) => setSettings.mutate({ enabled: event.target.checked })}
          disabled={setSettings.isPending}
        />
        {t('settings.enableExternalMetadataProvider')}
      </label>
      {settings && (
        <ExternalMetadataProviderForm
          key={JSON.stringify([settings.url, settings.apiKey])}
          settings={settings}
          isPending={setSettings.isPending}
          onUpdate={(update) => setSettings.mutate(update)}
        />
      )}
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const { data: libraries, isLoading } = useLibraries()
  const [removingLibrary, setRemovingLibrary] = useState<{ id: string; name: string } | null>(
    null
  )
  const { data: version } = useAppVersion()
  // design §4: "reduced motion은 layout false와 이동/height animation 생략" - unlike
  // the transform-based animations MotionConfig's reducedMotion="user"
  // (main.tsx) already strips automatically app-wide, a plain `height`
  // value is NOT a transform, so it needs this explicit branch: no `layout`
  // prop, no height animation at all under reduced motion, opacity only.
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t('settings.libraryTitle')}</h1>
      </div>

      <SettingsSection id="settings-group-library" title={t('settings.groupLibrary')}>
        <div className="flex items-center justify-end">
          <AddLibraryDialog />
        </div>
        {isLoading || !libraries ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : libraries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('settings.noLibraries')}</p>
        ) : (
          // AnimatePresence initial={false}: the FIRST load of an already-
          // populated list must not entrance-animate every row - only a
          // real add/remove after that (design §4's "최초 로딩 목록 전체 entrance는
          // 하지 않는다"). layout="position" + height 0<->auto + opacity
          // 0<->1, 180ms - matches design's motion table row for this exact
          // interaction. Cancelling the confirm dialog removes nothing (no
          // library left the `libraries` array), so nothing exits; a failed
          // remove leaves the row in place for the same reason (see
          // RemoveLibraryConfirmDialog - it only calls onClose, which
          // doesn't touch this list, on mutation SUCCESS).
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {libraries.map((lib) => (
                <motion.li
                  key={lib.id}
                  layout={prefersReducedMotion ? false : 'position'}
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: UI_MOTION.panel, ease: UI_MOTION.ease }}
                  className="flex items-center justify-between gap-2 overflow-hidden rounded-md border border-border p-3"
                >
                  <HoverTooltip content={lib.path} className="min-w-0 flex-1">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{lib.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{lib.path}</p>
                      {!lib.exists && (
                        <p className="text-xs text-destructive">{t('settings.pathNotFound')}</p>
                      )}
                    </div>
                  </HoverTooltip>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setRemovingLibrary({ id: lib.id, name: lib.name })}
                  >
                    {t('common.delete')}
                  </Button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        <RemoveLibraryConfirmDialog
          library={removingLibrary}
          onClose={() => setRemovingLibrary(null)}
        />
      </SettingsSection>

      <SettingsSection id="settings-group-general" title={t('settings.groupGeneral')}>
        <LanguageSection />
        <WindowCloseBehaviorSection />
      </SettingsSection>

      <SettingsSection id="settings-group-launch-metadata" title={t('settings.groupLaunchMetadata')}>
        <LocaleEmulatorSection />
        <ExternalMetadataProviderSection />
      </SettingsSection>

      <SettingsSection id="settings-group-management" title={t('settings.groupManagement')}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">{t('settings.cacheManagement')}</h3>
            <p className="text-xs text-muted-foreground">{t('settings.cacheManagementDesc')}</p>
          </div>
          <ClearCacheDialog />
        </div>
        <UpdateSection />
      </SettingsSection>

      {version && (
        <p className="mt-auto flex justify-end text-xs text-muted-foreground">
          {t('settings.appVersionFooter', { version })}
        </p>
      )}
    </div>
  )
}
