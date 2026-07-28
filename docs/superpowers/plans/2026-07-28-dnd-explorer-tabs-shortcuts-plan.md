# 드래그앤드롭·Explorer 탭 UX·단축키 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라이브러리 추가 다이얼로그에 드래그앤드롭 입력을 추가하고, Explorer 탭에 닫기 버튼/`Ctrl+W`/휠클릭을 붙이고, 임의 경로를 새 탭으로 여는 버튼을 추가한다. 즐겨찾기 토글·게임 실행에 단축키를 연결한다.

**Architecture:** 드래그앤드롭은 Electron 최신 버전에서 `File.path`가 제거되어 `webUtils.getPathForFile(file)`(preload에서만 접근 가능)을 써야 한다 — 설치된 Electron 버전의 타입 정의에서 직접 확인한 API. 단축키는 각 페이지가 필요한 것만 개별 등록하는 기존 패턴(검색 헤더의 `Ctrl+F`, C그룹에서 이미 구현됨)을 따르고, 전역 키바인딩 레지스트리 같은 새로운 추상화는 만들지 않는다(현재 필요한 단축키가 몇 개뿐이라 과설계).

**Tech Stack:** 기존 스택 그대로. 신규 의존성 없음.

## Global Constraints

- TypeScript strict 모드, `npm run typecheck` 에러 0개.
- ESLint + Prettier 에러/경고 0개.
- 모든 신규 파일은 상대경로 import만 사용.
- **진행률 표시(스펙의 13번)는 이 플랜에서 다루지 않는다.** 현재 이 앱에 실제로 오래 걸리는 배치 작업(여러 항목을 순차 처리하며 진행률을 보고할 만한 작업)이 없다 — A그룹의 DLsite 크롤링은 단건 조회 한 번의 네트워크 요청이라 의미 있는 퍼센트 단위 진행률이 없다. 진행률 UI를 지금 만들면 호출하는 곳이 없는 죽은 코드가 된다(YAGNI) — 향후 여러 게임을 한 번에 크롤링하는 등 진짜 배치 작업이 설계될 때 그 작업과 함께 구현한다.
- 이 플랜은 D그룹 플랜(`2026-07-28-favorites-rating-codeless-files-plan.md`)과 B그룹 플랜(`2026-07-28-game-launch-playtime-save-backup-plan.md`)이 이미 구현되어 `useToggleFavorite`/`useLaunchGame`이 존재한다고 가정한다.
- 스펙 참조: `docs/superpowers/specs/2026-07-28-game-management-expansion-design.md`.

---

### Task 1: 라이브러리 추가 드래그앤드롭

**Files:**
- Modify: `electron/preload/index.ts`
- Modify: `src/pages/Settings/SettingsPage.tsx`

**Interfaces:**
- Produces: `window.api.libraries.getPathForFile(file: File): string` — 드롭된 `File` 객체에서 절대경로를 얻는다. Electron 최신 버전은 `File.path`를 제거했으므로 `webUtils.getPathForFile`을 preload에서만 호출할 수 있다(공식 문서: 컨텍스트 격리 하에서 렌더러가 직접 접근 불가).

- [ ] **Step 1: `electron/preload/index.ts`에 `getPathForFile` 노출**

파일 상단 import에 `webUtils` 추가:

```ts
import { contextBridge, ipcRenderer, webUtils } from 'electron'
```

`libraries` 객체 안에 추가:

```ts
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
```

- [ ] **Step 2: `src/pages/Settings/SettingsPage.tsx`의 `AddLibraryDialog`에 드롭존 추가**

`AddLibraryDialog` 함수 안, `handlePickFolder` 근처에 핸들러 추가:

```ts
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const path = window.api.libraries.getPathForFile(file)
    if (path) setValue('path', path, { shouldValidate: true })
  }
```

`<form>` 태그를 드롭존으로 감싼다(기존 `<form className="flex flex-col gap-4" onSubmit={...}>`를 아래처럼 교체):

```tsx
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
```

기존 "경로" `Input` 아래(또는 그 근처)에 안내 문구 추가:

```tsx
          <p className="-mt-2 text-xs text-muted-foreground">
            폴더를 여기로 드래그해서 놓아도 경로가 채워집니다.
          </p>
```

- [ ] **Step 3: 수동 검증 (CDP 또는 실제 앱)**

Settings의 "라이브러리 추가" 다이얼로그를 열고 OS 파일탐색기에서 폴더를 드래그해 다이얼로그 위에 놓았을 때 경로 입력란이 채워지는지 확인. 드래그 중 테두리가 강조되는지도 확인.

- [ ] **Step 4: Typecheck 및 lint**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 exit 0.

- [ ] **Step 5: Commit**

```bash
git add electron/preload/index.ts src/pages/Settings/SettingsPage.tsx
git commit -m "feat: add drag-and-drop folder input to add-library dialog"
```

---

### Task 2: Explorer 탭 닫기 UI

