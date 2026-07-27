import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { create } from 'zustand'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'

const librarySchema = z.object({
  name: z.string().min(1, '이름을 입력하세요'),
  path: z.string().min(1, '경로를 입력하세요'),
})

type LibraryFormValues = z.infer<typeof librarySchema>

interface MockLibrary extends LibraryFormValues {
  id: string
}

interface MockLibraryState {
  libraries: MockLibrary[]
  addLibrary: (library: LibraryFormValues) => void
}

const useMockLibraryStore = create<MockLibraryState>((set) => ({
  libraries: [],
  addLibrary: (library) =>
    set((state) => ({ libraries: [...state.libraries, { ...library, id: crypto.randomUUID() }] })),
}))

function AddLibraryDialog() {
  const [open, setOpen] = useState(false)
  const addLibrary = useMockLibraryStore((s) => s.addLibrary)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LibraryFormValues>({ resolver: zodResolver(librarySchema) })

  const onSubmit = (values: LibraryFormValues): void => {
    addLibrary(values)
    reset()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>라이브러리 추가</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 라이브러리</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <Input placeholder="이름 (예: Voice)" {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div>
            <Input placeholder="경로 (예: D:\Games\DLsite)" {...register('path')} />
            {errors.path && <p className="mt-1 text-xs text-destructive">{errors.path.message}</p>}
          </div>
          <Button type="submit">저장</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SettingsPage() {
  const libraries = useMockLibraryStore((s) => s.libraries)

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">라이브러리 설정</h1>
        <AddLibraryDialog />
      </div>
      {libraries.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 라이브러리가 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {libraries.map((lib) => (
            <li key={lib.id} className="rounded-md border border-border p-3">
              <p className="font-medium">{lib.name}</p>
              <p className="text-xs text-muted-foreground">{lib.path}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
