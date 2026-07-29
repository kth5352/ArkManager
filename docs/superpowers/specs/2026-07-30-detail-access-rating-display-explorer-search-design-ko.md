# 상세보기 진입점, 평점/플레이타임 노출, Explorer 검색 — 설계 (한글판)

## 배경

방금 master에 merge된 `game-management-expansion` 배치(6개 plan, 37개 태스크)의 최종 전체 브랜치 리뷰에서 개별 태스크 리뷰로는 안 보였던 3가지 문제가 발견됐다.

1. 평점/메모/플레이타임은 `game_user_data`에 저장은 되지만(이전 Plan 3/4), 자기 편집 다이얼로그(`RatingMemoDialog`) 밖에서는 어디에도 표시되지 않는다.
2. 실행(실행)/평점·메모/실행 설정은 Explorer의 `DetailOverlay`를 통해서만 열리고, `DetailOverlay`는 `FolderView.tsx`의 `if (entry.code)` 게이트가 있어야만 열린다 — Gallery/List/DetailList에는 아예 진입점이 없고, 코드없는(경로키) Explorer 항목도 백엔드가 이미 경로키를 완벽히 지원함에도 절대 열 수 없다.
3. Explorer에는 검색바가 없다 — 원래 설계 문서는 Gallery/List/DetailList와 함께 Explorer도 범위에 포함시켰었다.

이 설계에는 2번을 고치다가 발견된, 사용자가 새로 요청한 기능도 포함된다: 폴더명을 바꾸지 않고도 코드없는 항목에 DLsite 코드를 수동으로 연동해서, 경로키로 이미 쌓인 즐겨찾기/평점/메모/플레이타임을 보존하는 기능.

## 범위 밖 (이번 설계에서 명시적으로 제외)

- 코드없는 폴더의 재귀 스캔이 압축해제된 게임 폴더 내부 파일들을 각각 개별 카드로 노출시키는 문제 — 사용자가 아직 결정하지 않은 별도의 제품 방향 결정 사항.
- AI 기반 파일명 자동 정리(원래 18개 요청의 7번) — 사용자 본인이 이미 별도 논의로 미뤄둔 항목.
- 폴더명에 코드를 추가하는 "이름 변경"을 자동으로 감지/병합하는 기능 — 검토했지만 명시적으로 채택하지 않음(1c 참고). mtime/size 기반 휴리스틱이 필요한데 오탐(엉뚱한 게임끼리 데이터가 섞임) 위험이 있음. 데이터를 보존하고 싶으면 폴더명을 직접 바꾸는 대신 앱 안의 연동 기능(1c)을 쓰도록 안내한다.

## 섹션 1a: DetailOverlay 공유 진입점

`DetailOverlay`를 열고 닫는 로직(현재는 `FolderView.tsx`의 로컬 `selectedGame` state)을 작은 훅으로 뽑아낸다:

```ts
function useGameDetailOverlay(): {
  openDetail: (entry: ScannedEntry) => void
  DetailOverlayElement: () => JSX.Element
}
```

각 페이지(Gallery, List, DetailList, Explorer의 `FolderView`)가 이 훅을 각자 로컬로 호출한다 — 전역/Zustand 상태 필요 없음, 기존에 정한 "검색/필터 상태는 페이지별 독립"이라는 원칙과 일치. 각 페이지는 `<DetailOverlayElement />`를 한 번 렌더링하고, 카드/로우 클릭 핸들러에서 `openDetail(entry)`를 호출한다.

- `FolderView.tsx`의 `if (entry.code)` 게이트를 제거한다. `DetailOverlay` 내부의 실행/설정 버튼은 이미 `game.kind === 'folder'`로 걸러지고 있으므로 코드없는 폴더를 열어도 안전하다 — `resolveGameEntryKey`가 즐겨찾기/평점메모/실행설정/세이브경로 전부 경로키를 이미 완벽히 지원한다(기존 테스트로 확인됨).
- Gallery 카드 / List 로우 / DetailList 로우 클릭(현재는 기존 즐겨찾기 하트 버튼 외엔 아무 동작 없음, 하트는 `stopPropagation`으로 분리돼 있어 충돌 없음)이 이제 `openDetail(entry)`를 호출한다.

