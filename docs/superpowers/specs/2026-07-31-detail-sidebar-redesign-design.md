# 상세보기 팝업 → 사이드바 전환 — 설계

## 배경

현재 Gallery/List/DetailList/Explorer 4곳 모두 `useGameDetailOverlay` 훅을 통해 `DetailOverlay`(모달 `Dialog`)를 공유하고, 그 안에서 평점/메모(`RatingMemoDialog`), 실행 설정(`LaunchConfigDialog`), 코드 연동(`LinkCodeDialog`), 코드 해제(`UnlinkCodeDialog`)가 각각 별도 팝업으로 겹쳐서 뜬다. 사용자가 이 흐름을 팝업 스택 대신, 화면 오른쪽에 상시 대기하다가 필요할 때만 나타나는 사이드바 패널로 바꿔달라고 요청했다 — Gallery/List/DetailList 세 페이지에서만, Explorer는 지금 방식 그대로 유지한다.

## 범위

- Gallery, List, DetailList 세 페이지에서 상세보기를 오른쪽 사이드바 패널(`DetailSidebar`)로 전환한다.
- 평점, 메모, 실행 설정(+ 세이브 백업), 코드 연동/해제를 팝업 없이 사이드바 안에서 직접 조작할 수 있게 한다.
- 사이드바 너비를 사용자가 드래그로 조절할 수 있게 하고, 그 값을 앱 재시작 후에도 유지한다.

## 범위 밖

- **Explorer(`FolderView.tsx`)는 건드리지 않는다.** 지금처럼 `DetailOverlay` 팝업 + `useGameDetailOverlay` 그대로 유지 — 사용자가 명시적으로 Explorer는 제외해달라고 요청함.
- Favorites, RecentlyPlayed 페이지는 현재 상세보기 진입점이 아예 없고, 이번 작업 범위에도 포함하지 않는다.
- `DlsiteSearch` 페이지의 검색 결과 상세보기(현재 없음)도 범위 밖.
- 평점/메모/실행설정/코드연동의 백엔드 로직(`gameUserDataRepository`, IPC 핸들러) 자체는 변경하지 않는다 — 이미 코드/경로 양쪽 키를 지원하도록 되어 있으므로, 이번 작업은 순수하게 그 기능들을 어디서(팝업 vs 사이드바) 어떻게(즉시저장 vs 명시적저장) 노출하느냐만 바꾼다.

## 아키텍처 개요

`useGameDetailOverlay(entries)` 훅(현재 `src/hooks/useGameDetailOverlay.tsx`)의 반환 형태를 그대로 유지한 채, Gallery/List/DetailList 세 페이지는 새 훅 `useGameDetailSidebar(entries)`로 갈아탄다. Explorer는 기존 훅을 그대로 계속 쓴다. 두 훅은 "선택된 경로를 상태로 들고, `entries`에서 매 렌더마다 최신 엔트리를 다시 찾는다"는 핵심 로직(이번 세션에서 이미 구현된 부작용 있는 오버레이 갱신 버그 수정 로직)을 공유하므로, 그 부분은 `useSelectedGameEntry(entries)`라는 내부 공용 훅으로 뽑아 양쪽이 재사용한다.

```
useSelectedGameEntry(entries)         // 공용: selectedPath 상태 + 라이브 엔트리 재계산
  ├─ useGameDetailOverlay(entries)    // Explorer 전용 — DetailOverlay(Dialog) 반환
  └─ useGameDetailSidebar(entries)    // Gallery/List/DetailList 전용 — DetailSidebar 반환
```

`DetailSidebar`는 새 컴포넌트(`src/components/game/DetailSidebar.tsx`)로, `RatingMemoDialog`/`LaunchConfigDialog`/`LinkCodeDialog`/`UnlinkCodeDialog`의 로직을 흡수한 하위 섹션 컴포넌트들을 내부에 둔다:

```
DetailSidebar
  ├─ DetailSidebarHeader     (썸네일, 제목, 코드, 실행/DLsite/폴더 버튼, 닫기 버튼)
  ├─ RatingMemoSection       (RatingMemoDialog 대체 — 항상 펼침)
  ├─ LaunchConfigSection     (LaunchConfigDialog 대체 — 접이식)
  └─ CodeLinkSection         (LinkCodeDialog + UnlinkCodeDialog 대체 — 접이식)
```

