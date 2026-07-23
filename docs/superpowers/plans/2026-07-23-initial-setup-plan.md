# DLibrary 초기 셋업 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the DLibrary Electron+React+TypeScript app end-to-end — build tooling, UI shell (Gallery/List/Detail/Settings/Explorer pages), state/data wiring, and a minimal SQLite-backed settings round-trip — with no real folder-scanning, DLsite-metadata, or image-cache logic yet.

**Architecture:** electron-vite bundles three targets (`electron/main`, `electron/preload`, `src` renderer). The renderer talks to main only through `window.api` (exposed via `contextBridge` in preload), typed end-to-end with zod schemas in `shared/types`. React Query wraps every `window.api` call; Zustand holds pure client-side UI state (view mode, Explorer tabs). SQLite (better-sqlite3 + Drizzle) currently holds one real table, `app_settings`, used to persist the dark-mode preference — this is the only working vertical slice, and it establishes the exact IPC → Repository → DB pattern the next stage (scanner/metadata) will reuse for real tables.

**Tech Stack:** electron-vite, React 18, TypeScript (strict), Tailwind CSS, shadcn/ui (Radix), lucide-react, react-window + react-virtualized-auto-sizer, Zustand, TanStack Query, TanStack Router, react-hook-form + zod + @hookform/resolvers, Framer Motion, dnd-kit, better-sqlite3 + Drizzle ORM, electron-builder, ESLint + Prettier, Vitest.

## Global Constraints

- TypeScript strict mode everywhere; `npm run typecheck` must pass with zero errors before any task is considered done.
- ESLint + Prettier must pass with zero errors/warnings on all authored code.
- Functional components and React Hooks only — no class components.
- Zustand for client-only UI state; React Query for anything that crosses the `window.api` boundary. Components never call `window.api` directly — only `src/services/*`.
- SQL access goes through a Repository module (`electron/main/database/*Repository.ts`); IPC handlers call repositories, never raw SQL.
- **UI/UX is the top priority for this project** (explicit user instruction): every page task must ship with its hover feedback, loading/empty state, and any relevant animation in the same task — never as a follow-up.
- Out of scope for this plan (do not implement): real folder scanning, DLsite metadata fetching, image caching, the `games`/`libraries` DB tables, and any real behavior behind Explorer's right-click menu items beyond what's specified per-task (unspecified ones are `console.log` stubs, not empty handlers).
- Automated tests target pure logic only (zod schemas, the settings repository against an in-memory DB, Zustand stores, utility functions). UI rendering is verified manually via `npm run dev` — Electron+Radix component trees are not worth the jsdom harness cost at this stage.
- All new files use relative imports (no path aliases) to keep the three build targets (main/preload/renderer) and Vitest config simple and uniform.

---

### Task 1: Project scaffold and dependencies

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.nvmrc`

**Interfaces:**
- Produces: an installable `node_modules` tree and the npm scripts every later task's "verify" step calls (`dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "dlibrary",
  "version": "0.1.0",
  "private": true,
  "description": "DLsite game library manager",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build && electron-builder",
    "typecheck": "tsc --build --force",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write .",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "postinstall": "electron-rebuild -f -w better-sqlite3"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
out/
dist/
*.log
.env
*.db
drizzle/
```

- [ ] **Step 3: Create `.nvmrc`**

```
20
```

- [ ] **Step 4: Install runtime dependencies**

Run:
```bash
npm install react react-dom @tanstack/react-router @tanstack/react-query zustand react-hook-form @hookform/resolvers zod framer-motion lucide-react react-window react-virtualized-auto-sizer @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities better-sqlite3 drizzle-orm class-variance-authority clsx tailwind-merge
```
Expected: exits 0, `dependencies` block in `package.json` populated.

- [ ] **Step 5: Install dev dependencies**

Run:
```bash
npm install -D electron electron-vite electron-builder @electron/rebuild @vitejs/plugin-react vite typescript tailwindcss postcss autoprefixer eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react-hooks eslint-plugin-react-refresh eslint-config-prettier prettier vitest drizzle-kit @types/node @types/better-sqlite3 @types/react @types/react-dom
```
Expected: exits 0.

- [ ] **Step 6: Verify native module rebuild ran**

Run: `npm ls better-sqlite3`
Expected: prints a resolved version with no error. (The `postinstall` script already ran `electron-rebuild` — if this step errors, `better-sqlite3` will crash at runtime with an ABI mismatch when `electron/main` requires it in Task 8.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore .nvmrc
git commit -m "chore: scaffold package.json and install dependencies"
```

---

### Task 2: TypeScript, Vite/Electron config, and a booting blank window

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `electron.vite.config.ts`
- Create: `electron/main/index.ts`
- Create: `electron/preload/index.ts`
- Create: `index.html`
- Create: `src/main.tsx`

**Interfaces:**
- Produces: `npm run dev` opens an Electron window rendering the renderer's `#root`. Later tasks modify `electron/main/index.ts`, `electron/preload/index.ts`, and `src/main.tsx` in place.

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 2: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "composite": true,
    "noEmit": true
  },
  "include": [
    "electron/main/**/*",
    "electron/preload/**/*",
    "shared/**/*",
    "electron.vite.config.ts",
    "drizzle.config.ts",
    "vitest.config.ts"
  ]
}
```

- [ ] **Step 3: Create `tsconfig.web.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "composite": true,
    "noEmit": true
  },
  "include": ["src/**/*", "shared/**/*"]
}
```

- [ ] **Step 4: Create `electron.vite.config.ts`**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
})
```

- [ ] **Step 5: Create `electron/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 6: Create `electron/preload/index.ts`**

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {})
```

- [ ] **Step 7: Create `index.html`**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>DLibrary</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(
  <StrictMode>
    <div>DLibrary</div>
  </StrictMode>
)
```

- [ ] **Step 9: Verify the app boots**

Run: `npm run dev`
Expected: an Electron window opens showing the text "DLibrary". Close the window to exit.

- [ ] **Step 10: Commit**

```bash
git add tsconfig.json tsconfig.node.json tsconfig.web.json electron.vite.config.ts electron/ index.html src/main.tsx
git commit -m "feat: boot a blank Electron+Vite+React window"
```

---

### Task 3: ESLint and Prettier

**Files:**
- Create: `.eslintrc.cjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`

**Interfaces:**
- Produces: `npm run lint` and `npm run format` used as a verification gate by every subsequent task.

- [ ] **Step 1: Create `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'eslint-config-prettier',
  ],
  env: { browser: true, node: true, es2022: true },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
  ignorePatterns: ['out', 'dist', 'node_modules', '*.config.ts', '*.config.js', '*.cjs'],
}
```

- [ ] **Step 2: Create `.prettierrc.json`**

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "es5"
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
out/
dist/
node_modules/
```

