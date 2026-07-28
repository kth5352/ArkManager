# DLibrary 게임 관리 기능 확장 설계

## 배경

`2026-07-28-library-scanner-design.md`(실시간 스캐너) 완료 후, 그 문서에서 명시적으로 다음 단계로 미뤄뒀던 항목들(DLsite 메타데이터 크롤링, 이미지 캐싱, 즐겨찾기/메모/평점 실동작)과 사용자가 새로 제시한 확장 요구 18가지를 통합해서 설계한다. 대부분의 항목이 결국 "게임 코드(RJ/VJ/ST)를 키로 하는 영속 데이터"를 필요로 하므로, 이를 먼저 공통 기반으로 확정하고 그 위에 각 기능을 얹는 구조로 간다.

## 범위

**포함 (A~F 그룹, 18개 요청)**
- 선행작업: `game_metadata`/`game_user_data` 테이블 및 Repository 기반
- A그룹: DLsite 메타데이터 크롤링, 이미지 캐싱, DLsite 검색 탭
- B그룹: 플레이시간 기록, 세이브 파일 백업, 실행 방식(일반/Locale Emulator) 설정, 최근 플레이 탭
- C그룹: 검색 헤더, 태그 필터 + DetailList 뷰, Gallery 카드 정렬
- D그룹: 즐겨찾기, 평점/메모, 코드없는 파일의 Gallery/List 노출
- E그룹: 라이브러리 추가 드래그앤드롭
- F그룹: Explorer 탭 닫기 UI, Explorer 임의 경로 열기, 단축키, 진행률 표시

**제외 (계속 다음 단계로 유보)**
- AI 기반 파일명 자동 정리(7번) — 사용자 본인이 별도 논의로 명시
- 세이브 파일 위치 자동 탐지 — 사용자가 직접 지정하는 방식으로 확정, 자동 탐지는 하지 않음
- Locale Emulator 자동 설치 — 설치 여부 확인 및 안내만, 설치 자체는 사용자 책임
- 실행파일 자동 판별(설치파일/제거파일 vs 본 실행파일 완벽 구분) — 목록은 보여주되 최종 선택은 사용자가 함

## 구현 순서 (의존성 순)

1. 선행작업 — `game_metadata`/`game_user_data` 스키마 및 Repository
2. A그룹 — DLsite 크롤링(장르/제목/서클/커버) + 이미지 캐시 + 검색 탭 (C그룹의 태그 데이터, B그룹의 표시용 메타데이터가 여기 의존)
3. D그룹 — 즐겨찾기/평점/메모 + 코드없는 파일 타입 계약 변경 (A와 독립, 선행작업만 있으면 됨)
4. B그룹 — 실행/플레이시간/세이브백업/최근플레이
5. C그룹 — 검색 헤더 + 태그필터 + DetailList + Gallery 정렬 (A그룹의 장르 데이터 필요)
6. E그룹, F그룹 — 상대적으로 독립적인 소규모 작업, 다른 그룹과 병행 가능

## 데이터 모델

### 선행작업: `electron/main/database/schema.ts`에 추가