**Files:**
- Modify: `src/pages/Explorer/TabBar.tsx`

**Interfaces:** 없음 (기존 `closeTab` 액션을 UI로 노출할 뿐 — 새 상태/IPC 없음).

- [ ] **Step 1: `TabBar.tsx`의 `SortableTab`에 X 버튼과 휠클릭 추가**

`import { Plus } from 'lucide-react'`를 `import { Plus, X } from 'lucide-react'`로 변경. `SortableTab`의 `<button>`(탭 자체)을 교체:

```tsx
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={() => setActiveTab(tab.id)}
          onAuxClick={(e) => {
            if (e.button === 1) closeTab(tab.id) // 마우스 휠클릭(가운데 버튼)으로 탭 닫기
          }}
          className={`group flex shrink-0 items-center gap-1 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors ${
            tab.id === activeTabId
              ? 'border-primary bg-card font-medium'
              : 'border-transparent hover:bg-accent'
          }`}
        >
          <span>{tab.label}</span>
          <button
            aria-label="탭 닫기"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
            className="rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => closeTab(tab.id)}>탭 닫기</ContextMenuItem>
        <ContextMenuItem onSelect={() => closeOtherTabs(tab.id)}>다른 탭 모두 닫기</ContextMenuItem>
        <ContextMenuItem onSelect={() => duplicateTab(tab.id)}>탭 복제</ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('refresh folder', tab.path)}>
          이 폴더 새로고침
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => console.log('reveal in OS explorer', tab.path)}>
          탐색기(OS)에서 폴더 열기
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
```

주: 기존엔 탭 전체가 `<button>`이었는데, 안에 닫기 `<button>`을 중첩하면 HTML상 버튼 안에 버튼이 들어가는 잘못된 구조가 된다 — 바깥을 `<div>` + `role`을 굳이 추가하지 않고(드래그 핸들 속성이 이미 `{...attributes}`로 접근성을 다루므로), 클릭 핸들러만 유지하는 것으로 대체했다. `dnd-kit`의 `attributes`/`listeners`는 포커스 가능한 엘리먼트를 요구하지 않으므로 `<div>`로도 동작한다.

- [ ] **Step 2: `TabBar` 함수 본문에 `Ctrl+W` 글로벌 핸들러 추가**

```ts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key === 'w') {
        event.preventDefault()
        const activeTabId = useExplorerStore.getState().activeTabId
        if (activeTabId) closeTab(activeTabId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeTab])
```

`import { useEffect } from 'react'`를 파일 상단에 추가.

- [ ] **Step 3: 수동 검증 (CDP 또는 실제 앱)**

Explorer에서 탭에 마우스를 올리면 X 버튼이 나타나고 클릭하면 닫히는지, `Ctrl+W`로 활성 탭이 닫히는지, 탭을 마우스 휠클릭(가운데 버튼)으로 닫을 수 있는지 확인.

- [ ] **Step 4: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Explorer/TabBar.tsx
git commit -m "feat: add visible close button, Ctrl+W, and middle-click to Explorer tabs"
```

---

### Task 3: Explorer 임의 경로 열기

**Files:**
- Modify: `src/pages/Explorer/TabBar.tsx`

**Interfaces:**
- Consumes: `window.api.libraries.pickFolder()`(이미 존재, 라이브러리 등록 없이 경로만 반환).

- [ ] **Step 1: `TabBar.tsx`에 "폴더 열기" 버튼 추가**

`import { FolderOpen, Plus, X } from 'lucide-react'`로 `FolderOpen` 추가. `TabBar` 함수 본문에 핸들러 추가:

```ts
  const handleOpenFolder = async (): Promise<void> => {
    const path = await window.api.libraries.pickFolder()
    if (!path) return
    const label = path.split(/[\\/]/).filter(Boolean).pop() ?? path
    addTab({ label, path })
  }
```

기존 "+"(새 탭) 버튼 옆에 추가:

```tsx
          <button
            onClick={handleOpenFolder}
            aria-label="폴더 열기"
            title="폴더 열기"
            className="flex shrink-0 items-center justify-center rounded-t-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
```

주: 기존 "+" 버튼(`handleAddTab`, 등록된 첫 라이브러리 경로로 새 탭)과 이번에 추가하는 "폴더 열기" 버튼(임의 경로 선택)은 서로 다른 진입점으로 공존한다 — 라이브러리가 없어도 "폴더 열기"로는 항상 아무 폴더나 탭으로 열 수 있다.

- [ ] **Step 2: 수동 검증 (CDP 또는 실제 앱)**

Explorer 탭바의 "폴더 열기" 버튼으로 등록되지 않은 임의 폴더를 새 탭으로 열 수 있는지 확인 — 라이브러리가 하나도 없는 상태(설정에서 모두 삭제)에서도 동작하는지 확인.

- [ ] **Step 3: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Explorer/TabBar.tsx
git commit -m "feat: add arbitrary-path folder open button to Explorer tab bar"
```

