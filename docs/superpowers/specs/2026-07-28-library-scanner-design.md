# 실제 라이브러리 스캔 및 관련 UI 설계

## 배경

초기 셋업 단계(`2026-07-23-initial-setup-design.md`)는 Gallery/List/Explorer를 전부 mock 데이터로 스캐폴딩했다. 그 문서의 "다음 단계" 로드맵 중 일부(SQLite 스키마, 폴더 스캐너, Explorer 실제 폴더 읽기)를 이번 단계에서 구현하되, DLsite/Steam 메타데이터 크롤링과 원격 이미지 캐싱은 여전히 그 다음 단계로 미룬다.

이번 작업은 사용자의 5가지 요청에서 출발했다:
1. Gallery 카드 크기 조절 슬라이더 UI (기존 Ctrl+휠 줄과 함께)
2. RJ/VJ(DLsite) 외에 ST(Steam) 코드 인식
3. 파일 정렬 (이름/변경시간, 오름/내림차순)
4. 라이브러리 추가 시 네이티브 폴더 선택 다이얼로그
5. RJ/VJ/ST 코드 클릭 시 DLsite/Steam 하이퍼링크를 기본 브라우저로 열기

분석 결과 2·3·4·5는 모두 "실제 폴더 스캔"이라는 하나의 근본 작업에 의존하므로, 이번 스펙은 이를 하나의 설계로 통합해서 다룬다. Gallery 줄 바(1번)는 기술적으로 독립적이지만, UI상 정렬 툴바와 같은 자리에 놓이므로 같은 스펙에서 함께 다룬다.

## 범위

**포함**
- 라이브러리 경로 실제 영속화 (SQLite `libraries` 테이블) + 네이티브 폴더 선택 다이얼로그 (기존 텍스트 입력과 병행)
- Gallery/List/Explorer를 실제 파일시스템 스캔 결과로 전환 (mock 데이터 제거)
- RJ/VJ/ST 코드 인식: 파일/폴더명 어디든 `(RJ|VJ|ST)\d+` 패턴(대소문자 무관, 단어 경계 적용)이 있으면 인식
- 폴더형 게임 항목의 로컬 썸네일 지연 로딩 (원격 다운로드/캐싱 없음, 화면에 보이는 카드만 실제 이미지 파일 읽기)
- Gallery/List/Explorer 각각 독립적인 정렬 상태(이름/변경시간, 오름/내림차순) + 화면 상단 공용 툴바 (줄 바는 Gallery에서만 표시)
- RJ/VJ → DLsite, ST → Steam 하이퍼링크 (DetailOverlay 코드 텍스트, 기존 컨텍스트메뉴 "DLsite 페이지 열기"/"DLsite 열기" 스텁, List 행의 코드 컬럼) — `shell.openExternal`로 기본 브라우저 오픈 (Windows/Mac/Linux 모두 네이티브 지원)
- Explorer 탭 상태(목록/순서/활성탭) SQLite 영속화 및 앱 재시작 시 복원

**제외 (계속 다음 단계로 유보)**
- DLsite/Steam 실제 메타데이터 크롤링 (제목/서클/발매일/공식 커버이미지 다운로드)
- 원격 이미지 캐싱 (`cache/RJ123456.webp` 등)
- 압축 해제, 즐겨찾기/메모/평점 실동작
- `games` 테이블 영속화 (이번 단계는 매번 실시간 스캔 — 아래 "향후 메타데이터 캐싱과의 관계" 참고)

**구현 순서 (의존성 순)**
1. 라이브러리 경로 영속화 + 폴더 선택 다이얼로그
2. 폴더 스캐너 핵심 로직 (재귀/얕은 스캔, 코드 인식, 지연 썸네일)
3. Gallery/List를 실제 스캔 데이터로 교체
4. Explorer를 실제 스캔 데이터로 교체 + 탭 상태 영속화
5. 정렬 툴바 UI (Gallery/List/Explorer)
6. RJ/VJ/ST 하이퍼링크
7. Gallery 줄 바 UI (완전히 독립적이라 순서상 아무 때나 가능하지만, 정렬 툴바와 같은 컴포넌트에 놓이므로 5번과 함께 진행)

## 향후 메타데이터 캐싱과의 관계