```ts
export const gameMetadata = sqliteTable('game_metadata', {
  code: text('code').primaryKey(), // 'RJ01234567' 형태
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const gameUserData = sqliteTable('game_user_data', {
  key: text('key').primaryKey(),           // code 있으면 code값, 없으면 정규화된 경로
  keyType: text('key_type').notNull(),     // 'code' | 'path'
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

- `gameMetadataRepository.ts`: DLsite 크롤링 캐시 전용. A그룹 구현 시 `title`/`circle`/`releaseDate`/`coverImagePath`/`genres`(배열이므로 JSON 텍스트 컬럼으로 저장 예정) 등 실제 컬럼명·타입을 그때 확정해 마이그레이션으로 추가. 이 문서에서 `genres`라는 이름을 미리 쓰는 곳은 모두 편의상의 가칭이다.
- `gameUserDataRepository.ts`: 사용자 개인 데이터 전용. D/B그룹 구현 시 `isFavorite`/`rating`/`memo`/`totalPlaytimeMs`/`lastPlayedAt`/`savePath`/`launchConfig`(json) 등을 마이그레이션으로 추가.
- **재키잉**: `rekeyToCode(db, oldPathKey, newCode)` — `key_type='path'`인 레코드를 사용자가 나중에 코드를 수동 지정했을 때 `key_type='code'`로 이전. 기존 row를 삭제하고 새 code 키로 재삽입(단일 트랜잭션).
- 두 테이블 모두 `libraries`/`explorerTabs`/`sortPreferences`와 동일하게 `client.ts`에 `CREATE TABLE IF NOT EXISTS` 추가.
- 오늘 단계에서는 이 두 테이블의 키 구조와 Repository의 기본 CRUD + 재키잉만 구현한다. 실제 기능 컬럼은 해당 기능이 설계·구현될 때 각각 마이그레이션으로 추가한다.

### 스캐너 타입 변경 (`shared/types/scanner.ts`)

- `ScannedEntry`에 `size: number` 필드 추가 (DetailList의 "용량" 컬럼용). `toScannedEntry`가 이미 호출하는 `stat()` 결과에서 `.size`만 추가로 읽으면 되므로 스캐너 로직 자체의 구조 변경은 없음.
- **`GameEntry` 타입 폐기, `scanLibraryRecursive`의 반환 타입을 `ScannedEntry[]`로 변경.** 기존에는 `code`가 non-null임을 타입으로 보장했으나(코드없는 항목은 애초에 결과에서 제외), D그룹 결정(9번)에 따라 코드없는 파일도 Gallery/List에 노출해야 하므로 이 보장이 더 이상 성립하지 않는다.
  - `scanLibraryRecursive`의 순회 로직 변경: 코드없는 **폴더**는 기존처럼 재귀 진입(내부에 코드있는 항목이 있는지 계속 탐색). 코드없는 **파일**은 기존엔 버려졌으나, 이제 `code: null` 상태로 결과에 포함.
  - 영향 범위: `electron/main/ipc/scannerHandlers.ts`(반환 타입), `src/services/useGames.ts`, `src/pages/Gallery/GalleryPage.tsx`(`GameCard`가 code null이면 RJ번호 줄/썸네일 조건 처리), `src/pages/List/ListPage.tsx`(`GameRow`의 코드 클릭 핸들러가 지금은 non-null 가정 — null 가드 추가 필요), `src/lib/sortEntries.ts`(코드 유무와 무관하게 기존 name/mtime 정렬은 그대로 사용 가능, 변경 불필요).
  - 이미 리뷰·승인된 타입 계약을 바꾸는 작업이므로, 구현 계획에서 별도 태스크로 분리해 명확히 다룬다.

## A그룹 — DLsite 메타데이터/크롤링

- **수집 방식**: DLsite에 공식 API가 없으므로 main 프로세스에서 HTML을 `fetch`로 가져와 `cheerio`(신규 의존성)로 파싱. RJ는 `https://www.dlsite.com/maniax/work/=/product_id/{code}.html`, VJ는 `https://www.dlsite.com/pro/work/=/product_id/{code}.html`로 요청 경로 분기 (`buildExternalUrl.ts`도 동일한 사실관계로 즉시 수정 — 아래 "부수 수정" 참고).
- **DLsite 검색 탭**: 사이드바 신규 라우트. RJ/VJ 코드 직접 조회 또는 제목 텍스트 검색 → 상세페이지 유사 레이아웃으로 결과 표시(제목/서클/발매일/장르/커버) → "저장" 버튼으로 `game_metadata`에 upsert.
- **이미지 캐시(★14번)**: `app.getPath('userData')/cache/covers/{code}.webp`. Sharp(초기 설계에서 이미 선정)로 원본 다운로드 후 webp 변환·저장. 게임 파일이 위치한 경로에는 어떤 것도 쓰지 않는다.
- **진행률 인프라(13번 관련)**: 크롤링은 네트워크 요청이라 로컬 스캔과 달리 실제로 느릴 수 있음 — main→renderer IPC 이벤트(`webContents.send`)로 진행 틱을 보내고, 사이드바 하단에 표시 + `BrowserWindow.setProgressBar()`로 taskbar % 동시 표시. 이 인프라는 A그룹에서 처음 만들고, 이후 다른 긴 작업(라이브러리 최초 스캔 등)이 필요해지면 재사용.

## B그룹 — 게임 실행·세션 추적

- **실행 방식 설정(3번)**: `game_user_data.launchConfig`(json)에 `{ executablePath, launchMode: 'normal' | 'locale-emulator' }` 저장. `locale-emulator` 선택 시 시스템에 설치된 `LEProc.exe` 경로를 찾아 그 인자로 실제 exe를 넘겨 실행. 설치가 감지되지 않으면 안내 문구만 표시(자동 설치 안 함).
- **실행파일 선택 팝업**: 게임 폴더 내 `.exe` 목록을 다이얼로그로 보여주고 사용자가 실행파일 + 실행방식을 선택 → `launchConfig`에 저장, 이후 재사용. 설치파일/제거파일 완벽 자동 판별은 하지 않음(최종 선택은 사용자 몫).
- **플레이시간(1번)**: 실행 시 자식 프로세스 시작~종료 시각으로 세션 시간을 계산해 `totalPlaytimeMs`에 누적, `lastPlayedAt` 갱신.
- **세이브 파일 백업(★2번)**: 게임별로 사용자가 세이브 폴더 경로를 직접 지정(네이티브 폴더선택, Settings 라이브러리 추가와 동일 IPC 패턴) → `game_user_data.savePath`에 저장 → `userData/saves/{code}/`로 복사·동기화. 자동 위치 탐지는 하지 않음. 게임 파일이 삭제되어도 `savePath` 자체가 게임 파일 경로와 독립적이므로 백업은 영향받지 않는다.
- **최근 플레이 탭(15번)**: `game_user_data.lastPlayedAt` 기준 정렬 신규 사이드바 탭. `game_metadata`의 캐시된 제목/커버를 사용하므로 원본 게임 파일이 삭제된 뒤에도(★2번 요구사항) 계속 표시 가능.