기존 4개 다이얼로그 파일(`RatingMemoDialog.tsx`, `LaunchConfigDialog.tsx`, `LinkCodeDialog.tsx`, `UnlinkCodeDialog.tsx`)은 삭제하지 않는다 — Explorer의 `DetailOverlay`가 계속 이 4개를 팝업으로 사용하기 때문. 대신 각 섹션 컴포넌트는 이 다이얼로그들과 같은 mutation 훅(`useSetRatingAndMemo`, `useSetLaunchConfig` 등)을 재사용하되, `Dialog`/`DialogContent` 래퍼 없이 인라인 마크업으로 새로 작성한다.

## 섹션 1: 레이아웃 & 인터랙션

- **밀어내기 레이아웃**: 사이드바가 열리면 그리드/리스트 영역의 컨테이너 너비가 줄어들고, 그 안의 `AutoSizer`(Gallery는 열 개수, List/DetailList는 `react-window`의 `rowWidth`)가 좁아진 폭을 그대로 반영해 자연스럽게 재배치된다. 별도의 열 개수 계산 로직 변경은 필요 없다 — `AutoSizer`가 이미 컨테이너 크기 변화에 반응하는 구조이기 때문.
- **열기**: 카드/로우 클릭 → `openDetail(entry)` (기존과 동일한 시그니처).
- **전환**: 사이드바가 열려있는 상태에서 다른 카드/로우를 클릭하면 사이드바는 유지된 채 내용만 즉시 바뀐다 (마스터-디테일 패턴).
- **닫기**: 사이드바 헤더의 "✕" 버튼, `Esc` 키(사이드바가 열려있고 텍스트 입력 중이 아닐 때), 또는 이미 선택된 카드를 다시 클릭(토글).
- **너비 조절**: 사이드바 왼쪽 경계에 드래그 가능한 리사이즈 핸들. 최소 280px, 최대 520px로 clamp해서 그리드 영역이 완전히 사라지는 극단적인 경우를 막는다. 기본값(첫 실행, 저장된 값 없음)은 320px.

## 섹션 2: 콘텐츠 구성

시각 자료로 비교해서 확정한 구조 — 자주 쓰는 조작은 항상 펼쳐져 있고, 덜 쓰는 설정은 접힌 채로 시작:

**항상 펼침**
1. 썸네일 (`GameThumbnail` 그대로 재사용)
2. 제목, 작품번호(있으면 클릭 시 DLsite 열기) 또는 "코드없음"
3. 액션 버튼 줄: DLsite 열기(코드 있을 때만) / 폴더 열기 / 실행(폴더일 때만, 이번 세션에 이미 적용된 규칙 그대로)
4. **평점**: 별 5개, 클릭 즉시 저장 (아래 섹션 4)
5. **메모**: `textarea`, 포커스 아웃 시 자동 저장 (아래 섹션 4)

**접이식 (기본 접힘, 클릭으로 펼침/접힘 토글)**
6. **실행 설정**: 실행파일 선택(라디오 목록) + 실행 방식(일반/로케일 에뮬레이터) + 저장 버튼, 그 아래 세이브 백업 폴더 지정/즉시 백업 — `LaunchConfigDialog`의 필드 구성을 그대로 유지
7. **코드 연동 관리**: `entry.code`가 없으면 코드 입력 + "다음" → 확인 문구 + "연동 확정" (기존 `LinkCodeDialog`의 2단계 확인 유지 — 오타 방지 목적이 여전히 유효하므로), `entry.codeSource === 'override'`면 "연동 해제" 버튼 + 인라인 확인 문구 + "연동 해제" 확정 버튼 (기존 `UnlinkCodeDialog`의 확인 문구 그대로)

각 접이식 섹션은 사이드바가 다른 항목으로 전환되면 접힌 상태로 리셋된다(펼침 상태를 유지할 이유가 없음 - 매번 다른 항목이므로).

## 섹션 3: 데이터 동작

