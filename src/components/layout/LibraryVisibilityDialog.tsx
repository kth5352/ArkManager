import { Library as LibraryIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog'
import { Button } from '../ui/button'
import { useLibraries } from '../../services/librariesService'
import { useLibraryVisibilityStore } from '../../stores/libraryVisibilityStore'

// Hidden entirely with 0-1 registered libraries - nothing to choose between.
export function LibraryVisibilityDialog() {
  const { data: libraries } = useLibraries()
  const hiddenLibraryIds = useLibraryVisibilityStore((s) => s.hiddenLibraryIds)
  const toggleLibrary = useLibraryVisibilityStore((s) => s.toggleLibrary)
  const showAll = useLibraryVisibilityStore((s) => s.showAll)

  if (!libraries || libraries.length <= 1) return null

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="라이브러리 표시 설정"
          title="라이브러리 표시 설정"
        >
          <LibraryIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>표시할 라이브러리</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {libraries.map((library) => (
            <label key={library.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!hiddenLibraryIds.has(library.id)}
                onChange={() => toggleLibrary(library.id)}
              />
              <span className="font-medium">{library.name}</span>
              <span className="truncate text-xs text-muted-foreground">{library.path}</span>
            </label>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={showAll} className="w-fit">
          모두 표시
        </Button>
      </DialogContent>
    </Dialog>
  )
}