## C그룹 — 검색·필터·뷰

- **검색(4번)**: 페이지별(Gallery/List/DetailList/Explorer) 독립 상태로 확정. 각 페이지 자체 검색바 — Ctrl+F로 포커스, 텍스트 있으면 확장 유지, 빈 상태로 blur되면 CSS 애니메이션으로 축소. 검색 대상: 제목/장르/서클명/게임코드. 제외태그(장르) 설정 가능, 필터링 상태에서는 "필터 해제" 버튼 노출.
- **태그 필터(★11번)**: Gallery/List에 장르 뱃지 추가(현재 카드/행에 `game_metadata.genres`가 있을 때만 표시), 클릭 시 필터 토글. `game_metadata` 데이터가 없는 항목(A그룹 크롤링 전, 또는 코드없는 파일)은 태그 없이 표시.
- **DetailList(신규 뷰, 구 BigList)**: 텍스트 전용 테이블 뷰, 신규 사이드바 탭. 컬럼: 게임인식코드 / 파일명 / 파일경로 / 장르·태그 / 수정날짜 / 용량. 기존 List는 그대로 유지(이미지+제목 위주의 간결한 뷰라는 원래 설계 의도 보존).
- **Gallery 카드 정렬(18번)**: `react-window` `Grid`는 고정폭 가상화라 순수 CSS `space-around`는 적용 불가 — 컬럼 수 계산 시 남는 폭을 카드 사이 여백으로 동적 배분(현재 `GAP` 상수 기반 계산을 컬럼별 균등 여백 계산으로 확장).

## D그룹 — 개인화

- **즐겨찾기(5번)**: `game_user_data.isFavorite`(boolean), 신규 사이드바 탭에서 필터링해 표시.
- **평점/메모(10번)**: `game_user_data.rating`(number)/`memo`(text), 기존 Dialog 컴포넌트 재사용한 편집 UI.
- **코드없는 파일 노출(9번)**: 위 "스캐너 타입 변경" 절 참고. Explorer는 이미 전체 표시 중이므로 변경 없음. Gallery/List에도 코드없는 항목이 `code: null` 상태로 표시되며, 즐겨찾기/평점/메모는 `gameUserDataRepository`의 path-키 경로로 코드있는 항목과 동일하게 동작한다(사용자가 나중에 수동으로 코드를 지정하면 `rekeyToCode`로 이전).

## E그룹 — 파일 관리

- **드래그앤드롭(8번)**: Settings의 "라이브러리 추가" 다이얼로그에 드롭존 UI 추가. 기존 네이티브 폴더선택 버튼과 동일한 입력 경로(같은 IPC `libraries:add`)로 합류하는 추가 입력 수단일 뿐, 새로운 개념이 아니다.

## F그룹 — UX 폴리시

- **Explorer 탭 닫기(16번)**: `closeTab`은 이미 구현되어 있음(Zustand 스토어 + 우클릭 메뉴). 탭에 눈에 보이는 X 버튼 추가, `Ctrl+W` 및 탭 마우스 휠클릭(auxclick) 핸들러 추가.
- **Explorer 임의 경로 열기(17번)**: TabBar에 "폴더 열기" 버튼 추가 — Settings와 동일한 네이티브 폴더선택 IPC(`libraries:pick-folder`, 라이브러리 등록 없이 경로만 받는 용도로 재사용)로 임의 경로를 새 탭으로 연다. 이번에 고친 "라이브러리 없으면 + 버튼 비활성화"와 상호 보완적 — 라이브러리가 없어도 이 버튼으로는 아무 폴더나 열 수 있다.
- **단축키(12번)**: 중앙 키바인딩 훅(`useKeyboardShortcuts`) 신설. `Ctrl+F`는 C그룹과 함께 구현. 즐겨찾기/플레이 토글 단축키는 D/B그룹이 실제로 존재해야 연결 가능하므로 각 그룹 구현 시 등록.
- **진행률 표시(13번)**: A그룹에서 만든 인프라(위 참고)를 사용. 사이드바 하단 표시 + taskbar % 표시.

## 부수 수정 (이번 설계와 무관하게 즉시 반영)

- `electron/main/shell/buildExternalUrl.ts`: VJ 코드가 RJ와 다른 URL 패턴(`/pro/` vs `/maniax/`)을 사용함이 확인됨 — 즉시 수정. 동시에 이전 최종 리뷰에서 나온 `http://` → `https://` 권장사항도 반영.

## Definition of Done

- 선행작업 테이블(`game_metadata`, `game_user_data`)과 Repository가 실제 SQLite 기반 테스트로 검증됨.
- A~F그룹 각 항목이 이 문서에 정의된 범위 내에서 동작하며, 제외 항목(AI 파일명 정리, 세이브 자동탐지, LE 자동설치)은 스텁/미구현 상태로 명확히 남아있음.
- `GameEntry` → `ScannedEntry` 타입 변경이 Gallery/List/정렬/하이퍼링크 전반에 걸쳐 일관되게 반영되고 회귀 테스트가 존재함.
- `npm run lint`/`typecheck`/`test`/`format:check`/`build` 모두 통과.
