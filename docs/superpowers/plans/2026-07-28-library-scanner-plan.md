# 실제 라이브러리 스캔 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock data in Gallery/List/Explorer with real filesystem scans of registered library folders, add RJ/VJ/ST code recognition, lazy local thumbnails, per-page persisted sort, a native folder-picker for adding libraries, DLsite/Steam hyperlinks, and Explorer tab-state persistence.

**Architecture:** A new `electron/main/scanner/` module provides pure, async, fs-based functions (shallow scan for Explorer, recursive scan for Gallery/List, code recognition, thumbnail discovery) with zero UI/IPC concerns. Three new SQLite tables (`libraries`, `explorer_tabs`, `sort_preferences`) follow the existing Repository pattern. IPC handlers stay thin wrappers per the established convention. Thumbnails are never eagerly read during a scan — they're fetched lazily, one at a time, only for cards react-window actually renders.

**Tech Stack:** Same as the initial setup (Electron, React, TypeScript, Drizzle/better-sqlite3, zod, React Query, Zustand, shadcn/ui). New shadcn components: `select`, `slider` (both Radix-based, installed via `npx shadcn@latest add`). No new heavy dependencies (no Sharp, no archive libraries — explicitly out of scope).

## Global Constraints

- TypeScript strict mode everywhere; `npm run typecheck` must pass with zero errors before any task is considered done.
- ESLint + Prettier must pass with zero errors/warnings on all authored code (`npm run lint`, `npm run format:check`).
- Functional components and React Hooks only — no class components.
- Zustand for client-only UI state; React Query for anything that crosses the `window.api` boundary. Components never call `window.api` directly — only `src/services/*`.
- SQL access goes through a Repository module (`electron/main/database/*Repository.ts`); IPC handlers call repositories, never raw SQL.
- Scanner functions (`electron/main/scanner/*`) must use `fs/promises` (async) — never synchronous `fs` calls. A recursive scan over a large library must not block the main process's other IPC handlers.
- Thumbnails are never read during `scanFolderShallow`/`scanLibraryRecursive` — only via the separate, lazy `scanner:get-thumbnail` call, one entry at a time.
- All new files use relative imports (no path aliases).
- Renderer never opens arbitrary URLs: `shell:open-external`'s IPC payload carries only a `{ type, value }` code, and the main process builds the URL itself via `buildExternalUrl`.
- `games` table is explicitly out of scope this stage — Gallery/List query is always a fresh on-demand scan (see spec's "향후 메타데이터 캐싱과의 관계").
- Automated tests target pure logic only (scanner functions against real temp directories via `fs.mkdtemp`, repositories against real in-memory SQLite, zod schemas). UI is verified manually via `npm run dev` + CDP (this project's established pattern — boot with `--remote-debugging-port`, drive via `Runtime.evaluate`/`Input.dispatchMouseEvent`, read back real DOM/IPC state).
- Spec reference: `docs/superpowers/specs/2026-07-28-library-scanner-design.md`.

---

### Task 1: `libraries` table, repository, and path normalization

**Files:**
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Create: `electron/main/database/librariesRepository.ts`
- Test: `electron/main/database/librariesRepository.test.ts`

**Interfaces:**
- Produces: `normalizeLibraryPath(path: string): string`, `listLibraries(db): Library[]`, `addLibrary(db, name: string, path: string): Library`, `removeLibrary(db, id: string): void`, and the `Library` type (`{ id: string; name: string; path: string; createdAt: string }`) — consumed by Task 2 (IPC handlers).

- [ ] **Step 1: Add the `libraries` table to `electron/main/database/schema.ts`**

Replace the full file content with:

```ts
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  createdAt: text('created_at').notNull(),
})
```

- [ ] **Step 2: Add the `CREATE TABLE` statement to `electron/main/database/client.ts`**

Replace the full file content with:

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export function createDbClient(filePath: string) {
  const sqlite = new Database(filePath)
  sqlite.pragma('journal_mode = WAL')

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )
  `)

  return drizzle(sqlite, { schema })
}

export type AppDatabase = ReturnType<typeof createDbClient>
```

- [ ] **Step 3: Write the failing test for the repository**

Create `electron/main/database/librariesRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { addLibrary, listLibraries, normalizeLibraryPath, removeLibrary } from './librariesRepository'

describe('normalizeLibraryPath', () => {
  it('lowercases the path so case-only duplicates are treated as identical', () => {
    expect(normalizeLibraryPath('D:\\Games\\DLsite')).toBe('d:\\games\\dlsite')
  })

  it('trims trailing slashes', () => {
    expect(normalizeLibraryPath('D:\\Games\\')).toBe('d:\\games')
  })
})

describe('librariesRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns an empty list when no libraries are registered', () => {
    expect(listLibraries(db)).toEqual([])
  })

  it('adds a library and returns it with a generated id and timestamp', () => {
    const lib = addLibrary(db, 'Voice', 'D:\\Games\\DLsite')
    expect(lib.name).toBe('Voice')
    expect(lib.path).toBe('d:\\games\\dlsite')
    expect(typeof lib.id).toBe('string')
    expect(lib.id.length).toBeGreaterThan(0)
    expect(typeof lib.createdAt).toBe('string')
  })

  it('lists previously added libraries', () => {
    addLibrary(db, 'Voice', 'D:\\Games\\DLsite')
    addLibrary(db, 'RPG', 'F:\\RPG')
    const libs = listLibraries(db)
    expect(libs.map((l) => l.name).sort()).toEqual(['RPG', 'Voice'])
  })

  it('rejects adding the same path twice, even with different casing', () => {
    addLibrary(db, 'Voice', 'D:\\Games\\DLsite')
    expect(() => addLibrary(db, 'Voice Again', 'd:\\games\\dlsite')).toThrow()
  })

  it('removes a library by id', () => {
    const lib = addLibrary(db, 'Voice', 'D:\\Games\\DLsite')
    removeLibrary(db, lib.id)
    expect(listLibraries(db)).toEqual([])
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm run test -- electron/main/database/librariesRepository.test.ts`
Expected: FAIL — `librariesRepository.ts` does not exist.

- [ ] **Step 5: Implement `electron/main/database/librariesRepository.ts`**

```ts
import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { libraries } from './schema'

export interface Library {
  id: string
  name: string
  path: string
  createdAt: string
}

// Windows filesystems are case-insensitive, so "D:\Games" and "d:\games" refer
// to the same folder. Lowercasing (and trimming a trailing slash) before the
// path hits the `unique` constraint stops a user from registering the same
// library twice under different casing.
export function normalizeLibraryPath(path: string): string {
  return path.toLowerCase().replace(/[\\/]+$/, '')
}

export function listLibraries(db: AppDatabase): Library[] {
  return db.select().from(libraries).all()
}

export function addLibrary(db: AppDatabase, name: string, path: string): Library {
  const library: Library = {
    id: crypto.randomUUID(),
    name,
    path: normalizeLibraryPath(path),
    createdAt: new Date().toISOString(),
  }
  db.insert(libraries).values(library).run()
  return library
}

export function removeLibrary(db: AppDatabase, id: string): void {
  db.delete(libraries).where(eq(libraries.id, id)).run()
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- electron/main/database/librariesRepository.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/librariesRepository.ts electron/main/database/librariesRepository.test.ts
git commit -m "feat: add libraries table and repository with path normalization"
```

---

### Task 2: Libraries IPC (list/add/remove/pick-folder)

**Files:**
- Modify: `shared/types/ipc.ts`
- Create: `electron/main/ipc/librariesHandlers.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Consumes: `Library` type, `listLibraries`/`addLibrary`/`removeLibrary` (Task 1).
- Produces: `window.api.libraries.list(): Promise<LibraryWithStatus[]>` (each entry enriched with a live `exists` check), `window.api.libraries.add(name, path): Promise<Library>`, `window.api.libraries.remove(id): Promise<void>`, `window.api.libraries.pickFolder(): Promise<string | null>` — consumed by Task 3 (Settings page).

- [ ] **Step 1: Add channels and schemas to `shared/types/ipc.ts`**

Replace the full file content with:

```ts
import { z } from 'zod'

export const IPC_CHANNELS = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_SYNC: 'settings:get-sync',
  LIBRARIES_LIST: 'libraries:list',
  LIBRARIES_ADD: 'libraries:add',
  LIBRARIES_REMOVE: 'libraries:remove',
  LIBRARIES_PICK_FOLDER: 'libraries:pick-folder',
} as const

export const ThemeSchema = z.enum(['light', 'dark'])
export type Theme = z.infer<typeof ThemeSchema>

export const SettingKeySchema = z.enum(['theme'])

export const GetSettingRequestSchema = z.object({
  key: SettingKeySchema,
})
export type GetSettingRequest = z.infer<typeof GetSettingRequestSchema>

export const SetSettingRequestSchema = z.object({
  key: SettingKeySchema,
  value: ThemeSchema,
})
export type SetSettingRequest = z.infer<typeof SetSettingRequestSchema>

export const LibrarySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  createdAt: z.string(),
})
export type Library = z.infer<typeof LibrarySchema>

// libraries:list enriches each stored Library with a live filesystem check
// (not persisted - computed fresh on every list call) so Settings can warn
// when a registered path has been deleted or an external drive is unplugged.
export interface LibraryWithStatus extends Library {
  exists: boolean
}

export const AddLibraryRequestSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
})
export type AddLibraryRequest = z.infer<typeof AddLibraryRequestSchema>

export const RemoveLibraryRequestSchema = z.object({
  id: z.string(),
})
export type RemoveLibraryRequest = z.infer<typeof RemoveLibraryRequestSchema>
```

- [ ] **Step 2: Create `electron/main/ipc/librariesHandlers.ts`**

```ts
import { existsSync } from 'node:fs'
import { dialog, ipcMain } from 'electron'
import { AddLibraryRequestSchema, IPC_CHANNELS, RemoveLibraryRequestSchema } from '../../../shared/types/ipc'
import type { LibraryWithStatus } from '../../../shared/types/ipc'
import { addLibrary, listLibraries, removeLibrary } from '../database/librariesRepository'
import type { AppDatabase } from '../database/client'