| 조작 | 현재(팝업) | 사이드바 |
|---|---|---|
| 평점 | 별 클릭은 로컬 상태만 바꾸고, "저장" 버튼을 눌러야 커밋 | 별 클릭 즉시 `useSetRatingAndMemo` 호출 (기존 즐겨찾기 하트와 동일한 즉시-저장 패턴) |
| 메모 | "저장" 버튼으로 평점과 함께 커밋 | `textarea`의 `onBlur`에서 자동 저장 (타이핑 중 매 키 입력마다 저장하지 않음 — IPC 낭비 방지) |
| 실행 설정 | "실행 설정 저장" 버튼 | 동일 — 설정 변경은 즉발성이 낮은 조작이라 명시적 저장 유지 |
| 세이브 백업 | 버튼 2개(폴더 지정/즉시 백업) | 동일 |
| 코드 연동 | 2단계 확인 + 팝업 닫힘 | 2단계 확인은 유지하되 팝업이 아니라 섹션 내부에서 상태 전환 (섹션은 안 접힘) |
| 코드 해제 | 확인 팝업 + 팝업 닫힘 | 확인 UI가 섹션 내부에 인라인으로 나타남 |

메모의 저장 타이밍이 바뀌므로(“저장” 버튼 → blur 시 자동 저장), 메모 `textarea` 바로 아래에 저장 상태 텍스트를 둔다: mutation이 진행 중이면 "저장 중...", 성공하면 "저장됨"이 나타났다가 2초 뒤 사라짐(`setTimeout` + 로컬 state). 사용자가 명시적 저장 버튼 없이도 반영됐는지 알 수 있어야 하기 때문.

## 섹션 4: 너비 영속화

사이드바 너비는 Gallery/List/DetailList 세 페이지가 공유하는 값 하나다(페이지별로 다르게 두지 않음). 기존 테마 저장 방식(`app_settings` 키-값 테이블, `SETTINGS_GET`/`SETTINGS_SET` IPC)을 그대로 재사용한다:

- `shared/types/ipc.ts`의 `SettingKeySchema`를 `z.enum(['theme', 'sidebar-width'])`로 확장.
- `SetSettingRequestSchema`의 `value` 필드를 `ThemeSchema` 전용에서 `z.string()`으로 일반화(테마 쓰기 경로는 기존과 동일하게 계속 동작 - `'light'`/`'dark'`도 문자열이므로).
- 렌더러 쪽에서 너비는 숫자를 문자열로 저장/파싱한다 (`String(width)` / `Number(value)`).
- `useSidebarWidth()` 훅(새로 추가, `src/services/settingsService.ts` 또는 별도 파일)이 `useQuery`/`useMutation`으로 감싸 기존 `useThemeQuery`/`useSetThemeMutation`과 동일한 패턴을 따른다.

드래그 중에는 로컬 state만 갱신하고(리렌더 성능), 드래그가 끝나는 시점(`pointerup`)에만 저장 mutation을 호출한다.

## 섹션 5: 세 페이지 통합 방식

`GalleryPage.tsx`, `ListPage.tsx`, `DetailListPage.tsx`는 각자:

```diff
- const { openDetail, detailOverlayElement } = useGameDetailOverlay(games ?? [])
+ const { openDetail, detailSidebarElement } = useGameDetailSidebar(games ?? [])
```

로 바꾸고, 렌더 트리 최상단을 `flex` 컨테이너로 감싸 그리드/리스트 영역과 `{detailSidebarElement}`를 나란히 배치한다(그리드 영역에 `min-w-0 flex-1`을 줘서 사이드바가 열렸을 때 자연스럽게 줄어들게 함). `AutoSizer`가 컨테이너 크기 변화를 감지하는 기존 구조를 그대로 활용하므로 열 개수 재계산 로직은 그대로 둔다.

## 섹션 6: 테스트 전략

이 프로젝트는 React 컴포넌트/훅에 대한 테스트 인프라가 없다(기존 관례 - `LinkCodeDialog` 등도 컴포넌트 테스트 없음, 순수 로직 함수만 `.test.ts`로 테스트). 이번 작업도 동일한 관례를 따른다:

- `useSelectedGameEntry`의 라이브 재계산 로직은 이미 이번 세션에 리뷰를 통과한 로직을 그대로 재사용하므로 추가 테스트 불필요.
- 사이드바 너비 저장/파싱처럼 순수 로직이 분리 가능한 부분(예: 너비 clamp 함수)이 있다면 `.test.ts`로 테스트한다.
- 최종적으로 `npm run dev`로 실제 앱을 띄워 수동으로 확인한다(리사이즈, 카드 전환, 평점/메모 즉시저장, 접이식 섹션 펼침/접힘, Explorer는 영향 없는지).