## 섹션 1b: 코드없는 항목도 평점/메모/실행 접근 가능

1a의 자연스러운 결과 — 별도 작업 불필요. `DetailOverlay`가 코드 유무와 무관하게 모든 항목에 대해 열리게 되면, 내부의 모든 버튼(실행/실행 설정/평점·메모)은 경로키 항목에 대해서도 이미 올바르게 동작한다(백엔드의 `resolveGameEntryKey`와 `game_user_data` repository 함수들이 코드/경로를 동일하게 처리하기 때문).

## 섹션 1c: 코드없는 항목에 코드 수동 연동

**문제**: `ScannedEntry.code`는 스캔할 때마다 파일명에서 새로 추출된다(`extractCode(name)`). 앱 안에서 코드를 연동해도, 파일명과 무관하게 "이 경로는 이 코드다"라고 영구히 기억할 방법이 없으면 다음 스캔에서 다시 사라진다.

**설계**:

- `game_user_data`/`game_metadata`와 같은 DB에 새 테이블 `path_code_overrides` 추가(`path TEXT PRIMARY KEY`, `code TEXT NOT NULL`, `created_at TEXT NOT NULL`).
- 스캐너(`electron/main/scanner/folderScanner.ts`의 `toScannedEntry`)는 `extractCode(name)`이 `null`을 반환하면 이 테이블을 폴백으로 조회한다: 경로에 대응하는 override 행이 있으면 그 코드로 `ScannedEntry.code`를 채운다.
- `DetailOverlay`에 "코드 연동" 버튼을 추가한다(`entry.code === null`일 때만 표시). 클릭하면 코드 입력란(기존 `src/pages/DlsiteSearch/parseCodeInput.ts`의 `parseCodeInput`을 그대로 재사용해서 RJ/VJ/ST 형식 검증)과 확인 버튼이 나타난다.
- 확인하면 새 IPC 핸들러(예: `gameUserData:link-code`)가 하나의 트랜잭션 안에서:
  1. `path_code_overrides`에 행을 삽입한다.
  2. `rekeyToCode(db, entry.path, code)`를 호출해 기존 경로키 `game_user_data` 행(즐겨찾기/평점/메모/플레이타임/세이브경로)을 코드키로 이관한다.
  3. **`rekeyToCode`의 알려진 잠재 버그를 고친다** (최종 리뷰에서 지적됐지만, 지금까지 호출하는 곳이 아예 없어서 실제로는 발현되지 않았던 버그): 현재는 대상 코드로 이미 존재하는 행이 있으면 `onConflictDoUpdate` 폴백이 `updatedAt`만 갱신하고 경로 행의 데이터를 조용히 버린다. 이번 기능이 `rekeyToCode`의 첫 실사용처가 되므로, 충돌 분기를 결정론적으로 병합하도록 바꾼다: 코드키 행의 값이 null/기본값이 아닌 모든 필드에서 우선한다(이미 DLsite 정식 식별자에 연결된 데이터이므로). 경로키 행의 값은 코드키 행에서 null/기본값(`isFavorite: false`, `rating: null`, `memo: null`, `launchConfig: null`, `totalPlaytimeMs: 0`, `lastPlayedAt: null`, `savePath: null`)인 필드만 채워넣는다. 어느 쪽 행이든 기본값이 아닌 값은 절대 조용히 사라지지 않는다.
- 연동에 성공하면 자동으로 `useCrawlGameMetadata`를 호출해서 새로 연동된 코드의 DLsite 메타데이터(제목/커버/장르)를 바로 가져온다.
- 다이얼로그에 명시적으로 안내한다: 폴더명을 직접 바꾸면 기존 즐겨찾기/평점 기록이 유지되지 않으니, 데이터를 유지하려면 이 기능을 쓰라고.

## 섹션 2: 평점/플레이타임 상시 노출

새 IPC나 스키마 변경 없음 — 각 페이지가 이미 `useGameUserData`로 가져오고 있는 데이터를 화면에 그리기만 한다.