export function registerLibrariesHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.LIBRARIES_LIST, (): LibraryWithStatus[] => {
    return listLibraries(db).map((library) => ({ ...library, exists: existsSync(library.path) }))
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_ADD, (_event, payload: unknown) => {
    const { name, path } = AddLibraryRequestSchema.parse(payload)
    return addLibrary(db, name, path)
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_REMOVE, (_event, payload: unknown) => {
    const { id } = RemoveLibraryRequestSchema.parse(payload)
    removeLibrary(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
```

- [ ] **Step 3: Modify `electron/main/index.ts`** to register the new handlers

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createDbClient } from './database/client'
import { registerSettingsHandlers } from './ipc/settingsHandlers'
import { registerLibrariesHandlers } from './ipc/librariesHandlers'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const dbPath = join(app.getPath('userData'), 'dlibrary.db')
  const db = createDbClient(dbPath)
  registerSettingsHandlers(db)
  registerLibrariesHandlers(db)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 4: Modify `electron/preload/index.ts`** to expose the new API surface

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type Library, type LibraryWithStatus, type Theme } from '../../shared/types/ipc'

const api = {
  settings: {
    getTheme: (): Promise<Theme | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'theme' }),
    setTheme: (value: Theme): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'theme', value }),
    getThemeSync: (): Theme | null =>
      ipcRenderer.sendSync(IPC_CHANNELS.SETTINGS_GET_SYNC) as Theme | null,
  },
  libraries: {
    list: (): Promise<LibraryWithStatus[]> => ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_LIST),
    add: (name: string, path: string): Promise<Library> =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_ADD, { name, path }),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_REMOVE, { id }),
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARIES_PICK_FOLDER),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
```

- [ ] **Step 5: Verify the app boots and the IPC round-trip works**

Run: `npm run dev -- --remote-debugging-port=9500` in the background, then via a Node script connect over CDP (`ws://localhost:9500/devtools/page/...` from `http://localhost:9500/json`) and run:

```js
await window.api.libraries.add('Test', 'D:\\Test')
const libs = await window.api.libraries.list()
console.log(libs) // expect one entry with name "Test", path "d:\\test"
```

Expected: the array contains the added library with the normalized path.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/librariesHandlers.ts electron/main/index.ts electron/preload/index.ts
git commit -m "feat: add libraries IPC handlers and folder-picker dialog"
```

---

### Task 3: Settings page — real libraries + folder picker button

**Files:**
- Create: `src/services/librariesService.ts`
- Modify: `src/pages/Settings/SettingsPage.tsx`

**Interfaces:**
- Consumes: `window.api.libraries.*` (Task 2), `Library` type (Task 2).
- Produces: `useLibraries()`, `useAddLibrary()`, `useRemoveLibrary()` React Query hooks — consumed by later tasks that need the registered library list (Task 8's Gallery/List wiring).

- [ ] **Step 1: Create `src/services/librariesService.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LibraryWithStatus } from '../../shared/types/ipc'

export const LIBRARIES_QUERY_KEY = ['libraries'] as const

export function useLibraries() {
  return useQuery<LibraryWithStatus[]>({
    queryKey: LIBRARIES_QUERY_KEY,
    queryFn: () => window.api.libraries.list(),
  })
}

export function useAddLibrary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, path }: { name: string; path: string }) =>
      window.api.libraries.add(name, path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIBRARIES_QUERY_KEY })
    },
  })
}

export function useRemoveLibrary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.libraries.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIBRARIES_QUERY_KEY })
    },
  })
}

export function usePickLibraryFolder() {
  return useMutation({
    mutationFn: () => window.api.libraries.pickFolder(),
  })
}
```

- [ ] **Step 2: Replace `src/pages/Settings/SettingsPage.tsx`**

```tsx
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
import { useState } from 'react'

const librarySchema = z.object({
  name: z.string().min(1, '이름을 입력하세요'),
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
    addLibrary.mutate(values, {
      onSuccess: () => {
        reset()
        setOpen(false)
      },
    })
  }

  const handlePickFolder = async (): Promise<void> => {
    const path = await pickFolder.mutateAsync()
    if (path) setValue('path', path, { shouldValidate: true })
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
          <div className="flex gap-2">
            <Input placeholder="경로 (예: D:\Games\DLsite)" {...register('path')} />
            <Button type="button" variant="secondary" onClick={handlePickFolder}>
              폴더 선택
            </Button>
          </div>
          {errors.path && <p className="-mt-2 text-xs text-destructive">{errors.path.message}</p>}
          <Button type="submit">저장</Button>
        </form>
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
    </div>
  )
}
```

- [ ] **Step 3: Verify manually via CDP**

Run: `npm run dev -- --remote-debugging-port=9500`, navigate to `#/settings`.
Expected: clicking "라이브러리 추가" opens the dialog; clicking "폴더 선택" opens a native folder picker (dispatch this via CDP `Runtime.evaluate` to click the button, then confirm — since a real native dialog can't be automated via CDP DOM events, verify instead that `window.api.libraries.pickFolder()` resolves correctly when called directly, and that submitting the form with a manually-typed path works end-to-end: dialog closes, new list item appears, and `window.api.libraries.list()` reflects it after a page reload (confirms SQLite persistence)).

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/services/librariesService.ts src/pages/Settings/SettingsPage.tsx
git commit -m "feat: wire Settings page to real persisted libraries with folder picker"
```

---

### Task 4: Scanner — code recognition (`extractCode`)

**Files:**
- Create: `shared/types/scanner.ts`
- Create: `electron/main/scanner/codeRecognition.ts`
- Test: `electron/main/scanner/codeRecognition.test.ts`

**Interfaces:**
- Produces: `GameCode` type (`{ type: 'RJ' | 'VJ' | 'ST'; value: string }`), `extractCode(name: string): GameCode | null` — consumed by Task 6 (scan functions) and Task 15 (URL builder).

- [ ] **Step 1: Create `shared/types/scanner.ts`**

```ts
export type GameCodeType = 'RJ' | 'VJ' | 'ST'

export interface GameCode {
  type: GameCodeType
  value: string // full matched code, prefix included and uppercased, e.g. "RJ01234567" or "ST4282500"
}

export interface ScannedEntry {
  name: string // file/folder name as-is, extension included, no reformatting
  path: string
  kind: 'folder' | 'file'
  mtimeMs: number
  code: GameCode | null
}

// scanLibraryRecursive's documented invariant is that every returned entry has
// a recognized code (non-matching entries are dropped, not returned with
// code: null) - this type makes that guarantee visible to Gallery/List
// consumers instead of forcing them to null-check a field that can't
// actually be null in that path.
export interface GameEntry extends ScannedEntry {
  code: GameCode
}
```

- [ ] **Step 2: Write the failing test**

Create `electron/main/scanner/codeRecognition.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractCode } from './codeRecognition'

