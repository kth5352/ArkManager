import { LibraryBig } from 'lucide-react'

export function DetailPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <LibraryBig className="h-10 w-10" />
      <p>게임을 선택하면 상세 정보가 여기에 표시됩니다.</p>
    </div>
  )
}