- [ ] **Step 4: Verify lint passes on the existing scaffold**

Run: `npm run lint`
Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add .eslintrc.cjs .prettierrc.json .prettierignore
git commit -m "chore: add ESLint and Prettier config"
```

---

### Task 4: Vitest setup

**Files:**
- Create: `vitest.config.ts`
- Create: `shared/sanity.test.ts`

**Interfaces:**
- Produces: `npm run test`, used by every later task that adds a `*.test.ts` file.

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts', 'shared/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: Write a smoke test**

```ts
import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 3: Run it**

Run: `npm run test`
Expected: 1 test file, 1 test, PASS.

- [ ] **Step 4: Delete the smoke test**

The sanity test served its purpose (proving the runner works); remove it so it doesn't linger as dead weight.

Run: `rm shared/sanity.test.ts`

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add Vitest config"
```

---

### Task 4a: Tailwind CSS and shadcn/ui

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `src/globals.css`
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Modify: `src/main.tsx`
- Create/Modify (via shadcn CLI): `src/components/ui/button.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/input.tsx`, `src/components/ui/skeleton.tsx`, `src/components/ui/context-menu.tsx`

**Interfaces:**
- Produces: `src/components/ui/*` shadcn primitives every page task imports from; Tailwind's `dark` class strategy that `useTheme` (Task 11) toggles on `<html>`.

- [ ] **Step 1: Create `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        border: 'hsl(var(--border))',
        accent: 'hsl(var(--accent))',
        'accent-foreground': 'hsl(var(--accent-foreground))',
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        secondary: 'hsl(var(--secondary))',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
      },
      borderRadius: {
        md: 'var(--radius)',
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 2: Create `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 3: Create `src/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 4%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 4%;
  --border: 240 6% 90%;
  --accent: 240 5% 94%;
  --accent-foreground: 240 6% 10%;
  --primary: 240 6% 10%;
  --primary-foreground: 0 0% 98%;
  --secondary: 240 5% 94%;
  --secondary-foreground: 240 6% 10%;
  --muted: 240 5% 94%;
  --muted-foreground: 240 4% 46%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 98%;
  --radius: 0.5rem;
}

.dark {
  --background: 240 10% 4%;
  --foreground: 0 0% 98%;
  --card: 240 8% 8%;
  --card-foreground: 0 0% 98%;
  --border: 240 6% 18%;
  --accent: 240 6% 16%;
  --accent-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 6% 10%;
  --secondary: 240 6% 16%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 6% 16%;
  --muted-foreground: 240 4% 64%;
  --destructive: 0 63% 40%;
  --destructive-foreground: 0 0% 98%;
}

* {
  border-color: hsl(var(--border));
}

body {
  margin: 0;
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

- [ ] **Step 4: Create `src/lib/utils.ts`**

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 5: Create `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "src/components",
    "utils": "src/lib/utils"
  }
}
```

- [ ] **Step 6: Install shadcn/ui components**

Run:
```bash
npx shadcn@latest add button dialog input skeleton context-menu -y
```
Expected: creates `src/components/ui/button.tsx`, `dialog.tsx`, `input.tsx`, `skeleton.tsx`, `context-menu.tsx`, and pulls in their `@radix-ui/*` dependencies into `package.json`.

- [ ] **Step 7: Wire `globals.css` and a real Button into `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from './components/ui/button'
import './globals.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(
  <StrictMode>
    <div className="flex h-screen items-center justify-center gap-2 bg-background text-foreground">
      DLibrary
      <Button>Test</Button>
    </div>
  </StrictMode>
)
```

- [ ] **Step 8: Verify visually**

Run: `npm run dev`
Expected: window shows "DLibrary" and a styled shadcn Button next to it, light background. Add `className="dark"` to the outer `<div>` temporarily, reload, confirm the background flips to dark — then remove it again (Task 11 wires the real toggle).

- [ ] **Step 9: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 10: Commit**

```bash
git add tailwind.config.ts postcss.config.js src/globals.css components.json src/lib/utils.ts src/components/ui src/main.tsx package.json package-lock.json
git commit -m "feat: add Tailwind CSS and shadcn/ui components"
```

---

### Task 5: Shared IPC contract (zod schemas)

**Files:**
- Create: `shared/types/ipc.ts`
- Test: `shared/types/ipc.test.ts`

**Interfaces:**
- Produces: `IPC_CHANNELS`, `ThemeSchema`/`Theme`, `GetSettingRequestSchema`, `SetSettingRequestSchema` — consumed by Task 7 (main IPC handlers), Task 8 (preload), and Task 11 (renderer service).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { GetSettingRequestSchema, SetSettingRequestSchema, ThemeSchema } from './ipc'

describe('ThemeSchema', () => {
  it('accepts light and dark', () => {
    expect(ThemeSchema.parse('light')).toBe('light')
    expect(ThemeSchema.parse('dark')).toBe('dark')
  })

  it('rejects anything else', () => {
    expect(() => ThemeSchema.parse('blue')).toThrow()
  })
})

describe('GetSettingRequestSchema', () => {
  it('accepts key "theme"', () => {
    expect(GetSettingRequestSchema.parse({ key: 'theme' })).toEqual({ key: 'theme' })
  })

  it('rejects an unknown key', () => {
    expect(() => GetSettingRequestSchema.parse({ key: 'nope' })).toThrow()
  })
})

describe('SetSettingRequestSchema', () => {
  it('accepts a key/value pair', () => {
    expect(SetSettingRequestSchema.parse({ key: 'theme', value: 'dark' })).toEqual({
      key: 'theme',
      value: 'dark',
    })
  })

  it('rejects a missing value', () => {
    expect(() => SetSettingRequestSchema.parse({ key: 'theme' })).toThrow()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- shared/types/ipc.test.ts`
Expected: FAIL — `shared/types/ipc.ts` does not exist yet.

- [ ] **Step 3: Implement `shared/types/ipc.ts`**

```ts
import { z } from 'zod'

export const IPC_CHANNELS = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
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
  value: z.string(),
})
export type SetSettingRequest = z.infer<typeof SetSettingRequestSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- shared/types/ipc.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/types/ipc.ts shared/types/ipc.test.ts
git commit -m "feat: add shared IPC zod schemas for settings"
```

---

### Task 6: Drizzle schema, DB client, and settings repository

**Files:**
- Create: `electron/main/database/schema.ts`
- Create: `electron/main/database/client.ts`
- Create: `electron/main/database/settingsRepository.ts`
- Test: `electron/main/database/settingsRepository.test.ts`
- Create: `drizzle.config.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `createDbClient(filePath: string): AppDatabase`, `getSetting(db, key): string | undefined`, `setSetting(db, key, value): void` — consumed by Task 7 (IPC handlers).

- [ ] **Step 1: Create `electron/main/database/schema.ts`**

```ts
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
```

- [ ] **Step 2: Create `electron/main/database/client.ts`**

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

  return drizzle(sqlite, { schema })
}

export type AppDatabase = ReturnType<typeof createDbClient>
```

- [ ] **Step 3: Write the failing test for the repository**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createDbClient, type AppDatabase } from './client'
import { getSetting, setSetting } from './settingsRepository'

describe('settingsRepository', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createDbClient(':memory:')
  })

  it('returns undefined for a key that was never set', () => {
    expect(getSetting(db, 'theme')).toBeUndefined()
  })

  it('stores and retrieves a value', () => {
    setSetting(db, 'theme', 'dark')
    expect(getSetting(db, 'theme')).toBe('dark')
  })

  it('overwrites an existing value on conflict', () => {
    setSetting(db, 'theme', 'dark')
    setSetting(db, 'theme', 'light')
    expect(getSetting(db, 'theme')).toBe('light')
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm run test -- electron/main/database/settingsRepository.test.ts`
Expected: FAIL — `settingsRepository.ts` does not exist.

- [ ] **Step 5: Implement `electron/main/database/settingsRepository.ts`**

```ts
import { eq } from 'drizzle-orm'
import type { AppDatabase } from './client'
import { appSettings } from './schema'

export function getSetting(db: AppDatabase, key: string): string | undefined {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
  return row?.value
}

export function setSetting(db: AppDatabase, key: string, value: string): void {
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run()
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- electron/main/database/settingsRepository.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Create `drizzle.config.ts`** (used by the `db:generate`/`db:migrate` scripts once real tables are added next stage)

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './electron/main/database/schema.ts',
  out: './drizzle',
})
```

- [ ] **Step 8: Commit**

```bash
git add electron/main/database drizzle.config.ts
git commit -m "feat: add Drizzle schema, DB client, and settings repository"
```

---

### Task 7: IPC settings handlers, preload bridge, and main-process wiring

**Files:**
- Create: `electron/main/ipc/settingsHandlers.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`
- Create: `src/env.d.ts`

**Interfaces:**
- Consumes: `IPC_CHANNELS`, `GetSettingRequestSchema`, `SetSettingRequestSchema`, `Theme` (Task 5); `createDbClient`, `getSetting`, `setSetting` (Task 6).
- Produces: `window.api.settings.getTheme(): Promise<Theme | null>` and `window.api.settings.setTheme(value: Theme): Promise<void>`, consumed by Task 11's `settingsService.ts`.

- [ ] **Step 1: Create `electron/main/ipc/settingsHandlers.ts`**

```ts
import { ipcMain } from 'electron'
import { GetSettingRequestSchema, IPC_CHANNELS, SetSettingRequestSchema } from '../../../shared/types/ipc'
import { getSetting, setSetting } from '../database/settingsRepository'
import type { AppDatabase } from '../database/client'

export function registerSettingsHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, payload: unknown) => {
    const { key } = GetSettingRequestSchema.parse(payload)
    return getSetting(db, key) ?? null
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, payload: unknown) => {
    const { key, value } = SetSettingRequestSchema.parse(payload)
    setSetting(db, key, value)
  })
}
```

- [ ] **Step 2: Modify `electron/main/index.ts`** to create the DB client and register handlers before creating the window

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createDbClient } from './database/client'
import { registerSettingsHandlers } from './ipc/settingsHandlers'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
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

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 3: Modify `electron/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type Theme } from '../../shared/types/ipc'

const api = {
  settings: {
    getTheme: (): Promise<Theme | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, { key: 'theme' }),
    setTheme: (value: Theme): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key: 'theme', value }),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
```

- [ ] **Step 4: Create `src/env.d.ts`** so the renderer knows about `window.api`

```ts
import type { Api } from '../electron/preload/index'

declare global {
  interface Window {
    api: Api
  }
}

export {}
```

- [ ] **Step 5: Verify the app still boots and typechecks**

Run: `npm run dev`
Expected: window opens as before (nothing renders differently yet — this task only wires plumbing).

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add electron/main/ipc electron/main/index.ts electron/preload/index.ts src/env.d.ts
git commit -m "feat: wire settings IPC handlers and typed preload bridge"
```

---

### Task 8: TanStack Router + React Query bootstrap

**Files:**
- Create: `src/router.tsx`
- Create: `src/pages/Gallery/GalleryPage.tsx` (stub)
- Create: `src/pages/List/ListPage.tsx` (stub)
- Create: `src/pages/Detail/DetailPage.tsx` (stub)
- Create: `src/pages/Settings/SettingsPage.tsx` (stub)
- Create: `src/pages/Explorer/ExplorerPage.tsx` (stub)
- Create: `src/components/layout/AppLayout.tsx` (stub, no sidebar yet)
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: `router` (default export of `src/router.tsx`), route paths `/`, `/list`, `/explorer`, `/detail`, `/settings`. Later tasks replace each page stub's body and replace `AppLayout`'s body (Task 10).

- [ ] **Step 1: Create stub pages** — each of the five files below:

`src/pages/Gallery/GalleryPage.tsx`:
```tsx
export function GalleryPage() {
  return <div className="p-6">Gallery</div>
}
```

`src/pages/List/ListPage.tsx`:
```tsx
export function ListPage() {
  return <div className="p-6">List</div>
}
```

`src/pages/Detail/DetailPage.tsx`:
```tsx
export function DetailPage() {
  return <div className="p-6">Detail</div>
}
```

`src/pages/Settings/SettingsPage.tsx`:
```tsx
export function SettingsPage() {
  return <div className="p-6">Settings</div>
}
```

`src/pages/Explorer/ExplorerPage.tsx`:
```tsx
export function ExplorerPage() {
  return <div className="p-6">Explorer</div>
}
```

- [ ] **Step 2: Create `src/components/layout/AppLayout.tsx`**

```tsx
import type { ReactNode } from 'react'

export function AppLayout({ children }: { children: ReactNode }) {
  return <div className="flex h-screen bg-background text-foreground">{children}</div>
}
```

- [ ] **Step 3: Create `src/router.tsx`**

```tsx
import { Outlet, createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AppLayout } from './components/layout/AppLayout'
import { GalleryPage } from './pages/Gallery/GalleryPage'
import { ListPage } from './pages/List/ListPage'
import { ExplorerPage } from './pages/Explorer/ExplorerPage'
import { DetailPage } from './pages/Detail/DetailPage'
import { SettingsPage } from './pages/Settings/SettingsPage'

const rootRoute = createRootRoute({
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
})

const galleryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: GalleryPage })
const listRoute = createRoute({ getParentRoute: () => rootRoute, path: '/list', component: ListPage })
const explorerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/explorer', component: ExplorerPage })
const detailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/detail', component: DetailPage })
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage })

const routeTree = rootRoute.addChildren([galleryRoute, listRoute, explorerRoute, detailRoute, settingsRoute])

export const router = createRouter({ routeTree, history: createHashHistory() })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

- [ ] **Step 4: Modify `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import './globals.css'

const queryClient = new QueryClient()

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
)
```

- [ ] **Step 5: Verify navigation**

Run: `npm run dev`
Expected: window opens showing "Gallery" (root route `/`). Manually change the hash in devtools (`location.hash = '#/settings'`) and confirm the page swaps to "Settings".

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/router.tsx src/pages src/components/layout/AppLayout.tsx src/main.tsx
git commit -m "feat: add TanStack Router routes and React Query provider"
```

---

### Task 9: Zustand `uiStore`

**Files:**
- Create: `src/stores/uiStore.ts`
- Test: `src/stores/uiStore.test.ts`

**Interfaces:**
- Produces: `useUiStore` with `viewMode: 'gallery' | 'list'` and `setViewMode(mode)` — consumed by the Sidebar (Task 10) for the active-link state pattern other stores in this plan follow.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from './uiStore'

describe('useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState({ viewMode: 'gallery' })
  })

  it('defaults to gallery view mode', () => {
    expect(useUiStore.getState().viewMode).toBe('gallery')
  })

  it('switches view mode', () => {
    useUiStore.getState().setViewMode('list')
    expect(useUiStore.getState().viewMode).toBe('list')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- src/stores/uiStore.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/stores/uiStore.ts`**

```ts
import { create } from 'zustand'

export type ViewMode = 'gallery' | 'list'

interface UiState {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
}

export const useUiStore = create<UiState>((set) => ({
  viewMode: 'gallery',
  setViewMode: (mode) => set({ viewMode: mode }),
}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/stores/uiStore.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/stores/uiStore.ts src/stores/uiStore.test.ts
git commit -m "feat: add Zustand uiStore for view mode"
```

---

### Task 10: `useTheme` hook, Sidebar, and Framer Motion page transitions

**Files:**
- Create: `src/services/settingsService.ts`
- Create: `src/hooks/useTheme.ts`
- Create: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: `window.api.settings.getTheme/setTheme` (Task 7); `Theme` type (Task 5).
- Produces: `useTheme(): { theme: Theme; toggleTheme: () => void }`, consumed by `Sidebar`.

- [ ] **Step 1: Create `src/services/settingsService.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Theme } from '../../shared/types/ipc'

const THEME_QUERY_KEY = ['settings', 'theme'] as const

export function useThemeQuery() {
  return useQuery({
    queryKey: THEME_QUERY_KEY,
    queryFn: async (): Promise<Theme> => {
      const value = await window.api.settings.getTheme()
      return value ?? 'dark'
    },
  })
}

export function useSetThemeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (theme: Theme) => window.api.settings.setTheme(theme),
    onSuccess: (_data, theme) => {
      queryClient.setQueryData(THEME_QUERY_KEY, theme)
    },
  })
}
```

- [ ] **Step 2: Create `src/hooks/useTheme.ts`**

```ts
import { useEffect } from 'react'
import { useSetThemeMutation, useThemeQuery } from '../services/settingsService'
import type { Theme } from '../../shared/types/ipc'

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const { data: theme = 'dark' } = useThemeQuery()
  const setThemeMutation = useSetThemeMutation()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggleTheme = (): void => {
    setThemeMutation.mutate(theme === 'dark' ? 'light' : 'dark')
  }

  return { theme, toggleTheme }
}
```

- [ ] **Step 3: Create `src/components/layout/Sidebar.tsx`**

```tsx
import { Link } from '@tanstack/react-router'
import { FolderTree, LayoutGrid, LibraryBig, List, Settings } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { Button } from '../ui/button'

const navItems = [
  { to: '/', label: 'Gallery', icon: LayoutGrid },
  { to: '/list', label: 'List', icon: List },
  { to: '/explorer', label: 'Explorer', icon: FolderTree },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export function Sidebar() {
  const { theme, toggleTheme } = useTheme()

  return (
    <aside className="flex w-56 flex-col border-r border-border bg-card p-4">
      <div className="mb-6 flex items-center gap-2 font-semibold">
        <LibraryBig className="h-5 w-5" />
        DLibrary
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === '/' }}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent [&.active]:bg-accent [&.active]:font-medium"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <Button variant="ghost" size="sm" onClick={toggleTheme}>
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </Button>
    </aside>
  )
}
```

- [ ] **Step 4: Modify `src/components/layout/AppLayout.tsx`** to add the sidebar and a fade/slide route transition

```tsx
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouterState } from '@tanstack/react-router'
import { Sidebar } from './Sidebar'

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev`
Expected: sidebar with 4 nav links visible; clicking each fades/slides the page content in; clicking "Light mode"/"Dark mode" flips the whole window's colors immediately.

- [ ] **Step 6: Verify persistence across restart**

With the window still open, toggle to light mode, fully quit the app (not just close-and-reopen the window — quit the process), then run `npm run dev` again.
Expected: the app reopens in light mode (theme was persisted to SQLite via Task 6/7's `app_settings` table).

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/services/settingsService.ts src/hooks/useTheme.ts src/components/layout
git commit -m "feat: add theme persistence, sidebar nav, and route transitions"
```

---

### Task 11: Mock game data, `useGames`, and the Gallery page

**Files:**
- Create: `src/services/mockGames.ts`
- Create: `src/services/useGames.ts`
- Modify: `src/pages/Gallery/GalleryPage.tsx`

**Interfaces:**
- Produces: `MockGame` type, `generateMockGames(count)`, `useGames()` — all consumed again by Task 12 (List page).

- [ ] **Step 1: Create `src/services/mockGames.ts`**

```ts
export interface MockGame {
  id: string
  rjCode: string
  title: string
  circle: string
  releaseDate: string
}

export function generateMockGames(count: number): MockGame[] {
  return Array.from({ length: count }, (_, i) => {
    const rjCode = `RJ${100000 + i}`
    return {
      id: rjCode,
      rjCode,
      title: `샘플 타이틀 ${i + 1}`,
      circle: `서클 ${(i % 12) + 1}`,
      releaseDate: '2026-01-01',
    }
  })
}
```

- [ ] **Step 2: Create `src/services/useGames.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { generateMockGames, type MockGame } from './mockGames'

export function useGames() {
  return useQuery<MockGame[]>({
    queryKey: ['games', 'mock'],
    queryFn: () => new Promise((resolve) => setTimeout(() => resolve(generateMockGames(120)), 400)),
  })
}
```

- [ ] **Step 3: Modify `src/pages/Gallery/GalleryPage.tsx`**

```tsx
import { FixedSizeGrid } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import { motion } from 'framer-motion'
import { useGames } from '../../services/useGames'
import { Skeleton } from '../../components/ui/skeleton'
import type { MockGame } from '../../services/mockGames'

const CARD_WIDTH = 180
const CARD_HEIGHT = 260
const GAP = 16

function GameCard({ game }: { game: MockGame }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.15 }}
      className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <div className="aspect-[3/4] w-full bg-muted" />
      <div className="p-2">
        <p className="truncate text-sm font-medium">{game.title}</p>
        <p className="truncate text-xs text-muted-foreground">{game.circle}</p>
      </div>
    </motion.div>
  )
}

export function GalleryPage() {
  const { data: games, isLoading } = useGames()

  if (isLoading || !games) {
    return (
      <div className="grid grid-cols-5 gap-4 p-6">
        {Array.from({ length: 15 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
        ))}
      </div>
    )
  }

  return (
    <div className="h-full w-full p-6">
      <AutoSizer>
        {({ height, width }) => {
          const columnCount = Math.max(1, Math.floor(width / (CARD_WIDTH + GAP)))
          const rowCount = Math.ceil(games.length / columnCount)

          return (
            <FixedSizeGrid
              columnCount={columnCount}
              columnWidth={CARD_WIDTH + GAP}
              rowCount={rowCount}
              rowHeight={CARD_HEIGHT + GAP}
              height={height}
              width={width}
            >
              {({ columnIndex, rowIndex, style }) => {
                const index = rowIndex * columnCount + columnIndex
                const game = games[index]
                if (!game) return null
                return (
                  <div style={{ ...style, padding: GAP / 2 }}>
                    <GameCard game={game} />
                  </div>
                )
              }}
            </FixedSizeGrid>
          )
        }}
      </AutoSizer>
    </div>
  )
}
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`
Expected: Gallery route briefly shows 15 skeleton tiles, then ~120 mock cards render in a virtualized grid; hovering a card scales it up smoothly; resizing the window reflows the column count.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/services/mockGames.ts src/services/useGames.ts src/pages/Gallery
git commit -m "feat: add Gallery page with virtualized grid and mock data"
```

---

### Task 12: List page

**Files:**
- Modify: `src/pages/List/ListPage.tsx`

**Interfaces:**
- Consumes: `useGames()`, `MockGame` (Task 11).

- [ ] **Step 1: Modify `src/pages/List/ListPage.tsx`**

```tsx
import { FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import { useGames } from '../../services/useGames'
import { Skeleton } from '../../components/ui/skeleton'
import type { MockGame } from '../../services/mockGames'

const ROW_HEIGHT = 64

function GameRow({ game }: { game: MockGame }) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-2 transition-colors hover:bg-accent">
      <div className="h-12 w-12 shrink-0 rounded bg-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{game.title}</p>
        <p className="truncate text-xs text-muted-foreground">{game.circle}</p>
      </div>
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{game.releaseDate}</span>
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{game.rjCode}</span>
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

  return (
    <div className="h-full w-full">
      <AutoSizer>
        {({ height, width }) => (
          <FixedSizeList height={height} width={width} itemCount={games.length} itemSize={ROW_HEIGHT}>
            {({ index, style }) => (
              <div style={style}>
                <GameRow game={games[index]} />
              </div>
            )}
          </FixedSizeList>
        )}
      </AutoSizer>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, navigate to List.
Expected: skeleton rows briefly, then ~120 mock rows in a virtualized list with hover highlight.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/pages/List/ListPage.tsx
git commit -m "feat: add List page with virtualized rows"
```

---

### Task 13: Detail page empty state

**Files:**
- Modify: `src/pages/Detail/DetailPage.tsx`

- [ ] **Step 1: Modify `src/pages/Detail/DetailPage.tsx`**

```tsx
import { LibraryBig } from 'lucide-react'

export function DetailPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <LibraryBig className="h-10 w-10" />
      <p>게임을 선택하면 상세 정보가 여기에 표시됩니다.</p>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, navigate to `#/detail`.
Expected: centered icon + empty-state message.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Detail/DetailPage.tsx
git commit -m "feat: add Detail page empty state"
```

---

### Task 14: Settings page with "Add Library" form (react-hook-form + zod)

**Files:**
- Modify: `src/pages/Settings/SettingsPage.tsx`

**Interfaces:**
- Produces: a local, non-persisted `useMockLibraryStore` demonstrating the validated-form pattern the real "add library" flow will reuse once the scanner exists.

- [ ] **Step 1: Modify `src/pages/Settings/SettingsPage.tsx`**

```tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { create } from 'zustand'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog'
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
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, navigate to Settings. Click "라이브러리 추가", submit empty form — expect both validation messages. Fill in name+path, submit — expect the dialog to close and a new list item to appear.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Settings/SettingsPage.tsx
git commit -m "feat: add Settings page with validated Add Library dialog"
```

---

### Task 15: Explorer tab store

**Files:**
- Create: `src/stores/explorerStore.ts`
- Test: `src/stores/explorerStore.test.ts`

**Interfaces:**
- Produces: `ExplorerTab { id, label, path }`, `useExplorerStore` with `tabs`, `activeTabId`, `addTab`, `closeTab`, `closeOtherTabs`, `duplicateTab`, `reorderTabs`, `setActiveTab`, `navigateTab` — consumed by Task 17 (TabBar) and Task 19 (ExplorerPage/FolderView).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useExplorerStore } from './explorerStore'

describe('useExplorerStore', () => {
  beforeEach(() => {
    useExplorerStore.setState({
      tabs: [
        { id: 'a', label: 'A', path: '/a' },
        { id: 'b', label: 'B', path: '/b' },
        { id: 'c', label: 'C', path: '/c' },
      ],
      activeTabId: 'a',
    })
  })

  it('reorders tabs by moving one before another', () => {
    useExplorerStore.getState().reorderTabs('c', 'a')
    expect(useExplorerStore.getState().tabs.map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })

  it('closes a tab and activates the first remaining tab if it was active', () => {
    useExplorerStore.getState().closeTab('a')
    const state = useExplorerStore.getState()
    expect(state.tabs.map((t) => t.id)).toEqual(['b', 'c'])
    expect(state.activeTabId).toBe('b')
  })

  it('keeps the active tab unchanged when closing a non-active tab', () => {
    useExplorerStore.getState().closeTab('b')
    expect(useExplorerStore.getState().activeTabId).toBe('a')
  })

  it('duplicates a tab right after the original', () => {
    useExplorerStore.getState().duplicateTab('a')
    const tabs = useExplorerStore.getState().tabs
    expect(tabs[0].id).toBe('a')
    expect(tabs[1].path).toBe('/a')
    expect(tabs[1].id).not.toBe('a')
  })

  it('closeOtherTabs leaves only the target tab', () => {
    useExplorerStore.getState().closeOtherTabs('b')
    expect(useExplorerStore.getState().tabs.map((t) => t.id)).toEqual(['b'])
  })

  it('navigateTab updates only the target tab path', () => {
    useExplorerStore.getState().navigateTab('a', '/a/sub')
    const tabs = useExplorerStore.getState().tabs
    expect(tabs.find((t) => t.id === 'a')?.path).toBe('/a/sub')
    expect(tabs.find((t) => t.id === 'b')?.path).toBe('/b')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- src/stores/explorerStore.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/stores/explorerStore.ts`**

```ts
import { create } from 'zustand'

export interface ExplorerTab {
  id: string
  label: string
  path: string
}

interface ExplorerState {
  tabs: ExplorerTab[]
  activeTabId: string
  addTab: (tab: Omit<ExplorerTab, 'id'>) => void
  closeTab: (id: string) => void
  closeOtherTabs: (id: string) => void
  duplicateTab: (id: string) => void
  reorderTabs: (fromId: string, toId: string) => void
  setActiveTab: (id: string) => void
  navigateTab: (id: string, path: string) => void
}

function createTabId(): string {
  return crypto.randomUUID()
}

const initialTabs: ExplorerTab[] = [
  { id: 'tab-voice', label: 'Voice', path: 'E:\\DLsite\\Voice' },
  { id: 'tab-rpg', label: 'RPG', path: 'F:\\RPG' },
  { id: 'tab-games', label: 'DLsite Games', path: 'D:\\Games\\DLsite' },
]

export const useExplorerStore = create<ExplorerState>((set) => ({
  tabs: initialTabs,
  activeTabId: initialTabs[0].id,

  addTab: (tab) =>
    set((state) => {
      const id = createTabId()
      return { tabs: [...state.tabs, { ...tab, id }], activeTabId: id }
    }),

  closeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      const activeTabId = state.activeTabId === id ? (tabs[0]?.id ?? '') : state.activeTabId
      return { tabs, activeTabId }
    }),

  closeOtherTabs: (id) => set((state) => ({ tabs: state.tabs.filter((tab) => tab.id === id), activeTabId: id })),

  duplicateTab: (id) =>
    set((state) => {
      const source = state.tabs.find((tab) => tab.id === id)
      if (!source) return state
      const newTab = { ...source, id: createTabId() }
      const index = state.tabs.findIndex((tab) => tab.id === id)
      const tabs = [...state.tabs]
      tabs.splice(index + 1, 0, newTab)
      return { tabs, activeTabId: newTab.id }
    }),

  reorderTabs: (fromId, toId) =>
    set((state) => {
      const fromIndex = state.tabs.findIndex((tab) => tab.id === fromId)
      const toIndex = state.tabs.findIndex((tab) => tab.id === toId)
      if (fromIndex === -1 || toIndex === -1) return state
      const tabs = [...state.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { tabs }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  navigateTab: (id, path) =>
    set((state) => ({ tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, path } : tab)) })),
}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/stores/explorerStore.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/stores/explorerStore.ts src/stores/explorerStore.test.ts
git commit -m "feat: add Explorer tab store"
```

---

### Task 16: Breadcrumb path utility

**Files:**
- Create: `src/pages/Explorer/breadcrumb.ts`
- Test: `src/pages/Explorer/breadcrumb.test.ts`

**Interfaces:**
- Produces: `BreadcrumbSegment { label, path }`, `pathToBreadcrumbSegments(path: string): BreadcrumbSegment[]` — consumed by Task 19 (FolderView).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { pathToBreadcrumbSegments } from './breadcrumb'

describe('pathToBreadcrumbSegments', () => {
  it('splits a Windows-style path into segments', () => {
    expect(pathToBreadcrumbSegments('D:\\Games\\DLsite\\Voice')).toEqual([
      { label: 'D:', path: 'D:' },
      { label: 'Games', path: 'D:/Games' },
      { label: 'DLsite', path: 'D:/Games/DLsite' },
      { label: 'Voice', path: 'D:/Games/DLsite/Voice' },
    ])
  })

  it('ignores a trailing slash', () => {
    expect(pathToBreadcrumbSegments('D:\\Games\\')).toEqual([
      { label: 'D:', path: 'D:' },
      { label: 'Games', path: 'D:/Games' },
    ])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- src/pages/Explorer/breadcrumb.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/pages/Explorer/breadcrumb.ts`**

```ts
export interface BreadcrumbSegment {
  label: string
  path: string
}

export function pathToBreadcrumbSegments(path: string): BreadcrumbSegment[] {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)

  return parts.map((label, index) => ({
    label,
    path: parts.slice(0, index + 1).join('/'),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/pages/Explorer/breadcrumb.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Explorer/breadcrumb.ts src/pages/Explorer/breadcrumb.test.ts
git commit -m "feat: add breadcrumb path utility for Explorer"
```

---

### Task 17: Explorer TabBar (draggable, dnd-kit)

**Files:**
- Create: `src/pages/Explorer/TabBar.tsx`

**Interfaces:**
- Consumes: `useExplorerStore`, `ExplorerTab` (Task 15); shadcn `ContextMenu*` (Task 4a).

- [ ] **Step 1: Create `src/pages/Explorer/TabBar.tsx`**

```tsx
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '../../components/ui/context-menu'
import { useExplorerStore, type ExplorerTab } from '../../stores/explorerStore'

function SortableTab({ tab }: { tab: ExplorerTab }) {
  const activeTabId = useExplorerStore((s) => s.activeTabId)
  const setActiveTab = useExplorerStore((s) => s.setActiveTab)
  const closeTab = useExplorerStore((s) => s.closeTab)
  const closeOtherTabs = useExplorerStore((s) => s.closeOtherTabs)
  const duplicateTab = useExplorerStore((s) => s.duplicateTab)

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tab.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={() => setActiveTab(tab.id)}
          className={`flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors ${
            tab.id === activeTabId ? 'border-primary bg-card font-medium' : 'border-transparent hover:bg-accent'
          }`}
        >
          {tab.label}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => closeTab(tab.id)}>탭 닫기</ContextMenuItem>
        <ContextMenuItem onSelect={() => closeOtherTabs(tab.id)}>다른 탭 모두 닫기</ContextMenuItem>
        <ContextMenuItem onSelect={() => duplicateTab(tab.id)}>탭 복제</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('refresh folder', tab.path)}>이 폴더 새로고침</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('reveal in OS explorer', tab.path)}>
          탐색기(OS)에서 폴더 열기
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function TabBar() {
  const tabs = useExplorerStore((s) => s.tabs)
  const reorderTabs = useExplorerStore((s) => s.reorderTabs)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderTabs(String(active.id), String(over.id))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <SortableTab key={tab.id} tab={tab} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. (Manual drag verification happens in Task 19 once `ExplorerPage` renders `TabBar`.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/Explorer/TabBar.tsx
git commit -m "feat: add draggable Explorer TabBar"
```

---

### Task 18: Mock folder entries, FolderView, and DetailOverlay

**Files:**
- Create: `src/pages/Explorer/mockFolderEntries.ts`
- Create: `src/pages/Explorer/DetailOverlay.tsx`
- Create: `src/pages/Explorer/FolderView.tsx`

**Interfaces:**
- Consumes: `pathToBreadcrumbSegments` (Task 16), `useExplorerStore` (Task 15), shadcn `Dialog*`/`ContextMenu*` (Task 4a).
- Produces: `FolderView({ tabId, path, onNavigate })`, consumed by Task 19 (`ExplorerPage`).

- [ ] **Step 1: Create `src/pages/Explorer/mockFolderEntries.ts`**

```ts
export interface MockFolderEntry {
  id: string
  name: string
  kind: 'folder' | 'file' | 'game'
  rjCode?: string
  title?: string
}

export function generateMockFolderEntries(path: string): MockFolderEntry[] {
  return [
    { id: `${path}/하위폴더1`, name: '하위폴더1', kind: 'folder' },
    { id: `${path}/RJ01111.zip`, name: 'RJ01111.zip', kind: 'game', rjCode: 'RJ01111', title: '샘플 게임 1' },
    { id: `${path}/RJ02222`, name: 'RJ02222', kind: 'game', rjCode: 'RJ02222', title: '샘플 게임 2 (압축해제됨)' },
    { id: `${path}/memo.txt`, name: 'memo.txt', kind: 'file' },
  ]
}
```

- [ ] **Step 2: Create `src/pages/Explorer/DetailOverlay.tsx`**

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import type { MockFolderEntry } from './mockFolderEntries'

interface DetailOverlayProps {
  game: MockFolderEntry | null
  onClose: () => void
}

export function DetailOverlay({ game, onClose }: DetailOverlayProps) {
  return (
    <Dialog open={game !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {game && (
          <>
            <DialogHeader>
              <DialogTitle>{game.title}</DialogTitle>
            </DialogHeader>
            <div className="flex gap-4">
              <div className="h-40 w-32 shrink-0 rounded bg-muted" />
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <p>제작사: 샘플 서클</p>
                <p>발매일: 2026-01-01</p>
                <p>작품번호: {game.rjCode}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => console.log('open dlsite page', game.rjCode)}>DLsite 열기</Button>
              <Button variant="secondary" onClick={() => console.log('open folder', game.id)}>
                폴더 열기
              </Button>
              <Button variant="secondary" onClick={() => console.log('launch', game.id)}>
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

- [ ] **Step 3: Create `src/pages/Explorer/FolderView.tsx`**

```tsx
import { useState } from 'react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '../../components/ui/context-menu'
import { pathToBreadcrumbSegments } from './breadcrumb'
import { generateMockFolderEntries, type MockFolderEntry } from './mockFolderEntries'
import { useExplorerStore } from '../../stores/explorerStore'
import { DetailOverlay } from './DetailOverlay'

interface FolderViewProps {
  tabId: string
  path: string
  onNavigate: (path: string) => void
}

function FolderEntryContextMenu({
  entry,
  onOpenInNewTab,
}: {
  entry: MockFolderEntry
  onOpenInNewTab: (entry: MockFolderEntry) => void
}) {
  if (entry.kind === 'folder') {
    return (
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onOpenInNewTab(entry)}>새 탭으로 열기</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('reveal in OS explorer', entry.id)}>
          탐색기(OS)에서 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('pin favorite', entry.id)}>즐겨찾기로 고정</ContextMenuItem>
      </ContextMenuContent>
    )
  }

  if (entry.kind === 'game') {
    return (
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => console.log('launch', entry.id)}>실행</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('open dlsite page', entry.rjCode)}>
          DLsite 페이지 열기
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('open folder', entry.id)}>폴더 열기</ContextMenuItem>
        <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.rjCode ?? '')}>
          RJ번호 복사
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.title ?? '')}>
          제목 복사
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('edit custom title', entry.id)}>
          사용자 지정 제목 편집
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('refresh metadata', entry.rjCode)}>
          메타데이터 새로고침
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('redownload cover', entry.rjCode)}>
          커버 이미지 재다운로드
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('extract archive', entry.id)}>압축 해제</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('toggle favorite', entry.id)}>즐겨찾기 설정</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('edit memo', entry.id)}>메모 설정</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('set rating', entry.id)}>평점 설정</ContextMenuItem>
      </ContextMenuContent>
    )
  }

  return null
}

export function FolderView({ tabId, path, onNavigate }: FolderViewProps) {
  const [selectedGame, setSelectedGame] = useState<MockFolderEntry | null>(null)
  const addTab = useExplorerStore((s) => s.addTab)
  const entries = generateMockFolderEntries(path)
  const breadcrumbs = pathToBreadcrumbSegments(path)

  const openInNewTab = (entry: MockFolderEntry): void => {
    addTab({ label: entry.name, path: entry.id })
  }

  const handleEntryClick = (entry: MockFolderEntry): void => {
    if (entry.kind === 'folder') {
      onNavigate(entry.id)
    } else if (entry.kind === 'game') {
      setSelectedGame(entry)
    }
  }

  return (
    <div className="flex h-full flex-col" data-tab-id={tabId}>
      <div className="flex items-center gap-1 border-b border-border px-4 py-2 text-sm text-muted-foreground">
        {breadcrumbs.map((segment, index) => (
          <span key={segment.path} className="flex items-center gap-1">
            {index > 0 && <span>/</span>}
            <button className="hover:text-foreground hover:underline" onClick={() => onNavigate(segment.path)}>
              {segment.label}
            </button>
          </span>
        ))}
      </div>
      <ul className="flex-1 divide-y divide-border overflow-auto">
        {entries.map((entry) => (
          <ContextMenu key={entry.id}>
            <ContextMenuTrigger asChild>
              <li
                className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-accent"
                onClick={() => handleEntryClick(entry)}
              >
                {entry.kind === 'game' && <div className="h-8 w-8 shrink-0 rounded bg-muted" />}
                <span className="truncate">{entry.kind === 'game' ? entry.title : entry.name}</span>
              </li>
            </ContextMenuTrigger>
            <FolderEntryContextMenu entry={entry} onOpenInNewTab={openInNewTab} />
          </ContextMenu>
        ))}
      </ul>
      <DetailOverlay game={selectedGame} onClose={() => setSelectedGame(null)} />
    </div>
  )
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Explorer/mockFolderEntries.ts src/pages/Explorer/DetailOverlay.tsx src/pages/Explorer/FolderView.tsx
git commit -m "feat: add Explorer FolderView and DetailOverlay"
```

---

### Task 19: Wire up ExplorerPage

**Files:**
- Modify: `src/pages/Explorer/ExplorerPage.tsx`

**Interfaces:**
- Consumes: `TabBar` (Task 17), `FolderView` (Task 18), `useExplorerStore` (Task 15).

- [ ] **Step 1: Modify `src/pages/Explorer/ExplorerPage.tsx`**

```tsx
import { TabBar } from './TabBar'
import { FolderView } from './FolderView'
import { useExplorerStore } from '../../stores/explorerStore'

export function ExplorerPage() {
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

- [ ] **Step 2: Verify manually — the full Explorer flow**

Run: `npm run dev`, navigate to Explorer.

1. Confirm 3 tabs render: Voice, RPG, DLsite Games.
2. Drag the "DLsite Games" tab to the front — confirm the tab order changes and stays changed.
3. In the folder list, left-click "하위폴더1" — confirm the breadcrumb grows by one segment and the (mock) contents refresh.
4. Click a breadcrumb segment to go back up — confirm it navigates correctly.
5. Right-click "하위폴더1" → "새 탭으로 열기" — confirm a new tab appears and becomes active.
6. Right-click the active tab → "탭 닫기" — confirm it closes and another tab becomes active.
7. Click "RJ01111.zip" (a game entry) — confirm the DetailOverlay dialog opens with mock title/circle/date/RJ code and three buttons; open devtools console and click each button, confirming the expected `console.log` fires.
8. Right-click a game entry — confirm all 12 menu items listed in the spec appear; click "RJ번호 복사" and confirm it doesn't throw (clipboard write).

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Explorer/ExplorerPage.tsx
git commit -m "feat: wire up Explorer page (tabs + folder view + detail overlay)"
```

---

### Task 20: electron-builder packaging config

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add a `build` field to `package.json`**

```json
{
  "build": {
    "appId": "com.dlibrary.app",
    "productName": "DLibrary",
    "files": ["out/**/*"],
    "win": {
      "target": "nsis"
    }
  }
}
```

- [ ] **Step 2: Verify the production build**

Run: `npm run build`
Expected: `electron-vite build` produces `out/main`, `out/preload`, `out/renderer`; `electron-builder` then produces a Windows installer under `dist/`. Exit code 0.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add electron-builder packaging config"
```

---

### Task 21: Final verification pass and README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run the full verification suite**

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
Expected: all four exit 0.

- [ ] **Step 2: Create `README.md`**

```markdown
# DLibrary

DLsite에서 구매한 게임을 Steam 라이브러리처럼 관리하는 Windows용 Electron 앱.

## 개발

```bash
npm install
npm run dev
```

## 스크립트

- `npm run dev` — 개발 모드 실행 (HMR)
- `npm run build` — 프로덕션 빌드 + 패키징
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript 프로젝트 참조 빌드
- `npm run test` — Vitest
- `npm run db:generate` / `npm run db:migrate` — Drizzle 마이그레이션

## 설계 문서

- 초기 셋업 스펙: `docs/superpowers/specs/2026-07-23-initial-setup-design.md`
- 이 구현 계획: `docs/superpowers/plans/2026-07-23-initial-setup-plan.md`
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with dev instructions"
```