- **Gallery 카드**: 기존 즐겨찾기 하트 아이콘 옆에 미니 별점 5칸(`rating`이 null이 아닐 때만 렌더). 클릭하면 카드 전체 클릭과 동일하게 상세가 열림(별도 인터랙션 없음).
- **List/DetailList 로우**: 기존 코드/장르/날짜 컬럼 뒤에 평점 컬럼 하나 추가 — 이미 있는 `genres.slice(0, 3)` "값이 있을 때만 렌더" 패턴과 동일한 방식.
- **RecentlyPlayed 로우**: 기존 마지막 플레이 날짜 옆에 누적 플레이타임 표시. 새 포맷 헬퍼(`formatPlaytime(ms): string` → "3시간 20분") 하나를 기존 `formatDate`/`formatSize` 헬퍼와 같은 자리에 추가.

## 섹션 3: Explorer 재귀 검색

- `FolderView`에 `<SearchHeader>`를 그대로 재사용(Gallery/List/DetailList와 동일한 Ctrl+F 확장 + 장르제외 칩 UI, `src/components/layout/SearchHeader.tsx`).
- 검색어가 비어있으면 지금과 완전히 동일하게 동작한다: `useFolderScan(path)`(얕은 스캔) + 평소의 브레드크럼 탐색.
- 검색어가 입력되는 순간, 새 훅 `useFolderScanRecursive(path, { enabled })`로 전환되며 기존 `window.api.scanner.scanRecursive([path])`를 그대로 호출한다(Gallery/List/DetailList가 라이브러리 전체를 스캔할 때 쓰는 것과 같은 IPC — 이 함수는 원래 임의의 경로 문자열을 받으므로, 등록된 라이브러리 루트가 아니라 임의의 한 폴더를 대상으로 재사용 가능).
- **재귀 검색의 루트는 "지금 보고 있는 폴더"**다(브레드크럼으로 이동한 현재 위치이지, 탭이 처음 열렸던 경로가 아님) — "여기서부터 아래로 찾기"라는 직관과 일치.
- 검색 결과는 `filterEntries`로 필터링한 뒤, 이름뿐 아니라 **검색 루트 기준 상대 경로**도 같이 표시한다(DetailList의 경로 컬럼과 비슷한 방식) — 여러 하위 폴더에 이름이 같은 항목이 있을 때 구분하기 위함.
- 검색 결과에 나타나는 항목은 "리프 항목"뿐이다(코드있는 파일/폴더, 코드없는 파일 — 코드없는 폴더 자체는 나타나지 않고, 그 안에서 발견된 항목만 나타남). Gallery/List/DetailList가 이미 쓰고 있는 `scanLibraryRecursive`의 "리프만 반환" 시맨틱과 동일 — 새로운 필터링 로직 불필요.
- 결과를 클릭하면 섹션 1a에서 만든 공유 `openDetail`이 열린다(폴더 탐색 아님).
- 검색어를 지우면 즉시 평소의 얕은 스캔 탐색 모드로 복귀한다.

## 구현 계획을 위한 테스트 메모

- `path_code_overrides`와 스캐너 폴백은 실제 SQLite를 쓰는 repository 테스트 + 파일명에 코드가 없어도 override 행이 있으면 `ScannedEntry.code`가 non-null이 되는 것을 증명하는 `folderScanner` 테스트가 필요하다.
- `rekeyToCode`의 충돌 병합 수정은 이미 즐겨찾기/평점/메모가 있는 코드키 행에 연동해도 데이터가 유실되지 않음을 증명하는 회귀 테스트가 필요하다.
- `gameUserData:link-code` IPC 핸들러는 전체 체인(override 행 생성 → `game_user_data` 이관 → 기존 즐겨찾기/평점 보존)을 검증하는 테스트가 필요하다.
- `useFolderScanRecursive`와 Explorer 검색 UI는 전용 컴포넌트 테스트가 불가능하다(이 저장소는 컴포넌트 테스트 인프라가 없음 — 앞선 6-plan 배치에서 이미 확인됨) — `SearchHeader` 자체의 기존 전례와 동일하게 코드 레벨 리뷰로만 검증한다.
- 이번 plan도 수동/CDP 실제 UI 검증은 생략한다 — 이 워크트리에서 확립된, 이 머신의 좌표 기반 클릭이 불안정하다는 정책에 따른다.