---

### Task 4: 즐겨찾기/실행 단축키

**Files:**
- Modify: `src/pages/Gallery/GalleryPage.tsx`
- Modify: `src/pages/Explorer/DetailOverlay.tsx`

**Interfaces:** 없음 (기존 훅을 단축키로 연결할 뿐).

**범위**: 즐겨찾기 토글은 Gallery에서 "현재 마우스 오버 중인 카드"에 대해 동작하게 한다(포커스 개념이 카드 그리드에 없으므로 hover 상태를 추적). 실행 토글은 DetailOverlay가 열려 있을 때 그 게임에 대해서만 동작한다(오버레이가 열린 게임이 곧 "현재 선택된 게임"이므로 hover 추적이 필요 없음).

- [ ] **Step 1: `GalleryPage.tsx`에 hover 추적 + `F` 단축키로 즐겨찾기 토글**

`GameCard`에 `onMouseEnter`/`onMouseLeave`를 받아 부모에 알리는 방식 대신, 카드 자체에서 `onMouseEnter`로 전역 상태(간단한 모듈 레벨 변수 대신 `GalleryPage`의 `useState`로 "현재 hover 중인 game" 추적)를 쓰는 게 더 명확하다. `GalleryPage` 함수 본문에 추가:

```ts
  const [hoveredGame, setHoveredGame] = useState<ScannedEntry | null>(null)
  const toggleFavoriteShortcut = useToggleFavorite()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'f' || event.ctrlKey || event.altKey) return
      if (!hoveredGame) return
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return // 검색창 입력 중엔 무시
      event.preventDefault()
      toggleFavoriteShortcut.mutate({ entry: hoveredGame, isFavorite: true })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hoveredGame, toggleFavoriteShortcut])
```

`GameCard`가 hover 상태를 부모에 알리도록 `onHoverChange` prop 추가:

```tsx
function GameCard({
  game,
  genres,
  onToggleGenreFilter,
  onHoverChange,
}: {
  game: ScannedEntry
  genres: string[]
  onToggleGenreFilter: (genre: string) => void
  onHoverChange: (game: ScannedEntry | null) => void
}) {
  // ...
  return (
    <motion.div
      onMouseEnter={() => onHoverChange(game)}
      onMouseLeave={() => onHoverChange(null)}
      whileHover={{ scale: 1.05 }}
      // ...나머지 그대로
```

`GameCell`/`GridCellProps`에 `onHoverChange` 전달 추가(기존 `onToggleGenreFilter`와 동일한 방식으로 `cellProps`를 통해 흘려보냄).

**주**: `F` 단축키는 항상 `isFavorite: true`만 설정한다(토글이 아니라 "즐겨찾기 추가" 전용) — 이미 즐겨찾기된 항목을 다시 `F`로 해제하려면 카드의 하트 아이콘을 직접 클릭해야 한다. 진짜 토글(현재 상태 반전)을 하려면 `hoveredGame`의 현재 `isFavorite` 값을 알아야 하는데, 그 값은 `useGameUserData(game)`을 `GalleryPage`에서 또 호출해야 해서 카드별로 이미 하고 있는 조회와 중복된다 — 이번 범위에서는 단순 "추가"로 제한하고, 진짜 토글이 필요하면 카드의 하트 아이콘을 쓰는 것으로 충분하다고 본다.

- [ ] **Step 2: `DetailOverlay.tsx`에 `Ctrl+Enter`로 실행 단축키 추가**

`DetailOverlay` 함수 본문에 추가(이미 D/B그룹에서 `useState`/`useLaunchGame` import가 있음):

```ts
  useEffect(() => {
    if (!game) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.key === 'Enter' && game.kind === 'folder') {
        event.preventDefault()
        launchGame.mutate(game)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [game, launchGame])
```

`import { useEffect } from 'react'`를 파일 상단에 추가.

- [ ] **Step 3: 수동 검증 (CDP 또는 실제 앱)**

Gallery에서 카드에 마우스를 올린 채 `F`를 누르면 즐겨찾기가 켜지는지(검색창에 포커스가 있을 땐 무시되는지도) 확인. Explorer에서 DetailOverlay를 열고 `Ctrl+Enter`로 실행되는지 확인.

- [ ] **Step 4: Typecheck, lint, test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: 모두 exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Gallery/GalleryPage.tsx src/pages/Explorer/DetailOverlay.tsx
git commit -m "feat: add favorite (F) and launch (Ctrl+Enter) keyboard shortcuts"
```

---

### Task 5: 최종 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 검증 스위트 실행**

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
npm run build
```
Expected: 다섯 개 모두 exit 0.

- [ ] **Step 2: Commit** (Step 1에서 수정이 필요했을 때만)

```bash
git add -A
git commit -m "fix: address issues found in dnd/explorer-tabs/shortcuts verification pass"
```

---