스캔 데이터(코드/파일명/변경시간/경로)와 크롤링 데이터(제목/서클/발매일/커버이미지)는 성격이 다르다: 스캔 데이터는 로컬 파일시스템에서 나오므로 매번 다시 읽어도 비용이 적고 항상 최신이지만, 크롤링 데이터는 네트워크 요청이라 캐싱이 필요하다. 따라서 이번 단계는 `games` 테이블을 만들지 않고 매번 실시간 스캔한다. 다음 단계에서 메타데이터 크롤링이 추가되면 코드(RJ01234 등)를 기본키로 하는 별도의 `game_metadata` 캐시 테이블을 새로 만들고, 화면 표시 시 (1) 라이브 스캔으로 현재 디스크 상태를 가져온 뒤 (2) 코드로 캐시를 조회해 크롤링된 제목/커버가 있으면 덮어쓰는 방식으로 확장한다. 이번 단계의 스캐너/IPC 구조를 재설계할 필요는 없다.

## 데이터 모델

`electron/main/database/schema.ts`에 추가:

```ts
export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),       // 저장 전 정규화(소문자 변환 등) 필수 - Windows는 대소문자 무관 파일시스템
  createdAt: text('created_at').notNull(),
})

export const explorerTabs = sqliteTable('explorer_tabs', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  path: text('path').notNull(),
  position: integer('position').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
})
```

- `libraries`: `librariesRepository.ts` (Task 6의 `settingsRepository` 패턴), 경로 저장 전 정규화 함수(`normalizeLibraryPath`)를 거쳐 대소문자만 다른 중복 등록을 방지
- `explorerTabs`: 탭 변경 시 debounce 후 저장, 앱 부팅 시 `useExplorerStore`의 초기 상태로 복원
- `games` 테이블은 만들지 않음 (위 "향후 메타데이터 캐싱과의 관계" 참고)

Settings 페이지의 `useMockLibraryStore`(Zustand, 미영속)는 제거하고 IPC + React Query 서비스로 교체한다.

## 폴더 스캐너 아키텍처

`electron/main/scanner/`에 순수 함수로 구현. **`fs.promises` 기반 비동기 I/O 필수** — 재귀 스캔은 better-sqlite3의 동기 접근과 달리 대형 라이브러리에서 눈에 띄게 느려질 수 있고, 동기로 짜면 스캔 중 main 프로세스 전체(다른 IPC 포함)가 멈춘다.

```ts
export interface ScannedEntry {
  name: string          // 파일/폴더명 그대로 (확장자 포함, 가공 없음)
  path: string
  kind: 'folder' | 'file'
  mtimeMs: number
  code: { type: 'RJ' | 'VJ' | 'ST'; value: string } | null
}

export async function scanFolderShallow(dirPath: string): Promise<ScannedEntry[]>
// Explorer용: dirPath의 직계 자식만 나열 (Windows 탐색기처럼 전부 표시, 코드 인식 여부 무관)

export async function scanLibraryRecursive(libraryPath: string): Promise<ScannedEntry[]>
// Gallery/List용: 전체 트리 재귀 탐색, code가 인식된 항목만 반환

export function extractCode(name: string): ScannedEntry['code']
// 정규식: /\b(RJ|VJ|ST)(\d+)\b/i - 이름 어디든 매칭. 드물게 우연한 오탐(예: "ST2024_backup" 같은 이름)이 가능하나 감수하기로 합의된 트레이드오프

export async function findThumbnailPath(folderPath: string): Promise<string | null>
// cover/folder/thumbnail 등 특정 파일명 우선 탐색, 없으면 폴더 내 이미지 확장자 파일 중 알파벳순 첫 번째. 압축파일은 대상 아님(null)
```

**썸네일은 스캔 결과에 전혀 포함하지 않고, 완전히 지연 로딩한다.** `scanFolderShallow`/`scanLibraryRecursive`는 이미지 파일을 전혀 들여다보지 않고 메타데이터(이름/경로/종류/mtime/코드)만 반환한다. Gallery/List/Explorer는 이미 `react-window`로 화면에 보이는 항목만 렌더링하므로, 카드가 실제로 렌더링될 때 `scanner:get-thumbnail(entryPath)` IPC로 개별 요청한다. 이 호출이 내부적으로: entryPath가 폴더면 `findThumbnailPath`로 1단계 안쪽을 뒤져 이미지를 찾아 base64로 인코딩해 반환하고, 파일(압축파일 등)이면 즉시 `null`을 반환한다. **"1단계 더 들여다보는" 동작은 스캔 시점이 아니라 이 지연 호출 시점에만 일어나며, Explorer와 Gallery/List 모두 동일한 규칙을 공유한다** — 스캔 함수 자체는 Explorer용/Gallery·List용 구분 없이 순수하게 파일 목록/메타데이터만 다룬다.