describe('extractCode', () => {
  it('recognizes an RJ code anywhere in the name', () => {
    expect(extractCode('[RJ01234567] 게임명.zip')).toEqual({ type: 'RJ', value: 'RJ01234567' })
  })

  it('recognizes a VJ code', () => {
    expect(extractCode('VJ009988 - Some Game')).toEqual({ type: 'VJ', value: 'VJ009988' })
  })

  it('recognizes an ST (Steam) code', () => {
    expect(extractCode('ST4282500')).toEqual({ type: 'ST', value: 'ST4282500' })
  })

  it('is case-insensitive but normalizes the prefix to uppercase', () => {
    expect(extractCode('rj01234567.zip')).toEqual({ type: 'RJ', value: 'RJ01234567' })
  })

  it('returns null when no code is present', () => {
    expect(extractCode('그냥 폴더 이름')).toBeNull()
  })

  it('returns null for a near-miss that is not actually a code (letters not immediately followed by digits)', () => {
    expect(extractCode('STAGE2_backup.txt')).toBeNull()
  })

  it('does not match a code embedded mid-word without a boundary', () => {
    expect(extractCode('COST1234.txt')).toBeNull()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test -- electron/main/scanner/codeRecognition.test.ts`
Expected: FAIL — `codeRecognition.ts` does not exist.

- [ ] **Step 4: Implement `electron/main/scanner/codeRecognition.ts`**

```ts
import type { GameCode, GameCodeType } from '../../../shared/types/scanner'

const CODE_PATTERN = /\b(RJ|VJ|ST)(\d+)\b/i

export function extractCode(name: string): GameCode | null {
  const match = CODE_PATTERN.exec(name)
  if (!match) return null
  const type = match[1].toUpperCase() as GameCodeType
  const digits = match[2]
  return { type, value: `${type}${digits}` }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- electron/main/scanner/codeRecognition.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add shared/types/scanner.ts electron/main/scanner/codeRecognition.ts electron/main/scanner/codeRecognition.test.ts
git commit -m "feat: add RJ/VJ/ST code recognition"
```

---

### Task 5: Scanner — thumbnail discovery (`findThumbnailPath`)

**Files:**
- Create: `electron/main/scanner/thumbnail.ts`
- Test: `electron/main/scanner/thumbnail.test.ts`

**Interfaces:**
- Produces: `IMAGE_EXTENSIONS` (readonly array), `findThumbnailPath(folderPath: string): Promise<string | null>` — consumed by Task 7 (scanner IPC's `get-thumbnail` handler).

- [ ] **Step 1: Write the failing test**

Create `electron/main/scanner/thumbnail.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findThumbnailPath } from './thumbnail'

describe('findThumbnailPath', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-thumb-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns null for an empty folder', async () => {
    expect(await findThumbnailPath(dir)).toBeNull()
  })

  it('prefers a file named "cover" over other images', async () => {
    await writeFile(join(dir, 'aaa_screenshot.png'), '')
    await writeFile(join(dir, 'cover.jpg'), '')
    expect(await findThumbnailPath(dir)).toBe(join(dir, 'cover.jpg'))
  })

  it('prefers "folder" or "thumbnail" when there is no "cover"', async () => {
    await writeFile(join(dir, 'aaa_screenshot.png'), '')
    await writeFile(join(dir, 'thumbnail.webp'), '')
    expect(await findThumbnailPath(dir)).toBe(join(dir, 'thumbnail.webp'))
  })

  it('falls back to the alphabetically-first image when no preferred name exists', async () => {
    await writeFile(join(dir, 'zzz.png'), '')
    await writeFile(join(dir, 'aaa.jpg'), '')
    expect(await findThumbnailPath(dir)).toBe(join(dir, 'aaa.jpg'))
  })

  it('ignores non-image files', async () => {
    await writeFile(join(dir, 'data.pak'), '')
    await writeFile(join(dir, 'readme.txt'), '')
    expect(await findThumbnailPath(dir)).toBeNull()
  })

  it('returns null for a path that does not exist', async () => {
    expect(await findThumbnailPath(join(dir, 'nope'))).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- electron/main/scanner/thumbnail.test.ts`
Expected: FAIL — `thumbnail.ts` does not exist.

- [ ] **Step 3: Implement `electron/main/scanner/thumbnail.ts`**

```ts
import { readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'] as const

const PREFERRED_NAMES = ['cover', 'folder', 'thumbnail']

function isImageFile(fileName: string): boolean {
  return IMAGE_EXTENSIONS.includes(extname(fileName).toLowerCase() as (typeof IMAGE_EXTENSIONS)[number])
}

export async function findThumbnailPath(folderPath: string): Promise<string | null> {
  let entries: string[]
  try {
    entries = await readdir(folderPath)
  } catch {
    return null
  }

  const images = entries.filter(isImageFile).sort((a, b) => a.localeCompare(b))
  if (images.length === 0) return null

  for (const preferredName of PREFERRED_NAMES) {
    const match = images.find((name) => name.toLowerCase().startsWith(preferredName))
    if (match) return join(folderPath, match)
  }

  return join(folderPath, images[0])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- electron/main/scanner/thumbnail.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add electron/main/scanner/thumbnail.ts electron/main/scanner/thumbnail.test.ts
git commit -m "feat: add local thumbnail discovery for folder-type game entries"
```

---

### Task 6: Scanner — shallow and recursive folder scans

**Files:**
- Create: `electron/main/scanner/folderScanner.ts`
- Test: `electron/main/scanner/folderScanner.test.ts`

**Interfaces:**
- Consumes: `extractCode` (Task 4), `ScannedEntry`/`GameEntry` types (Task 4).
- Produces: `scanFolderShallow(dirPath: string): Promise<ScannedEntry[]>`, `scanLibraryRecursive(libraryPath: string): Promise<GameEntry[]>` — consumed by Task 7 (scanner IPC handlers).

- [ ] **Step 1: Write the failing test**

Create `electron/main/scanner/folderScanner.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanFolderShallow, scanLibraryRecursive } from './folderScanner'

describe('scanFolderShallow', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-shallow-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('lists direct children regardless of code recognition, like a real file explorer', async () => {
    await mkdir(join(dir, '하위폴더1'))
    await writeFile(join(dir, 'RJ01111.zip'), '')
    await writeFile(join(dir, 'memo.txt'), '')

    const entries = await scanFolderShallow(dir)
    const names = entries.map((e) => e.name).sort()
    expect(names).toEqual(['RJ01111.zip', 'memo.txt', '하위폴더1'])
  })

  it('marks folders and files with the correct kind', async () => {
    await mkdir(join(dir, 'a-folder'))
    await writeFile(join(dir, 'a-file.txt'), '')

    const entries = await scanFolderShallow(dir)
    expect(entries.find((e) => e.name === 'a-folder')?.kind).toBe('folder')
    expect(entries.find((e) => e.name === 'a-file.txt')?.kind).toBe('file')
  })

  it('attaches a recognized code to matching entries and null to others', async () => {
    await writeFile(join(dir, 'RJ01111.zip'), '')
    await writeFile(join(dir, 'memo.txt'), '')

    const entries = await scanFolderShallow(dir)
    expect(entries.find((e) => e.name === 'RJ01111.zip')?.code).toEqual({
      type: 'RJ',
      value: 'RJ01111',
    })
    expect(entries.find((e) => e.name === 'memo.txt')?.code).toBeNull()
  })

  it('does not descend into subfolders', async () => {
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'sub', 'RJ99999.zip'), '')

    const entries = await scanFolderShallow(dir)
    expect(entries.map((e) => e.name)).toEqual(['sub'])
  })
})

describe('scanLibraryRecursive', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlibrary-recursive-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('finds a coded entry nested several levels deep', async () => {
    await mkdir(join(dir, 'a', 'b', 'c'), { recursive: true })
    await writeFile(join(dir, 'a', 'b', 'c', 'RJ01234567.zip'), '')

    const entries = await scanLibraryRecursive(dir)
    expect(entries).toHaveLength(1)
    expect(entries[0].code).toEqual({ type: 'RJ', value: 'RJ01234567' })
    expect(entries[0].path).toBe(join(dir, 'a', 'b', 'c', 'RJ01234567.zip'))
  })

  it('excludes entries without a recognized code', async () => {
    await mkdir(join(dir, 'plain-folder'))
    await writeFile(join(dir, 'plain-folder', 'memo.txt'), '')
    await writeFile(join(dir, 'RJ01111.zip'), '')

    const entries = await scanLibraryRecursive(dir)
    expect(entries.map((e) => e.name)).toEqual(['RJ01111.zip'])
  })

  it('finds multiple coded entries across different branches', async () => {
    await mkdir(join(dir, 'branch-a'))
    await mkdir(join(dir, 'branch-b'))
    await writeFile(join(dir, 'branch-a', 'RJ01111.zip'), '')
    await writeFile(join(dir, 'branch-b', 'VJ02222'), '')

    const entries = await scanLibraryRecursive(dir)
    expect(entries.map((e) => e.name).sort()).toEqual(['RJ01111.zip', 'VJ02222'])
  })

  it('does not recurse into a folder that is itself a recognized game (treats it as a leaf)', async () => {
    await mkdir(join(dir, 'RJ01111'))
    await writeFile(join(dir, 'RJ01111', 'cover.jpg'), '')
    await writeFile(join(dir, 'RJ01111', 'data.pak'), '')

    const entries = await scanLibraryRecursive(dir)
    expect(entries.map((e) => e.name)).toEqual(['RJ01111'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- electron/main/scanner/folderScanner.test.ts`
Expected: FAIL — `folderScanner.ts` does not exist.

- [ ] **Step 3: Implement `electron/main/scanner/folderScanner.ts`**

```ts
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { GameEntry, ScannedEntry } from '../../../shared/types/scanner'
import { extractCode } from './codeRecognition'

async function toScannedEntry(parentPath: string, name: string): Promise<ScannedEntry> {
  const path = join(parentPath, name)
  const stats = await stat(path)
  return {
    name,
    path,
    kind: stats.isDirectory() ? 'folder' : 'file',
    mtimeMs: stats.mtimeMs,
    code: extractCode(name),
  }
}

// Explorer: lists dirPath's direct children only, exactly like a real file
// explorer - every entry is shown regardless of whether it's a recognized
// game. Never descends into subfolders (thumbnail lookup is a separate,
// lazy step - see scanner/thumbnail.ts and the get-thumbnail IPC handler).
export async function scanFolderShallow(dirPath: string): Promise<ScannedEntry[]> {
  const names = await readdir(dirPath)
  return Promise.all(names.map((name) => toScannedEntry(dirPath, name)))
}

// Gallery/List: recursively walks the entire library tree and returns only
// entries with a recognized RJ/VJ/ST code, flattened. A folder that is
// itself a recognized game (e.g. an unzipped "RJ01111/" containing cover.jpg
// and data.pak) is treated as a leaf - its contents are not walked or
// listed separately, since they're not games themselves. The return type
// guarantees `code` is non-null (see GameEntry) since non-matching entries
// are never included.
export async function scanLibraryRecursive(libraryPath: string): Promise<GameEntry[]> {
  const names = await readdir(libraryPath)
  const results: GameEntry[] = []

  for (const name of names) {
    const entry = await toScannedEntry(libraryPath, name)

    if (entry.code) {
      results.push({ ...entry, code: entry.code })
      continue
    }

    if (entry.kind === 'folder') {
      const nested = await scanLibraryRecursive(entry.path)
      results.push(...nested)
    }
  }

  return results
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- electron/main/scanner/folderScanner.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add electron/main/scanner/folderScanner.ts electron/main/scanner/folderScanner.test.ts
git commit -m "feat: add shallow (Explorer) and recursive (Gallery/List) folder scanners"
```

---

### Task 7: Scanner IPC (scan-recursive, scan-shallow, get-thumbnail)

**Files:**
- Modify: `shared/types/ipc.ts`
- Create: `electron/main/ipc/scannerHandlers.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Consumes: `scanFolderShallow`, `scanLibraryRecursive` (Task 6), `findThumbnailPath` (Task 5), `ScannedEntry`/`GameEntry` (Task 4).
- Produces: `window.api.scanner.scanRecursive(libraryPaths: string[]): Promise<GameEntry[]>`, `window.api.scanner.scanShallow(dirPath: string): Promise<ScannedEntry[]>`, `window.api.scanner.getThumbnail(entryPath: string): Promise<string | null>` — consumed by Task 8 (Gallery/List) and Task 11 (Explorer).

- [ ] **Step 1: Add channels and request schemas to `shared/types/ipc.ts`**

Add to the `IPC_CHANNELS` object (do not remove existing entries):

```ts
  SCANNER_SCAN_RECURSIVE: 'scanner:scan-recursive',
  SCANNER_SCAN_SHALLOW: 'scanner:scan-shallow',
  SCANNER_GET_THUMBNAIL: 'scanner:get-thumbnail',
```

Append to the bottom of the file:

```ts
export const ScanRecursiveRequestSchema = z.object({
  libraryPaths: z.array(z.string()),
})
export type ScanRecursiveRequest = z.infer<typeof ScanRecursiveRequestSchema>

export const ScanShallowRequestSchema = z.object({
  dirPath: z.string(),
})
export type ScanShallowRequest = z.infer<typeof ScanShallowRequestSchema>

export const GetThumbnailRequestSchema = z.object({
  entryPath: z.string(),
})
export type GetThumbnailRequest = z.infer<typeof GetThumbnailRequestSchema>
```

- [ ] **Step 2: Create `electron/main/ipc/scannerHandlers.ts`**

```ts
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { ipcMain } from 'electron'
import {
  GetThumbnailRequestSchema,
  IPC_CHANNELS,
  ScanRecursiveRequestSchema,
  ScanShallowRequestSchema,
} from '../../../shared/types/ipc'
import { scanFolderShallow, scanLibraryRecursive } from '../scanner/folderScanner'
import { findThumbnailPath } from '../scanner/thumbnail'
import type { GameEntry } from '../../../shared/types/scanner'

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

async function encodeThumbnail(imagePath: string): Promise<string> {
  const buffer = await readFile(imagePath)
  const mimeType = MIME_TYPES[extname(imagePath).toLowerCase()] ?? 'application/octet-stream'
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export function registerScannerHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SCANNER_SCAN_RECURSIVE, async (_event, payload: unknown) => {
    const { libraryPaths } = ScanRecursiveRequestSchema.parse(payload)
    const results = await Promise.all(
      libraryPaths.map(async (libraryPath): Promise<GameEntry[]> => {
        try {
          return await scanLibraryRecursive(libraryPath)
        } catch {
          // Library path no longer exists (deleted/unmounted drive) - skip it,
          // the rest of the registered libraries still scan normally.
          return []
        }
      })
    )
    return results.flat()
  })

  ipcMain.handle(IPC_CHANNELS.SCANNER_SCAN_SHALLOW, async (_event, payload: unknown) => {
    const { dirPath } = ScanShallowRequestSchema.parse(payload)
    return scanFolderShallow(dirPath)
  })

  ipcMain.handle(IPC_CHANNELS.SCANNER_GET_THUMBNAIL, async (_event, payload: unknown) => {
    const { entryPath } = GetThumbnailRequestSchema.parse(payload)

    const stats = await stat(entryPath).catch(() => null)
    if (!stats || !stats.isDirectory()) return null

    const thumbnailPath = await findThumbnailPath(entryPath)
    if (!thumbnailPath) return null

    return encodeThumbnail(thumbnailPath)
  })
}
```

- [ ] **Step 3: Modify `electron/main/index.ts`** to register the scanner handlers

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createDbClient } from './database/client'
import { registerSettingsHandlers } from './ipc/settingsHandlers'
import { registerLibrariesHandlers } from './ipc/librariesHandlers'
import { registerScannerHandlers } from './ipc/scannerHandlers'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const dbPath = join(app.getPath('userData'), 'dlibrary.db')
  const db = createDbClient(dbPath)
  registerSettingsHandlers(db)
  registerLibrariesHandlers(db)
  registerScannerHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 4: Modify `electron/preload/index.ts`** to expose the scanner API

Add to the `api` object (alongside `settings` and `libraries`):

```ts
  scanner: {
    scanRecursive: (libraryPaths: string[]): Promise<GameEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCANNER_SCAN_RECURSIVE, { libraryPaths }),
    scanShallow: (dirPath: string): Promise<ScannedEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCANNER_SCAN_SHALLOW, { dirPath }),
    getThumbnail: (entryPath: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SCANNER_GET_THUMBNAIL, { entryPath }),
  },
```

Add the import at the top: `import type { GameEntry, ScannedEntry } from '../../shared/types/scanner'`.

- [ ] **Step 5: Verify manually via CDP**

Boot the app, and against a real temp folder with a coded file/folder, call from the console:

```js
const entries = await window.api.scanner.scanRecursive(['C:\\Users\\...\\some-test-folder'])
console.log(entries)
const thumb = await window.api.scanner.getThumbnail(entries[0].path)
console.log(thumb?.slice(0, 30)) // expect "data:image/..." prefix or null
```

Expected: entries reflect real files with correct `code`/`kind`/`mtimeMs`; thumbnail call returns a `data:image/...;base64,...` string for a folder-type entry with an image inside, or `null` otherwise.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add shared/types/ipc.ts electron/main/ipc/scannerHandlers.ts electron/main/index.ts electron/preload/index.ts
git commit -m "feat: add scanner IPC handlers (recursive scan, shallow scan, lazy thumbnail)"
```

---

### Task 8: Gallery/List — replace mock data with real scans and lazy thumbnails

**Files:**
- Create: `src/services/thumbnailService.ts`
- Modify: `src/services/useGames.ts`
- Delete: `src/services/mockGames.ts`
- Modify: `src/pages/Gallery/GalleryPage.tsx`
- Modify: `src/pages/List/ListPage.tsx`

**Interfaces:**
- Consumes: `useLibraries` (Task 3), `window.api.scanner.scanRecursive`/`getThumbnail` (Task 7), `GameEntry` type (Task 4).
- Produces: `useGames()` (now real), `useThumbnail(entryPath, kind)` — consumed by Task 16 (hyperlinks wire into List's code column).

- [ ] **Step 1: Create `src/services/thumbnailService.ts`**

```ts
import { useQuery } from '@tanstack/react-query'

export function useThumbnail(entryPath: string, kind: 'folder' | 'file') {
  return useQuery<string | null>({
    queryKey: ['thumbnail', entryPath],
    queryFn: () => window.api.scanner.getThumbnail(entryPath),
    enabled: kind === 'folder',
    staleTime: Infinity,
  })
}
```

- [ ] **Step 2: Replace `src/services/useGames.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { useLibraries } from './librariesService'
import type { GameEntry } from '../../shared/types/scanner'

export function useGames() {
  const { data: libraries } = useLibraries()
  const libraryPaths = libraries?.map((lib) => lib.path) ?? []

  return useQuery<GameEntry[]>({
    queryKey: ['games', 'scan', libraryPaths],
    queryFn: () => window.api.scanner.scanRecursive(libraryPaths),
    enabled: libraries !== undefined,
  })
}
```

- [ ] **Step 3: Delete `src/services/mockGames.ts`**

Run: `rm src/services/mockGames.ts`

- [ ] **Step 4: Replace `src/pages/Gallery/GalleryPage.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { Grid, type CellComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { motion } from 'framer-motion'
import { useGames } from '../../services/useGames'
import { useThumbnail } from '../../services/thumbnailService'
import { Skeleton } from '../../components/ui/skeleton'
import type { GameEntry } from '../../../shared/types/scanner'

const CARD_WIDTH = 180
const GAP = 16
const CARD_TEXT_BLOCK_HEIGHT = 16 + 36 + 20

function computeCardHeight(cardWidth: number): number {
  return cardWidth * (4 / 3) + CARD_TEXT_BLOCK_HEIGHT
}

const ZOOM_MIN = 0.6
const ZOOM_MAX = 1.8
const ZOOM_STEP = 0.05

function GameCard({ game }: { game: GameEntry }) {
  const { data: thumbnail } = useThumbnail(game.path, game.kind)

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.15 }}
      className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <div className="aspect-[3/4] w-full bg-muted">
        {thumbnail && (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <div className="shrink-0 p-2">
        <p className="truncate text-sm font-medium">{game.name}</p>
        <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>
      </div>
    </motion.div>
  )
}

interface GridCellProps {
  games: GameEntry[]
  columnCount: number
  gap: number
}

function GameCell({
  columnIndex,
  rowIndex,
  style,
  games,
  columnCount,
  gap,
}: CellComponentProps<GridCellProps>) {
  const index = rowIndex * columnCount + columnIndex
  const game = games[index]
  if (!game) return null
  return (
    <div style={{ ...style, padding: gap / 2 }}>
      <GameCard game={game} />
    </div>
  )
}

export function GalleryPage() {
  const { data: games, isLoading } = useGames()
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      setZoom((current) => {
        const next = event.deltaY > 0 ? current - ZOOM_STEP : current + ZOOM_STEP
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
      })
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [isLoading])

  if (isLoading || !games) {
    return (
      <div className="grid grid-cols-5 gap-4 p-6">
        {Array.from({ length: 15 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (games.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.
      </div>
    )
  }

  const cardWidth = CARD_WIDTH * zoom
  const cardHeight = computeCardHeight(cardWidth)
  const gap = GAP * zoom

  return (
    <div ref={containerRef} className="h-full w-full p-6">
      <AutoSizer
        style={{ height: '100%', width: '100%' }}
        renderProp={({ height, width }) => {
          if (height === undefined || width === undefined) return null

          const columnCount = Math.max(1, Math.floor(width / (cardWidth + gap)))
          const rowCount = Math.ceil(games.length / columnCount)

          return (
            <Grid
              cellComponent={GameCell}
              cellProps={{ games, columnCount, gap }}
              columnCount={columnCount}
              columnWidth={cardWidth + gap}
              rowCount={rowCount}
              rowHeight={cardHeight + gap}
              style={{ height, width, overflowX: 'hidden' }}
            />
          )
        }}
      />
    </div>
  )
}
```

Note: `zoom`/`setZoom` stay local to this component for now — Task 17 lifts them so `PageToolbar`'s slider can control the same value.

- [ ] **Step 5: Replace `src/pages/List/ListPage.tsx`**

```tsx
import { List, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { useGames } from '../../services/useGames'
import { useThumbnail } from '../../services/thumbnailService'
import { Skeleton } from '../../components/ui/skeleton'
import type { GameEntry } from '../../../shared/types/scanner'

const ROW_HEIGHT = 64

function formatMtime(mtimeMs: number): string {
  const date = new Date(mtimeMs)
  return date.toISOString().slice(0, 10)
}

function GameRow({ game }: { game: GameEntry }) {
  const { data: thumbnail } = useThumbnail(game.path, game.kind)

  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-2 transition-colors hover:bg-accent">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
        {thumbnail && (
          <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{game.name}</p>
        <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>
      </div>
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {formatMtime(game.mtimeMs)}
      </span>
    </div>
  )
}

interface ListRowProps {
  games: GameEntry[]
}

function Row({ index, style, games }: RowComponentProps<ListRowProps>) {
  const game = games[index]
  if (!game) return null
  return (
    <div style={style}>
      <GameRow game={game} />
    </div>
  )
}

export function ListPage() {
  const { data: games, isLoading } = useGames()

  if (isLoading || !games) {
    return (
      <div className="flex flex-col gap-2 p-6">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (games.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <AutoSizer
        style={{ height: '100%', width: '100%' }}
        renderProp={({ height, width }) => {
          if (height === undefined || width === undefined) return null

          return (
            <List
              rowComponent={Row}
              rowProps={{ games }}
              rowCount={games.length}
              rowHeight={ROW_HEIGHT}
              style={{ height, width }}
            />
          )
        }}
      />
    </div>
  )
}
```

- [ ] **Step 6: Verify manually via CDP**

Boot the app with a registered library pointing at a real temp folder containing at least one RJ-coded file/folder (with a `cover.jpg` inside for the folder case). Navigate to `#/` (Gallery) and `#/list`.
Expected: Gallery shows a card with the real thumbnail (or gray placeholder if none), the real filename as title, and the code as the second line. List shows the same entries with a real modified-date column. Navigating to an empty-library state shows the "등록된 라이브러리에서 인식된 게임이 없습니다" message.

- [ ] **Step 7: Typecheck, lint, and test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all exit 0. (No new unit tests in this task — Gallery/List are UI-verified manually per the project's established testing strategy; the underlying scanner/repository logic was already unit-tested in Tasks 1, 4, 5, 6.)

- [ ] **Step 8: Commit**

```bash
git add src/services/thumbnailService.ts src/services/useGames.ts src/services/mockGames.ts src/pages/Gallery/GalleryPage.tsx src/pages/List/ListPage.tsx
git commit -m "feat: wire Gallery and List to real scanned games with lazy thumbnails"
```

---

### Task 9: Explorer tab-state persistence (table, repository, IPC)

**Files:**
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Create: `electron/main/database/explorerTabsRepository.ts`
- Test: `electron/main/database/explorerTabsRepository.test.ts`
- Modify: `shared/types/ipc.ts`
- Create: `electron/main/ipc/explorerHandlers.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Consumes: `ExplorerTab` type (already defined in `src/stores/explorerStore.ts` as `{ id, label, path }` — this task adds `position`/`isActive` only at the persistence layer, not to the Zustand store's type).
- Produces: `saveExplorerTabs(db, tabs)`, `loadExplorerTabs(db)`, `window.api.explorerTabs.save(tabs)`, `window.api.explorerTabs.load()` — consumed by Task 10 (ExplorerPage wiring).

- [ ] **Step 1: Add the `explorer_tabs` table to `electron/main/database/schema.ts`**

Add this export (keep `appSettings` and `libraries` as they are):

```ts
export const explorerTabs = sqliteTable('explorer_tabs', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  path: text('path').notNull(),
  position: integer('position').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
})
```

Add `integer` to the existing `import { sqliteTable, text } from 'drizzle-orm/sqlite-core'` → `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'`.

- [ ] **Step 2: Add the `CREATE TABLE` statement to `electron/main/database/client.ts`**

Add after the `libraries` table's `sqlite.exec(...)` call:

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS explorer_tabs (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      path TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_active INTEGER NOT NULL
    )
  `)
```

- [ ] **Step 3: Write the failing test**

Create `electron/main/database/explorerTabsRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { loadExplorerTabs, saveExplorerTabs } from './explorerTabsRepository'

describe('explorerTabsRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns an empty list when nothing was ever saved', () => {
    expect(loadExplorerTabs(db)).toEqual([])
  })

  it('saves and reloads tabs in position order', () => {
    saveExplorerTabs(db, [
      { id: 'a', label: 'A', path: 'D:\\A', position: 0, isActive: false },
      { id: 'b', label: 'B', path: 'D:\\B', position: 1, isActive: true },
    ])

    expect(loadExplorerTabs(db)).toEqual([
      { id: 'a', label: 'A', path: 'D:\\A', position: 0, isActive: false },
      { id: 'b', label: 'B', path: 'D:\\B', position: 1, isActive: true },
    ])
  })

  it('replaces the previous tab set entirely on each save (not additive)', () => {
    saveExplorerTabs(db, [{ id: 'a', label: 'A', path: 'D:\\A', position: 0, isActive: true }])
    saveExplorerTabs(db, [{ id: 'b', label: 'B', path: 'D:\\B', position: 0, isActive: true }])

    expect(loadExplorerTabs(db)).toEqual([
      { id: 'b', label: 'B', path: 'D:\\B', position: 0, isActive: true },
    ])
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm run test -- electron/main/database/explorerTabsRepository.test.ts`
Expected: FAIL — `explorerTabsRepository.ts` does not exist.

- [ ] **Step 5: Implement `electron/main/database/explorerTabsRepository.ts`**

```ts
import type { AppDatabase } from './client'
import { explorerTabs } from './schema'

export interface PersistedExplorerTab {
  id: string
  label: string
  path: string
  position: number
  isActive: boolean
}

export function loadExplorerTabs(db: AppDatabase): PersistedExplorerTab[] {
  return db.select().from(explorerTabs).orderBy(explorerTabs.position).all()
}

// Full replace, not an upsert-by-id: the renderer always sends its complete,
// current tab list (including reorders/closes), so the persisted set should
// exactly mirror it rather than accumulating stale rows.
export function saveExplorerTabs(db: AppDatabase, tabs: PersistedExplorerTab[]): void {
  db.transaction((tx) => {
    tx.delete(explorerTabs).run()
    for (const tab of tabs) {
      tx.insert(explorerTabs).values(tab).run()
    }
  })
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- electron/main/database/explorerTabsRepository.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Add channels and schemas to `shared/types/ipc.ts`**

Add to `IPC_CHANNELS`:

```ts
  EXPLORER_SAVE_TABS: 'explorer:save-tabs',
  EXPLORER_LOAD_TABS: 'explorer:load-tabs',
```

Append to the bottom of the file:

```ts
export const PersistedExplorerTabSchema = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
  position: z.number(),
  isActive: z.boolean(),
})
export type PersistedExplorerTab = z.infer<typeof PersistedExplorerTabSchema>

export const SaveExplorerTabsRequestSchema = z.object({
  tabs: z.array(PersistedExplorerTabSchema),
})
export type SaveExplorerTabsRequest = z.infer<typeof SaveExplorerTabsRequestSchema>
```

- [ ] **Step 8: Create `electron/main/ipc/explorerHandlers.ts`**

```ts
import { ipcMain } from 'electron'
import { IPC_CHANNELS, SaveExplorerTabsRequestSchema } from '../../../shared/types/ipc'
import { loadExplorerTabs, saveExplorerTabs } from '../database/explorerTabsRepository'
import type { AppDatabase } from '../database/client'

export function registerExplorerHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.EXPLORER_LOAD_TABS, () => {
    return loadExplorerTabs(db)
  })

  ipcMain.handle(IPC_CHANNELS.EXPLORER_SAVE_TABS, (_event, payload: unknown) => {
    const { tabs } = SaveExplorerTabsRequestSchema.parse(payload)
    saveExplorerTabs(db, tabs)
  })
}
```

- [ ] **Step 9: Modify `electron/main/index.ts`** to register the handlers

Add the import `import { registerExplorerHandlers } from './ipc/explorerHandlers'` and the call `registerExplorerHandlers(db)` alongside the other `register*Handlers` calls inside `app.whenReady().then(...)`.

- [ ] **Step 10: Modify `electron/preload/index.ts`** to expose the explorer tabs API

Add to the `api` object:

```ts
  explorerTabs: {
    save: (tabs: PersistedExplorerTab[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_SAVE_TABS, { tabs }),
    load: (): Promise<PersistedExplorerTab[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPLORER_LOAD_TABS),
  },
```

Add `PersistedExplorerTab` to the existing type-only import from `shared/types/ipc`.

- [ ] **Step 11: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 12: Commit**

```bash
git add electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/explorerTabsRepository.ts electron/main/database/explorerTabsRepository.test.ts shared/types/ipc.ts electron/main/ipc/explorerHandlers.ts electron/main/index.ts electron/preload/index.ts
git commit -m "feat: add Explorer tab-state persistence (table, repository, IPC)"
```

---

### Task 10: Explorer — real folder data, tab persistence hook, updated DetailOverlay

**Files:**
- Create: `src/services/explorerTabsService.ts`
- Create: `src/services/scannerService.ts`
- Create: `src/hooks/useExplorerTabsPersistence.ts`
- Modify: `src/pages/Explorer/FolderView.tsx`
- Modify: `src/pages/Explorer/DetailOverlay.tsx`
- Modify: `src/pages/Explorer/ExplorerPage.tsx`
- Delete: `src/pages/Explorer/mockFolderEntries.ts`

**Interfaces:**
- Consumes: `window.api.scanner.scanShallow` (Task 7), `window.api.explorerTabs.save`/`load` (Task 9), `useThumbnail` (Task 8), `ScannedEntry` type (Task 4), `useExplorerStore`/`addTab` (existing, unchanged).
- Produces: `useFolderScan(path)`, `loadExplorerTabs()`/`saveExplorerTabs(tabs)`, `useExplorerTabsPersistence()` — the latter two have no other consumers in this plan, but the same pattern extends naturally if tab persistence needs are added elsewhere later.

- [ ] **Step 1: Create `src/services/explorerTabsService.ts`**

Per this project's convention, `window.api` is only ever called from `src/services/*` — this thin wrapper is what the persistence hook (Step 3) calls instead of reaching into `window.api` itself.

```ts
import type { PersistedExplorerTab } from '../../shared/types/ipc'

export function loadExplorerTabs(): Promise<PersistedExplorerTab[]> {
  return window.api.explorerTabs.load()
}

export function saveExplorerTabs(tabs: PersistedExplorerTab[]): Promise<void> {
  return window.api.explorerTabs.save(tabs)
}
```

- [ ] **Step 2: Create `src/services/scannerService.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import type { ScannedEntry } from '../../shared/types/scanner'

export function useFolderScan(path: string) {
  return useQuery<ScannedEntry[]>({
    queryKey: ['folder-scan', path],
    queryFn: () => window.api.scanner.scanShallow(path),
  })
}
```

- [ ] **Step 3: Create `src/hooks/useExplorerTabsPersistence.ts`**

```ts
import { useEffect, useRef } from 'react'
import { useExplorerStore } from '../stores/explorerStore'
import { loadExplorerTabs, saveExplorerTabs } from '../services/explorerTabsService'

const SAVE_DEBOUNCE_MS = 500

// Hydrates useExplorerStore from SQLite on mount (falling back to the store's
// hardcoded initialTabs if nothing was ever saved), then persists every
// subsequent tab change back to SQLite, debounced so a drag-reorder or rapid
// tab actions don't trigger a write per intermediate state.
export function useExplorerTabsPersistence(): void {
  const hydratedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    loadExplorerTabs().then((persisted) => {
      if (cancelled) return
      if (persisted.length > 0) {
        const tabs = [...persisted]
          .sort((a, b) => a.position - b.position)
          .map(({ id, label, path }) => ({ id, label, path }))
        const active = persisted.find((tab) => tab.isActive)
        useExplorerStore.setState({ tabs, activeTabId: active?.id ?? tabs[0].id })
      }
      hydratedRef.current = true
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const unsubscribe = useExplorerStore.subscribe((state) => {
      if (!hydratedRef.current) return
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        const payload = state.tabs.map((tab, index) => ({
          ...tab,
          position: index,
          isActive: tab.id === state.activeTabId,
        }))
        saveExplorerTabs(payload)
      }, SAVE_DEBOUNCE_MS)
    })

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      unsubscribe()
    }
  }, [])
}
```

- [ ] **Step 4: Replace `src/pages/Explorer/FolderView.tsx`**

```tsx
import { useState } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../components/ui/context-menu'
import { pathToBreadcrumbSegments } from './breadcrumb'
import { useExplorerStore } from '../../stores/explorerStore'
import { useThumbnail } from '../../services/thumbnailService'
import { useFolderScan } from '../../services/scannerService'
import { DetailOverlay } from './DetailOverlay'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface FolderViewProps {
  tabId: string
  path: string
  onNavigate: (path: string) => void
}

function FolderEntryContextMenu({
  entry,
  onOpenInNewTab,
}: {
  entry: ScannedEntry
  onOpenInNewTab: (entry: ScannedEntry) => void
}) {
  if (entry.code) {
    return (
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => console.log('launch', entry.path)}>실행</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('open dlsite page', entry.code?.value)}>
          DLsite 페이지 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('open folder', entry.path)}>
          폴더 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.code?.value ?? '')}>
          RJ번호 복사
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.name)}>
          제목 복사
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('edit custom title', entry.path)}>
          사용자 지정 제목 편집
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('refresh metadata', entry.code?.value)}>
          메타데이터 새로고침
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('redownload cover', entry.code?.value)}>
          커버 이미지 재다운로드
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('extract archive', entry.path)}>
          압축 해제
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('toggle favorite', entry.path)}>
          즐겨찾기 설정
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('edit memo', entry.path)}>
          메모 설정
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('set rating', entry.path)}>
          평점 설정
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }

  if (entry.kind === 'folder') {
    return (
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onOpenInNewTab(entry)}>새 탭으로 열기</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('reveal in OS explorer', entry.path)}>
          탐색기(OS)에서 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('pin favorite', entry.path)}>
          즐겨찾기로 고정
        </ContextMenuItem>
      </ContextMenuContent>
    )
  }

  return null
}

function FolderEntryRow({
  entry,
  onOpenInNewTab,
  onEntryClick,
}: {
  entry: ScannedEntry
  onOpenInNewTab: (entry: ScannedEntry) => void
  onEntryClick: (entry: ScannedEntry) => void
}) {
  const { data: thumbnail } = useThumbnail(entry.path, entry.kind)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
          onClick={() => onEntryClick(entry)}
        >
          {entry.code && (
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
              {thumbnail && (
                <img src={thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
              )}
            </div>
          )}
          <span className="truncate">{entry.name}</span>
        </li>
      </ContextMenuTrigger>
      <FolderEntryContextMenu entry={entry} onOpenInNewTab={onOpenInNewTab} />
    </ContextMenu>
  )
}

export function FolderView({ tabId, path, onNavigate }: FolderViewProps) {
  const [selectedGame, setSelectedGame] = useState<ScannedEntry | null>(null)
  const addTab = useExplorerStore((s) => s.addTab)
  const breadcrumbs = pathToBreadcrumbSegments(path)

  // useFolderScan's queryKey includes `path`, so React Query automatically
  // re-fetches when it changes - ExplorerPage keys FolderView only on the
  // active tab's id, not its path, so navigating into a subfolder (or via
  // breadcrumb) updates `path` without unmounting this component.
  const { data: entries = [] } = useFolderScan(path)

  const openInNewTab = (entry: ScannedEntry): void => {
    addTab({ label: entry.name, path: entry.path })
  }

  const handleEntryClick = (entry: ScannedEntry): void => {
    if (entry.code) {
      setSelectedGame(entry)
    } else if (entry.kind === 'folder') {
      onNavigate(entry.path)
    }
  }

  return (
    <div className="flex h-full flex-col" data-tab-id={tabId}>
      <div className="flex items-center gap-1 border-b border-border px-4 py-2 text-sm text-muted-foreground">
        {breadcrumbs.map((segment, index) => (
          <span key={segment.path} className="flex items-center gap-1">
            {index > 0 && <span>/</span>}
            <button
              className="hover:text-foreground hover:underline"
              onClick={() => onNavigate(segment.path)}
            >
              {segment.label}
            </button>
          </span>
        ))}
      </div>
      <ul className="flex-1 divide-y divide-border overflow-auto">
        {entries.map((entry) => (
          <FolderEntryRow
            key={entry.path}
            entry={entry}
            onOpenInNewTab={openInNewTab}
            onEntryClick={handleEntryClick}
          />
        ))}
      </ul>
      <DetailOverlay game={selectedGame} onClose={() => setSelectedGame(null)} />
    </div>
  )
}
```

- [ ] **Step 5: Replace `src/pages/Explorer/DetailOverlay.tsx`**

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { useThumbnail } from '../../services/thumbnailService'
import type { ScannedEntry } from '../../../shared/types/scanner'

interface DetailOverlayProps {
  game: ScannedEntry | null
  onClose: () => void
}

export function DetailOverlay({ game, onClose }: DetailOverlayProps) {
  const { data: thumbnail } = useThumbnail(game?.path ?? '', game?.kind ?? 'file')

  return (
    <Dialog open={game !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {game && game.code && (
          <>
            <DialogHeader>
              <DialogTitle>{game.name}</DialogTitle>
            </DialogHeader>
            <div className="flex gap-4">
              <div className="h-40 w-32 shrink-0 overflow-hidden rounded bg-muted">
                {thumbnail && (
                  <img
                    src={thumbnail}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <p>작품번호: {game.code.value}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => console.log('open dlsite page', game.code?.value)}>
                DLsite 열기
              </Button>
              <Button variant="secondary" onClick={() => console.log('open folder', game.path)}>
                폴더 열기
              </Button>
              <Button variant="secondary" onClick={() => console.log('launch', game.path)}>
                실행
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

Note: `제작사`/`발매일` (circle/release date) are dropped — this stage has no metadata crawling, so there's no real data for them (per the spec's explicit scope decision).

- [ ] **Step 6: Replace `src/pages/Explorer/ExplorerPage.tsx`**

```tsx
import { TabBar } from './TabBar'
import { FolderView } from './FolderView'
import { useExplorerStore } from '../../stores/explorerStore'
import { useExplorerTabsPersistence } from '../../hooks/useExplorerTabsPersistence'

export function ExplorerPage() {
  useExplorerTabsPersistence()
  const activeTab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const navigateTab = useExplorerStore((s) => s.navigateTab)

  return (
    <div className="flex h-full flex-col">
      <TabBar />
      {activeTab ? (
        <FolderView
          key={activeTab.id}
          tabId={activeTab.id}
          path={activeTab.path}
          onNavigate={(path) => navigateTab(activeTab.id, path)}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          열려있는 탭이 없습니다.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Delete `src/pages/Explorer/mockFolderEntries.ts`**

Run: `rm src/pages/Explorer/mockFolderEntries.ts`

- [ ] **Step 8: Verify manually via CDP**

Boot the app, navigate to Explorer with a tab pointed at a real temp folder containing a subfolder, an RJ-coded file, and an RJ-coded folder (with `cover.jpg` inside). Confirm: subfolder navigates in on click; the RJ-coded file/folder opens `DetailOverlay` with the real thumbnail and code; the plain subfolder's right-click menu has the 3-item "general folder" menu, the coded entries have the 12-item "game" menu. Then quit the app fully (not just close the window) and relaunch — confirm the same tabs/active tab are restored (tab persistence from Task 9).

- [ ] **Step 9: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 10: Commit**

```bash
git add src/services/explorerTabsService.ts src/services/scannerService.ts src/hooks/useExplorerTabsPersistence.ts src/pages/Explorer/FolderView.tsx src/pages/Explorer/DetailOverlay.tsx src/pages/Explorer/ExplorerPage.tsx src/pages/Explorer/mockFolderEntries.ts
git commit -m "feat: wire Explorer to real folder scans and persist tab state"
```

---

### Task 11: Sort preferences (table, repository, IPC)

**Files:**
- Modify: `electron/main/database/schema.ts`
- Modify: `electron/main/database/client.ts`
- Create: `electron/main/database/sortPreferencesRepository.ts`
- Test: `electron/main/database/sortPreferencesRepository.test.ts`
- Modify: `shared/types/ipc.ts`
- Create: `electron/main/ipc/sortHandlers.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`

**Interfaces:**
- Produces: `getSortPreference(db, page)`, `setSortPreference(db, page, field, direction)`, `window.api.sort.get(page)`, `window.api.sort.set(page, field, direction)` — consumed by Task 12 (`PageToolbar` + `useSortPreference` hook).

- [ ] **Step 1: Add the `sort_preferences` table to `electron/main/database/schema.ts`**

Add this export:

```ts
export const sortPreferences = sqliteTable('sort_preferences', {
  page: text('page').primaryKey(),
  field: text('field').notNull(),
  direction: text('direction').notNull(),
})
```

- [ ] **Step 2: Add the `CREATE TABLE` statement to `electron/main/database/client.ts`**

```ts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sort_preferences (
      page TEXT PRIMARY KEY,
      field TEXT NOT NULL,
      direction TEXT NOT NULL
    )
  `)
```

- [ ] **Step 3: Write the failing test**

Create `electron/main/database/sortPreferencesRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { getSortPreference, setSortPreference } from './sortPreferencesRepository'

describe('sortPreferencesRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns undefined when no preference was ever set for a page', () => {
    expect(getSortPreference(db, 'gallery')).toBeUndefined()
  })

  it('stores and retrieves a preference', () => {
    setSortPreference(db, 'gallery', 'mtime', 'desc')
    expect(getSortPreference(db, 'gallery')).toEqual({ field: 'mtime', direction: 'desc' })
  })

  it('overwrites an existing preference for the same page', () => {
    setSortPreference(db, 'gallery', 'mtime', 'desc')
    setSortPreference(db, 'gallery', 'name', 'asc')
    expect(getSortPreference(db, 'gallery')).toEqual({ field: 'name', direction: 'asc' })
  })

  it('keeps preferences for different pages independent', () => {
    setSortPreference(db, 'gallery', 'mtime', 'desc')
    setSortPreference(db, 'list', 'name', 'asc')
    expect(getSortPreference(db, 'gallery')).toEqual({ field: 'mtime', direction: 'desc' })
    expect(getSortPreference(db, 'list')).toEqual({ field: 'name', direction: 'asc' })
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm run test -- electron/main/database/sortPreferencesRepository.test.ts`
Expected: FAIL — `sortPreferencesRepository.ts` does not exist.

- [ ] **Step 5: Implement `electron/main/database/sortPreferencesRepository.ts`**

```ts
import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { sortPreferences } from './schema'

export type SortField = 'name' | 'mtime'
export type SortDirection = 'asc' | 'desc'
export type SortPage = 'gallery' | 'list' | 'explorer'

export interface SortPreference {
  field: SortField
  direction: SortDirection
}

export function getSortPreference(db: AppDatabase, page: SortPage): SortPreference | undefined {
  const row = db.select().from(sortPreferences).where(eq(sortPreferences.page, page)).get()
  if (!row) return undefined
  return { field: row.field as SortField, direction: row.direction as SortDirection }
}

export function setSortPreference(
  db: AppDatabase,
  page: SortPage,
  field: SortField,
  direction: SortDirection
): void {
  db.insert(sortPreferences)
    .values({ page, field, direction })
    .onConflictDoUpdate({ target: sortPreferences.page, set: { field, direction } })
    .run()
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- electron/main/database/sortPreferencesRepository.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Add channels and schemas to `shared/types/ipc.ts`**

Add to `IPC_CHANNELS`:

```ts
  SORT_GET: 'sort:get',
  SORT_SET: 'sort:set',
```

Append to the bottom of the file:

```ts
export const SortPageSchema = z.enum(['gallery', 'list', 'explorer'])
export type SortPage = z.infer<typeof SortPageSchema>

export const SortFieldSchema = z.enum(['name', 'mtime'])
export type SortField = z.infer<typeof SortFieldSchema>

export const SortDirectionSchema = z.enum(['asc', 'desc'])
export type SortDirection = z.infer<typeof SortDirectionSchema>

export const GetSortRequestSchema = z.object({
  page: SortPageSchema,
})
export type GetSortRequest = z.infer<typeof GetSortRequestSchema>

export const SetSortRequestSchema = z.object({
  page: SortPageSchema,
  field: SortFieldSchema,
  direction: SortDirectionSchema,
})
export type SetSortRequest = z.infer<typeof SetSortRequestSchema>

export interface SortPreference {
  field: SortField
  direction: SortDirection
}
```

- [ ] **Step 8: Create `electron/main/ipc/sortHandlers.ts`**

```ts
import { ipcMain } from 'electron'
import { GetSortRequestSchema, IPC_CHANNELS, SetSortRequestSchema } from '../../../shared/types/ipc'
import { getSortPreference, setSortPreference } from '../database/sortPreferencesRepository'
import type { AppDatabase } from '../database/client'

export function registerSortHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SORT_GET, (_event, payload: unknown) => {
    const { page } = GetSortRequestSchema.parse(payload)
    return getSortPreference(db, page) ?? null
  })

  ipcMain.handle(IPC_CHANNELS.SORT_SET, (_event, payload: unknown) => {
    const { page, field, direction } = SetSortRequestSchema.parse(payload)
    setSortPreference(db, page, field, direction)
  })
}
```

- [ ] **Step 9: Modify `electron/main/index.ts`** to register the handlers

Add the import `import { registerSortHandlers } from './ipc/sortHandlers'` and the call `registerSortHandlers(db)` alongside the other `register*Handlers` calls.

- [ ] **Step 10: Modify `electron/preload/index.ts`** to expose the sort API

Add to the `api` object:

```ts
  sort: {
    get: (page: SortPage): Promise<SortPreference | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SORT_GET, { page }),
    set: (page: SortPage, field: SortPreference['field'], direction: SortPreference['direction']): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SORT_SET, { page, field, direction }),
  },
```

Add `SortPage, SortPreference` to the existing type-only import from `shared/types/ipc`.

- [ ] **Step 11: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 12: Commit**

```bash
git add electron/main/database/schema.ts electron/main/database/client.ts electron/main/database/sortPreferencesRepository.ts electron/main/database/sortPreferencesRepository.test.ts shared/types/ipc.ts electron/main/ipc/sortHandlers.ts electron/main/index.ts electron/preload/index.ts
git commit -m "feat: add persisted sort preferences (table, repository, IPC)"
```

---

### Task 12: Sort + zoom toolbar (`PageToolbar`), wired into Gallery/List/Explorer

**Files:**
- Create: `src/lib/sortEntries.ts`
- Test: `src/lib/sortEntries.test.ts`
- Create: `src/services/sortService.ts`
- Create: `src/components/layout/PageToolbar.tsx`
- Modify: `src/pages/Gallery/GalleryPage.tsx`
- Modify: `src/pages/List/ListPage.tsx`
- Modify: `src/pages/Explorer/FolderView.tsx`

**Interfaces:**
- Consumes: `window.api.sort.get`/`set` (Task 11), `SortField`/`SortDirection`/`SortPage` types (Task 11).
- Produces: `sortEntries(entries, field, direction)`, `useSortPreference(page)`, `<PageToolbar>` — no further consumers in this plan.

- [ ] **Step 1: Write the failing test**

Create `src/lib/sortEntries.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sortEntries } from './sortEntries'

interface Sortable {
  name: string
  mtimeMs: number
}

const items: Sortable[] = [
  { name: 'banana', mtimeMs: 200 },
  { name: 'apple', mtimeMs: 300 },
  { name: 'cherry', mtimeMs: 100 },
]

describe('sortEntries', () => {
  it('sorts by name ascending', () => {
    expect(sortEntries(items, 'name', 'asc').map((i) => i.name)).toEqual([
      'apple',
      'banana',
      'cherry',
    ])
  })

  it('sorts by name descending', () => {
    expect(sortEntries(items, 'name', 'desc').map((i) => i.name)).toEqual([
      'cherry',
      'banana',
      'apple',
    ])
  })

  it('sorts by mtime ascending', () => {
    expect(sortEntries(items, 'mtime', 'asc').map((i) => i.name)).toEqual([
      'cherry',
      'banana',
      'apple',
    ])
  })

  it('sorts by mtime descending', () => {
    expect(sortEntries(items, 'mtime', 'desc').map((i) => i.name)).toEqual([
      'apple',
      'banana',
      'cherry',
    ])
  })

  it('does not mutate the input array', () => {
    const copy = [...items]
    sortEntries(items, 'name', 'asc')
    expect(items).toEqual(copy)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- src/lib/sortEntries.test.ts`
Expected: FAIL — `sortEntries.ts` does not exist.

- [ ] **Step 3: Implement `src/lib/sortEntries.ts`**

```ts
export interface Sortable {
  name: string
  mtimeMs: number
}

export function sortEntries<T extends Sortable>(
  entries: T[],
  field: 'name' | 'mtime',
  direction: 'asc' | 'desc'
): T[] {
  const sorted = [...entries].sort((a, b) => {
    const comparison = field === 'name' ? a.name.localeCompare(b.name) : a.mtimeMs - b.mtimeMs
    return direction === 'asc' ? comparison : -comparison
  })
  return sorted
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/sortEntries.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Install shadcn `select` and `slider` components**

Run: `npx shadcn@latest add select slider -y`
Expected: creates `src/components/ui/select.tsx` and `src/components/ui/slider.tsx`, adds `@radix-ui/react-select` and `@radix-ui/react-slider` to `package.json`. If the CLI generates a bare-specifier import (`from "src/lib/utils"` or similar, as it did in Task 4a), fix it to the relative import (`../../lib/utils`) matching every other file in `src/components/ui/`.

- [ ] **Step 6: Create `src/services/sortService.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SortPage, SortPreference } from '../../shared/types/ipc'

function sortQueryKey(page: SortPage) {
  return ['sort', page] as const
}

const DEFAULT_SORT: SortPreference = { field: 'name', direction: 'asc' }

export function useSortPreference(page: SortPage) {
  const queryClient = useQueryClient()

  const { data } = useQuery<SortPreference | null>({
    queryKey: sortQueryKey(page),
    queryFn: () => window.api.sort.get(page),
  })

  const setSortMutation = useMutation({
    mutationFn: (preference: SortPreference) =>
      window.api.sort.set(page, preference.field, preference.direction),
    onSuccess: (_result, preference) => {
      queryClient.setQueryData(sortQueryKey(page), preference)
    },
  })

  const preference = data ?? DEFAULT_SORT

  return {
    field: preference.field,
    direction: preference.direction,
    setSort: (field: SortPreference['field'], direction: SortPreference['direction']) =>
      setSortMutation.mutate({ field, direction }),
  }
}
```

- [ ] **Step 7: Create `src/components/layout/PageToolbar.tsx`**

```tsx
import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Slider } from '../ui/slider'
import type { SortDirection, SortField } from '../../../shared/types/ipc'

interface PageToolbarProps {
  sortField: SortField
  sortDirection: SortDirection
  onSortChange: (field: SortField, direction: SortDirection) => void
  zoom?: number
  onZoomChange?: (zoom: number) => void
}

const SORT_FIELD_LABELS: Record<SortField, string> = {
  name: '이름',
  mtime: '변경시간',
}

export function PageToolbar({
  sortField,
  sortDirection,
  onSortChange,
  zoom,
  onZoomChange,
}: PageToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2">
      <Select value={sortField} onValueChange={(value) => onSortChange(value as SortField, sortDirection)}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">{SORT_FIELD_LABELS.name}</SelectItem>
          <SelectItem value="mtime">{SORT_FIELD_LABELS.mtime}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        aria-label="정렬 방향 전환"
        onClick={() => onSortChange(sortField, sortDirection === 'asc' ? 'desc' : 'asc')}
      >
        {sortDirection === 'asc' ? (
          <ArrowUpAZ className="h-4 w-4" />
        ) : (
          <ArrowDownAZ className="h-4 w-4" />
        )}
      </Button>
      {zoom !== undefined && onZoomChange && (
        <Slider
          className="ml-auto w-40"
          value={[zoom]}
          min={0.6}
          max={1.8}
          step={0.05}
          onValueChange={([value]) => onZoomChange(value)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 8: Modify `src/pages/Gallery/GalleryPage.tsx`** to add the toolbar, wire zoom into it, and apply sorting

Add these imports:

```ts
import { PageToolbar } from '../../components/layout/PageToolbar'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
```

Inside `GalleryPage`, after `const { data: games, isLoading } = useGames()`, add:

```ts
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('gallery')
```

Replace the `if (games.length === 0)` block and everything after it with (the toolbar now wraps the existing content, and `games` is sorted before being passed to the grid):

```tsx
  const sortedGames = games.length > 0 ? sortEntries(games, sortField, sortDirection) : games

  return (
    <div className="flex h-full flex-col">
      <PageToolbar
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={setSort}
        zoom={zoom}
        onZoomChange={setZoom}
      />
      {sortedGames.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.
        </div>
      ) : (
        <div ref={containerRef} className="h-full w-full p-6">
          <AutoSizer
            style={{ height: '100%', width: '100%' }}
            renderProp={({ height, width }) => {
              if (height === undefined || width === undefined) return null

              const columnCount = Math.max(1, Math.floor(width / (cardWidth + gap)))
              const rowCount = Math.ceil(sortedGames.length / columnCount)

              return (
                <Grid
                  cellComponent={GameCell}
                  cellProps={{ games: sortedGames, columnCount, gap }}
                  columnCount={columnCount}
                  columnWidth={cardWidth + gap}
                  rowCount={rowCount}
                  rowHeight={cardHeight + gap}
                  style={{ height, width, overflowX: 'hidden' }}
                />
              )
            }}
          />
        </div>
      )}
    </div>
  )
```

This replaces the component's final `return` statement — the `isLoading`/skeleton early-return above it stays as-is, and the `cardWidth`/`cardHeight`/`gap` `const` declarations right before the old `return` also stay (they're still needed).

- [ ] **Step 9: Modify `src/pages/List/ListPage.tsx`** to add the toolbar and sorting

Add these imports:

```ts
import { PageToolbar } from '../../components/layout/PageToolbar'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
```

Inside `ListPage`, after `const { data: games, isLoading } = useGames()`, add:

```ts
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('list')
```

Replace the final `return` statement (the one rendering `AutoSizer`/`List`, and the empty-state block before it) with:

```tsx
  const sortedGames = games.length > 0 ? sortEntries(games, sortField, sortDirection) : games

  return (
    <div className="flex h-full flex-col">
      <PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />
      {sortedGames.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          등록된 라이브러리에서 인식된 게임이 없습니다. 설정에서 라이브러리를 추가해 보세요.
        </div>
      ) : (
        <div className="h-full w-full">
          <AutoSizer
            style={{ height: '100%', width: '100%' }}
            renderProp={({ height, width }) => {
              if (height === undefined || width === undefined) return null

              return (
                <List
                  rowComponent={Row}
                  rowProps={{ games: sortedGames }}
                  rowCount={sortedGames.length}
                  rowHeight={ROW_HEIGHT}
                  style={{ height, width }}
                />
              )
            }}
          />
        </div>
      )}
    </div>
  )
```

- [ ] **Step 10: Modify `src/pages/Explorer/FolderView.tsx`** to add the toolbar and sorting

Add these imports:

```ts
import { PageToolbar } from '../../components/layout/PageToolbar'
import { useSortPreference } from '../../services/sortService'
import { sortEntries } from '../../lib/sortEntries'
```

Inside `FolderView`, after the `useEffect` that scans `path`, add:

```ts
  const { field: sortField, direction: sortDirection, setSort } = useSortPreference('explorer')
  const sortedEntries = sortEntries(entries, sortField, sortDirection)
```

Add `<PageToolbar sortField={sortField} sortDirection={sortDirection} onSortChange={setSort} />` immediately below the breadcrumb `<div>` (before the `<ul>`), and change the `<ul>`'s `{entries.map(...)}` to `{sortedEntries.map(...)}`.

- [ ] **Step 11: Verify manually via CDP**

Boot the app with a library containing several coded files with different names/mtimes. On Gallery: confirm the sort dropdown and direction toggle reorder the cards, and the zoom slider changes card size (dragging it produces the same visual effect Ctrl+wheel already did, and both controls stay in sync since they share the same `zoom` state). On List and Explorer: confirm the sort controls work (no zoom slider on these two — `zoom`/`onZoomChange` are omitted, so `PageToolbar` doesn't render one). Quit and relaunch the app — confirm each page's sort choice is still applied (persisted via SQLite, not reset to the default).

- [ ] **Step 12: Typecheck, lint, and test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all exit 0.

- [ ] **Step 13: Commit**

```bash
git add src/lib/sortEntries.ts src/lib/sortEntries.test.ts src/services/sortService.ts src/components/layout/PageToolbar.tsx src/components/ui/select.tsx src/components/ui/slider.tsx package.json package-lock.json src/pages/Gallery/GalleryPage.tsx src/pages/List/ListPage.tsx src/pages/Explorer/FolderView.tsx
git commit -m "feat: add persisted sort toolbar and Gallery zoom slider"
```

---

### Task 13: External URL builder and `shell:open-external` IPC

**Files:**
- Create: `electron/main/shell/buildExternalUrl.ts`
- Test: `electron/main/shell/buildExternalUrl.test.ts`
- Modify: `shared/types/ipc.ts`
- Create: `electron/main/ipc/shellHandlers.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`
- Create: `src/services/shellService.ts`

**Interfaces:**
- Consumes: `GameCode` type (Task 4).
- Produces: `buildExternalUrl(code: GameCode): string`, `window.api.shell.openExternal(code: GameCode): Promise<void>`, `useOpenExternal()` (a React Query mutation hook wrapping the IPC call — per this project's convention, components call this, never `window.api` directly) — consumed by Task 14 (DetailOverlay, List, FolderView context menu).

- [ ] **Step 1: Write the failing test**

Create `electron/main/shell/buildExternalUrl.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildExternalUrl } from './buildExternalUrl'

describe('buildExternalUrl', () => {
  it('builds a DLsite URL for an RJ code', () => {
    expect(buildExternalUrl({ type: 'RJ', value: 'RJ01169914' })).toBe(
      'http://dlsite.com/maniax/work/=/product_id/RJ01169914.html'
    )
  })

  it('builds a DLsite URL for a VJ code using the same pattern', () => {
    expect(buildExternalUrl({ type: 'VJ', value: 'VJ009988' })).toBe(
      'http://dlsite.com/maniax/work/=/product_id/VJ009988.html'
    )
  })

  it('builds a Steam URL for an ST code, stripping the ST prefix', () => {
    expect(buildExternalUrl({ type: 'ST', value: 'ST4282500' })).toBe(
      'https://store.steampowered.com/app/4282500'
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- electron/main/shell/buildExternalUrl.test.ts`
Expected: FAIL — `buildExternalUrl.ts` does not exist.

- [ ] **Step 3: Implement `electron/main/shell/buildExternalUrl.ts`**

```ts
import type { GameCode } from '../../../shared/types/scanner'

// VJ is assumed to share RJ's DLsite URL pattern (product_id slot swapped for
// the VJ code) - this has not been independently confirmed against a real VJ
// listing. If it turns out to be wrong, only this function needs to change.
export function buildExternalUrl(code: GameCode): string {
  if (code.type === 'ST') {
    const numericId = code.value.slice(2)
    return `https://store.steampowered.com/app/${numericId}`
  }
  return `http://dlsite.com/maniax/work/=/product_id/${code.value}.html`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- electron/main/shell/buildExternalUrl.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add channel and schema to `shared/types/ipc.ts`**

Add to `IPC_CHANNELS`:

```ts
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
```

Append to the bottom of the file:

```ts
export const GameCodeSchema = z.object({
  type: z.enum(['RJ', 'VJ', 'ST']),
  value: z.string(),
})

export const OpenExternalRequestSchema = z.object({
  code: GameCodeSchema,
})
export type OpenExternalRequest = z.infer<typeof OpenExternalRequestSchema>
```

- [ ] **Step 6: Create `electron/main/ipc/shellHandlers.ts`**

```ts
import { shell, ipcMain } from 'electron'
import { IPC_CHANNELS, OpenExternalRequestSchema } from '../../../shared/types/ipc'
import { buildExternalUrl } from '../shell/buildExternalUrl'

export function registerShellHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, (_event, payload: unknown) => {
    const { code } = OpenExternalRequestSchema.parse(payload)
    const url = buildExternalUrl(code)
    return shell.openExternal(url)
  })
}
```

- [ ] **Step 7: Modify `electron/main/index.ts`** to register the handler

Add the import `import { registerShellHandlers } from './ipc/shellHandlers'` and the call `registerShellHandlers()` (no `db` argument needed) alongside the other `register*Handlers` calls.

- [ ] **Step 8: Modify `electron/preload/index.ts`** to expose the shell API

Add to the `api` object:

```ts
  shell: {
    openExternal: (code: GameCode): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, { code }),
  },
```

Add `import type { GameCode } from '../../shared/types/scanner'` to the top of the file.

- [ ] **Step 9: Create `src/services/shellService.ts`**

Components must never call `window.api` directly (per this project's established convention) — this wrapper is what Task 14's UI code calls instead.

```ts
import { useMutation } from '@tanstack/react-query'
import type { GameCode } from '../../shared/types/scanner'

export function useOpenExternal() {
  return useMutation({
    mutationFn: (code: GameCode) => window.api.shell.openExternal(code),
  })
}
```

- [ ] **Step 10: Verify manually via CDP**

Boot the app and run from the console:

```js
await window.api.shell.openExternal({ type: 'ST', value: 'ST4282500' })
```

Expected: the OS default browser opens to `https://store.steampowered.com/app/4282500`.

- [ ] **Step 11: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 12: Commit**

```bash
git add electron/main/shell/buildExternalUrl.ts electron/main/shell/buildExternalUrl.test.ts shared/types/ipc.ts electron/main/ipc/shellHandlers.ts electron/main/index.ts electron/preload/index.ts src/services/shellService.ts
git commit -m "feat: add RJ/VJ/ST external URL builder and shell:open-external IPC"
```

---

### Task 14: Wire RJ/VJ/ST hyperlinks into DetailOverlay, List, and Explorer's context menu

**Files:**
- Modify: `src/pages/Explorer/DetailOverlay.tsx`
- Modify: `src/pages/Explorer/FolderView.tsx`
- Modify: `src/pages/List/ListPage.tsx`

**Interfaces:**
- Consumes: `useOpenExternal()` (Task 13). Components call this hook, never `window.api.shell.openExternal` directly.

- [ ] **Step 1: Modify `src/pages/Explorer/DetailOverlay.tsx`**

Add the import: `import { useOpenExternal } from '../../services/shellService'`.

Inside `DetailOverlay`, alongside the existing `useThumbnail` call, add:

```ts
  const openExternal = useOpenExternal()
```

Replace the `<p>작품번호: {game.code.value}</p>` line with a clickable version:

```tsx
                <button
                  className="text-left underline-offset-2 hover:underline"
                  onClick={() => game.code && openExternal.mutate(game.code)}
                >
                  작품번호: {game.code.value}
                </button>
```

Replace the "DLsite 열기" button's `onClick` from `() => console.log('open dlsite page', game.code?.value)` to:

```tsx
                onClick={() => game.code && openExternal.mutate(game.code)}
```

- [ ] **Step 2: Modify `src/pages/Explorer/FolderView.tsx`**

Add the import: `import { useOpenExternal } from '../../services/shellService'`.

`FolderEntryContextMenu` is currently a plain function component that receives `entry`/`onOpenInNewTab` as props with no hooks of its own. Add the `useOpenExternal` call inside it:

```tsx
function FolderEntryContextMenu({
  entry,
  onOpenInNewTab,
}: {
  entry: ScannedEntry
  onOpenInNewTab: (entry: ScannedEntry) => void
}) {
  const openExternal = useOpenExternal()

  if (entry.code) {
```

(This adds the hook call as the first line of the function body, before the existing `if (entry.code) {` branch — the rest of the function's structure is unchanged.)

Replace the "DLsite 페이지 열기" item's `onSelect` from `() => console.log('open dlsite page', entry.code?.value)` to:

```tsx
        <ContextMenuItem onSelect={() => entry.code && openExternal.mutate(entry.code)}>
          DLsite 페이지 열기
        </ContextMenuItem>
```

(Replace only the `ContextMenuItem` for "DLsite 페이지 열기" — the other 11 game-menu items and the 3 folder-menu items stay as console.log stubs, unchanged.)

- [ ] **Step 3: Modify `src/pages/List/ListPage.tsx`**

Add the import: `import { useOpenExternal } from '../../services/shellService'`.

Inside `GameRow`, alongside the existing `useThumbnail` call, add:

```ts
  const openExternal = useOpenExternal()
```

Task 8's `GameRow` renders the code as a truncated subtitle under the name:

```tsx
        <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>
```

Replace that line with a clickable version:

```tsx
        <button
          className="truncate text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => openExternal.mutate(game.code)}
        >
          {game.code.value}
        </button>
```

- [ ] **Step 4: Verify manually via CDP**

Boot the app with a registered library containing a real RJ-coded and a real ST-coded entry. On Explorer: open `DetailOverlay` for the RJ entry, click "작품번호: RJ..." text and the "DLsite 열기" button — confirm both open the same DLsite URL in the default browser. Right-click the entry and click "DLsite 페이지 열기" — confirm it also opens the same URL. On List: click the ST entry's code column — confirm the Steam URL opens.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Explorer/DetailOverlay.tsx src/pages/Explorer/FolderView.tsx src/pages/List/ListPage.tsx
git commit -m "feat: wire RJ/VJ/ST hyperlinks to open DLsite/Steam in the default browser"
```

---

### Task 15: Final verification pass

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full verification suite**

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
npm run build
```
Expected: all five exit 0.

- [ ] **Step 2: Full manual walkthrough via CDP**

Using a real temp directory tree with: a plain subfolder, an RJ-coded zip file, an RJ-coded unzipped folder with a `cover.jpg` inside, a VJ-coded entry, and an ST-coded entry — registered as a library via Settings' folder picker:

1. Gallery shows all coded entries with real thumbnails where available, sorted per the current sort preference, with a working Ctrl+wheel zoom AND toolbar slider (same state).
2. List shows the same entries with a real modified-date column and clickable codes.
3. Explorer's shallow view shows every entry (coded or not) with the correct context menu per entry type, sortable via its own toolbar, and its tab state survives a full app restart.
4. Settings shows the registered library with a working "삭제" button and the folder-picker button.
5. Clicking any RJ/VJ code opens the DLsite URL; any ST code opens the Steam URL; both in the OS default browser.

- [ ] **Step 3: Commit** (only if Step 1 or Step 2 required fixes; otherwise skip)

```bash
git add -A
git commit -m "fix: address issues found in final verification pass"
```

