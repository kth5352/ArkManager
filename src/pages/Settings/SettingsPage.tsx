import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import {
  useAddLibrary,
  useLibraries,
  usePickLibraryFolder,
  useRemoveLibrary,
} from '../../services/librariesService'
import { useClearCache } from '../../services/cacheService'
import { deriveNameFromPath } from '../../lib/deriveNameFromPath'
import { useState, type DragEvent } from 'react'

const librarySchema = z.object({
  name: z.string(),
  path: z.string().min(1, '경로를 입력하세요'),
})

type LibraryFormValues = z.infer<typeof librarySchema>

function AddLibraryDialog() {
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
      ? '이미 등록된 경로입니다.'
      : '라이브러리를 추가하지 못했습니다. 다시 시도해 주세요.'
    : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>라이브러리 추가</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 라이브러리</DialogTitle>
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
          <Input placeholder="이름 (비워두면 폴더명 사용)" {...register('name')} />
          <div className="flex gap-2">
            <Input placeholder="경로 (예: D:\Games\DLsite)" {...register('path')} />
            <Button type="button" variant="secondary" onClick={handlePickFolder}>
              폴더 선택
            </Button>
          </div>
          {errors.path && <p className="-mt-2 text-xs text-destructive">{errors.path.message}</p>}
          <p className="-mt-2 text-xs text-muted-foreground">
            폴더를 여기로 드래그해서 놓아도 경로가 채워집니다.
          </p>
          {addLibraryErrorMessage && (
            <p className="-mt-2 text-xs text-destructive">{addLibraryErrorMessage}</p>
          )}
          <Button type="submit">저장</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ClearCacheDialog() {
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
        <Button variant="destructive">캐시 삭제</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>캐시 삭제</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <p>
            DLsite에서 크롤링한 작품 정보(제목/서클/장르)와 캐시된 표지 이미지를 삭제합니다. 언제든
            "메타데이터 새로고침"으로 다시 받아올 수 있습니다.
          </p>
          <p className="text-muted-foreground">
            즐겨찾기, 평점, 메모, 실행 설정, 플레이타임은 삭제되지 않습니다.
          </p>
          <label className="flex items-start gap-2 rounded-md border border-border p-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={deleteSaveBackups}
              onChange={(e) => setDeleteSaveBackups(e.target.checked)}
            />
            <span>
              <span className="block font-medium">세이브 백업 파일도 함께 삭제</span>
              <span className="block text-xs text-muted-foreground">
                세이브 백업은 DLsite에서 다시 받을 수 없습니다. 원본 세이브 파일이 그대로 남아있는
                경우에만 체크하세요.
              </span>
            </span>
          </label>
          {clearCache.isError && (
            <p className="text-xs text-destructive">
              캐시를 삭제하지 못했습니다. 다시 시도해 주세요.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleConfirm} disabled={clearCache.isPending}>
              {clearCache.isPending ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SettingsPage() {
  const { data: libraries, isLoading } = useLibraries()
  const removeLibrary = useRemoveLibrary()

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">라이브러리 설정</h1>
        <AddLibraryDialog />
      </div>
      {isLoading || !libraries ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : libraries.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 라이브러리가 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {libraries.map((lib) => (
            <li
              key={lib.id}
              className="flex items-center justify-between rounded-md border border-border p-3"
            >
              <div>
                <p className="font-medium">{lib.name}</p>
                <p className="text-xs text-muted-foreground">{lib.path}</p>
                {!lib.exists && (
                  <p className="text-xs text-destructive">
                    경로를 찾을 수 없습니다. 폴더가 삭제되었거나 드라이브가 연결되어 있지 않은 것
                    같습니다.
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeLibrary.mutate(lib.id)}>
                삭제
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <div>
          <h2 className="text-sm font-semibold">캐시 관리</h2>
          <p className="text-xs text-muted-foreground">
            크롤링한 DLsite 정보와 캐시된 표지 이미지를 삭제합니다.
          </p>
        </div>
        <ClearCacheDialog />
      </div>
    </div>
  )
}