- `code`가 없는 항목은 Gallery/List에 나타나지 않음 (Explorer에는 여전히 전부 표시)
- 압축파일(`.zip` 등)은 썸네일 없음(`null`), 일반 파일 아이콘으로 렌더링. 압축 해제/내부 미리보기는 다음 단계

## IPC 계약 (`shared/types/ipc.ts`)

```
libraries:list / libraries:add / libraries:remove
libraries:pick-folder                                     # dialog.showOpenDialog 래핑, 취소 시 null 반환
scanner:scan-recursive { libraryPaths: string[] } → ScannedEntry[]   # Gallery/List
scanner:scan-shallow { dirPath: string } → ScannedEntry[]            # Explorer
scanner:get-thumbnail { entryPath: string } → string | null          # 지연 로딩, 단건
explorer:save-tabs { tabs: ExplorerTab[] } / explorer:load-tabs → ExplorerTab[]
shell:open-external { code: { type: 'RJ'|'VJ'|'ST'; value: string } } → void
```

모든 payload는 zod 스키마로 검증한다 (기존 `SetSettingRequestSchema` 패턴 유지). `shell:open-external`은 renderer가 임의 URL 문자열을 넘기지 않고 코드만 전달하며, main 프로세스의 `buildExternalUrl(code)` 함수가 URL을 직접 생성해서 여는 방식으로 — renderer發 임의 URL 오픈을 막는다.

**URL 생성 규칙:**
- RJ/VJ → `http://dlsite.com/maniax/work/=/product_id/{code}.html` (VJ도 동일 패턴 적용 — 실제 확인된 형식은 아니며, 추후 다르다고 확인되면 이 함수 하나만 수정하면 됨)
- ST → `https://store.steampowered.com/app/{숫자부분}` ("ST" 접두사를 뗀 숫자만 사용)

## UI 변경

- **공용 상단 툴바** (`src/components/layout/PageToolbar.tsx`): 정렬 드롭다운(이름/변경시간) + 오름/내림차순 토글 버튼. Gallery/List/Explorer 각 페이지가 자신의 정렬 상태(페이지별 독립, 세션 한정 - 재시작 시 초기화)를 툴바에 연결. Gallery 페이지에서만 줄 바가 추가로 표시됨 (기존 Ctrl+휠 줄 상태와 동일한 값 공유)
- **Settings**: 기존 텍스트 입력 유지 + "폴더 선택" 버튼 추가(`libraries:pick-folder` 호출 후 입력란 자동 채움). `useMockLibraryStore` 제거, 실제 IPC + React Query 서비스로 교체
- **DetailOverlay / List 행 / Explorer 컨텍스트메뉴**: RJ/VJ/ST 코드 텍스트를 클릭 가능하게 만들고 `shell:open-external` 호출. 기존 "DLsite 페이지 열기"/"DLsite 열기" 콘솔 로그 스텁을 동일 로직으로 실동작 연결

## 테스트 & 에러 처리

- 스캐너 순수 함수는 `fs.mkdtemp`로 만든 실제 임시 디렉토리에 테스트용 파일/폴더를 만들어 Vitest로 검증 (fs 목킹 없이, Task 6 패턴과 동일)
- 라이브러리 경로가 스캔 시점에 존재하지 않으면(삭제/이동된 외장 드라이브 등) 해당 라이브러리만 건너뛰고 나머지는 정상 표시, Settings 페이지에 경고 텍스트 표시
- 폴더 선택 다이얼로그 취소는 에러가 아닌 정상 흐름 (`null` 반환, 입력란 변경 없음)
- `shell:open-external`은 `buildExternalUrl`이 유효한 코드 형식에서만 URL을 만들도록 제한 (잘못된 코드 형식이 들어오면 아무 동작 안 함)
