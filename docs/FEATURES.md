# Ark Manager — 기능 명세서 (작업 참고용)

> 작성 기준: v1.2.3 (`master`, 707 커밋). 소스 코드·커밋 이력·README·`ARCHITECTURE.md`를 직접 읽고 정리했습니다.
> 설계 판단과 이유는 [ARCHITECTURE.md](../ARCHITECTURE.md)를 참고하세요.
> 목적: 이후 기능 추가·수정 작업 시 "이 앱이 지금 무엇을 어떻게 하는지"를 빠르게 파악하기 위한 문서입니다.
> `ARCHITECTURE.md`는 설계 판단과 이유 중심, 이 문서는 **기능 동작과 규칙, 파일 위치** 중심입니다.
> 표기: `[확인]` = 코드에서 직접 확인한 내용, `[추정]` = 커밋 메시지/구조로 추정한 내용(수정 전 재확인 필요).

---

## 1. 한 줄 요약

PC에 흩어진 동인 소프트웨어(DLsite·Steam·VNDB·Getchu 게임, ASMR/음성/음악/영상 파일 등)를 **폴더 단위 라이브러리로 등록**하면, 파일/폴더 이름에서 **식별 코드**(RJ01234567 등)를 인식해 외부 사이트 메타데이터(표지·제목·제작사·발매일·태그)를 붙여 보여 주고, 실행·플레이타임·세이브 백업·파일 정리·미디어 재생까지 한 곳에서 처리하는 **Windows 전용 Electron 데스크톱 앱**.

- 앱 이름: **Ark Manager** (초기 이름 DLibrary → 2026-07-31 리브랜드). `package.json`의 `description`에는 아직 "DLsite game library manager"가 남아 있음.
- 설치: NSIS 설치 프로그램(경로 지정 가능, `oneClick: false`), GitHub Releases 기반 자동 업데이트 (`kth5352/ArkManager`).
- 언어: UI는 한국어(원본)/일본어/영어. 문서·주석·커밋 메시지는 대부분 한국어+영어 혼용.
- 사용자 데이터 위치: Electron `userData` (`%APPDATA%/Ark Manager` 계열, 과거 `%APPDATA%/dlibrary`에서 자동 이전됨). DB 파일명 `ark-manager.db`.

---

## 2. 핵심 개념 (용어집)

| 용어 | 의미 |
| --- | --- |
| **라이브러리(Library)** | 사용자가 등록한 루트 폴더. 스캔·파일 조작의 신뢰 경계. 이름은 선택(미입력 시 폴더명 자동). 경로는 중복 불가. |
| **항목(Entry, `ScannedEntry`)** | 스캔 결과 한 건. 파일 또는 폴더. `name, path, kind('file'|'folder'), mtimeMs, size, code, codeSource` |
| **식별 코드(Code)** | 파일/폴더명에서 정규식으로 뽑은 `RJ|VJ|ST|VNV|VNR|GC` + 숫자. 항목의 "작품 정체성". |
| **codeSource** | `'filename'`(이름에서 인식) / `'override'`(사용자가 "코드 연동"으로 수동 연결). override만 "연동 해제" 가능. |
| **항목 키(Entry key)** | 사용자 데이터를 저장하는 키. 코드가 있으면 `code.value`(keyType `code`), 없으면 `normalizeLibraryPath(path)`(keyType `path`). `resolveGameEntryKey()` 한 곳에서 결정. |
| **메타데이터** | 외부 사이트에서 크롤링해 `game_metadata`에 캐시한 제목/제작사/발매일/장르/표지/작품유형. 코드 단위. |
| **사용자 데이터** | 즐겨찾기·클리어·평점·메모·실행 설정·플레이타임·세이브 경로·커스텀 표지. 항목 키 단위(`game_user_data`). |
| **작업 유형(workType)** | DLsite `work_type` 원문(`SOU`=음성/ASMR, `MOV`=동영상, `MUS`=음악, `RPG` 등). SOU/MOV/MUS 폴더는 "실행" 대신 "재생"으로 연결. |
| **스냅샷(Snapshot)** | 세이브 폴더를 통째로 복사해 둔 백업 한 버전. 폴더명 = ISO 타임스탬프(`:`/`.` → `-`). |

### 2.1 식별 코드 규칙 [확인]

- 정규식: `/(?<![A-Za-z0-9])((?:RJ|VJ|ST|VNV|VNR|GC)\d+)(?![0-9])/i` (`electron/main/scanner/codeRecognition.ts`)
  - `\b` 대신 lookaround를 쓰는 이유: `RJ01234567_작품명`처럼 밑줄로 코드와 제목이 붙는 DLsite 관례를 인식하기 위해. `COST1234`처럼 문자에 붙은 건 거부.
  - 대소문자 무관, 결과는 대문자로 정규화 (`parseCanonicalGameCode`, `shared/gameCode.ts`).
- 코드 종류와 출처:

| 접두사 | 출처 | 외부 링크 / 비고 |
| --- | --- | --- |
| `RJ` | DLsite (maniax: 일반·성인 동인) | `https://www.dlsite.com/maniax/work/=/product_id/RJxxxx.html` |
| `VJ` | DLsite (pro: 상업) | `https://www.dlsite.com/pro/work/=/product_id/VJxxxx.html` |
| `ST` | Steam | 숫자 = Steam appid |
| `VNV` | VNDB **Visual Novel** (`v123`) | 반드시 `VNV` 접두사 명시 |
| `VNR` | VNDB **Release** (`r123`) | VN과 Release는 ID 공간이 달라 숫자가 같아도 다른 작품 → 접두사 분리 |
| `GC` | getchu.com | `https://www.getchu.com/item/{id}/` |

- 과거 `VN`/`VR` 접두사는 `VNV`/`VNR`로 DB 오픈 시 자동 마이그레이션(`migrateVndbCodePrefixes.ts`, 세이브 폴더는 `migrateVndbSaveDirectories.ts`). 이제 파일명에서는 **`VNV`/`VNR`만 인식**.
- 이름에 코드가 없으면 `path_code_overrides`(수동 연동) 조회 → 그래도 없으면 `code: null`.

---

## 3. 화면(라우트) 구성 [확인]

해시 라우터(`createHashHistory`). 사이드바는 3그룹.

| 그룹 | 메뉴 | 라우트 | 파일 |
| --- | --- | --- | --- |
| 라이브러리 | 갤러리 | `/` | `src/pages/Gallery/GalleryPage.tsx` |
| | 리스트 | `/list` | `src/pages/List/ListPage.tsx` |
| | 상세 리스트 | `/detail-list` | `src/pages/DetailList/DetailListPage.tsx` |
| | 탐색기 | `/explorer` | `src/pages/Explorer/*` |
| | 게임 검색 | `/game-search` | `src/pages/GameSearch/GameSearchPage.tsx` |
| 활동 | 즐겨찾기 | `/favorites` | `src/pages/Favorites/FavoritesPage.tsx` |
| | 최근 플레이 | `/recently-played` | `src/pages/RecentlyPlayed/RecentlyPlayedPage.tsx` |
| | 세이브 | `/saves` | `src/pages/Saves/SavesPage.tsx` |
| 미디어 | 미디어 | `/media` | `src/pages/Media/MediaPage.tsx` |
| (하단) | 설정 | `/settings` | `src/pages/Settings/SettingsPage.tsx` |
| (숨김) | 상세 | `/detail` | `DetailPage.tsx` (빈 상태 페이지, 현재 상세는 사이드바로 대체) |

별도 창(같은 렌더러 번들, 해시 라우트): 플레이어 창 `#/player-window`(`PlayerWindowPage`), 자막 PIP `#/subtitle-pip`(`SubtitlePipPage`).

---

## 4. 라이브러리 관리와 스캔

### 4.1 라이브러리 등록 (설정 > 라이브러리)

- 폴더 선택 대화상자, **드래그 앤 드롭**, 직접 경로 입력(경로 존재 검증, 중복 경로 에러). 이름 생략 시 폴더명.
- 삭제 시 확인 다이얼로그. 등록 해제해도 디스크 파일은 건드리지 않음.
- **라이브러리별 표시 토글**(체크박스 팝업): 숨긴 라이브러리의 항목은 갤러리/리스트/즐겨찾기 등에서 제외 (`libraryVisibilityStore`).
- 한 개뿐인 라이브러리가 오프라인(드라이브 분리)이어도 여러 개일 때와 동일하게 실패를 허용 (`allowPartial`).
- 경로 비교는 항상 `normalizeLibraryPath` = **소문자 + 끝 슬래시 제거**.

### 4.2 두 종류의 스캐너 (`electron/main/scanner/folderScanner.ts`)

1. **얕은 스캔 `scanFolderShallow`** — Explorer용. 폴더의 직계 자식을 전부(이미지 포함) 나열. 진짜 파일 탐색기와 동일.
2. **재귀 스캔 `scanLibraryRecursive`** — Gallery/List/DetailList용. 라이브러리 트리를 걸으며 "작품 단위"를 추려냄.

#### 재귀 스캔 규칙 (핵심 휴리스틱) [확인]

- **이미지 파일(jpg/jpeg/png/gif/bmp/webp)은 작품 인식에서 완전 제외** — stat도 호출 안 함. (표지/CG는 이름 규약이 없어서.)
- 코드가 있는 항목(파일·폴더) = **리프**. 더 안으로 들어가지 않음.
- 코드 없는 **파일**은 항목으로 노출(`code: null`)하되, 그 부모 폴더가 "다중 작품 컨테이너"일 때만 (아래 판정).
- 코드 없는 **폴더** 처리: 자식을 읽어 분류 후
  - `hasDirectFile && !hasSingletonCodedChild && !hasMultipleArchiveFiles` → 이 폴더 자체를 **하나의 작품(리프)**으로 취급 (게임 내부 파일이 낱개로 노출되는 것을 막음)
  - 그 외 → 안으로 재귀 (서클/카테고리 폴더로 간주)
  - `hasSingletonCodedChild`: 같은 코드가 정확히 1번 나오는 자식이 있음 (= 개별 작품이 들어 있는 래퍼)
  - 같은 코드가 2번 이상 나오는 자식들(예: 같은 RJ코드가 붙은 수십 개 음성 파일)은 "한 작품의 에셋" 신호로 보고 폴더를 리프로 접음
  - `hasMultipleArchiveFiles`: 압축 파일이 직접 2개 이상 → 시리즈/다중 작품 폴더로 보고 접지 않음
- 심볼릭 링크/정션은 걷지 않음 (순환 방지, `lstat`).
- 읽기 실패한 하위 폴더/stat 실패 항목은 건너뜀(스캔 전체는 실패시키지 않음).
- 성능: 프로세스 전역 `stat` 동시성 제한 32, `stat` 타임아웃 15초, 폴더당 1회만 readdir.
- 진행률: 25개 항목마다 `scanner:scan-progress` push + 최종 1회.
- 압축 파일 확장자(`isArchiveFile`): `.zip .7z .rar .egg .tar .gz .bz2 .xz .lzh .cab .iso`
- 미디어 확장자(`isMediaFile`): 영상 `.mp4 .webm .mkv .avi .mov .wmv .flv .m4v`, 음성 `.mp3 .wav .flac .aac .ogg .m4a .wma`

### 4.3 썸네일 (표지 이미지) 우선순위

1. 사용자 지정 커스텀 표지 (`game_user_data.custom_cover_path`)
2. 크롤링한 DLsite/Steam/… 표지 (코드 있는 경우, `cache/covers/*.webp`)
3. 폴더 내 로컬 이미지 (`findThumbnailPath`): 이름이 `cover`·`folder`·`thumbnail`로 시작하는 이미지 우선 → 없으면 이름순 첫 이미지
- 폴더 썸네일은 커스텀 프로토콜 **`thumb://thumbnail/<encodeURIComponent(path)>`**로 서빙 (IPC+base64 제거로 성능 개선). 라이브러리 경계 밖 경로는 404.
- 코드가 연결된 항목은 "크롤 표지 → 없으면 로컬 이미지" 순서 (표지 로딩 전 로컬 이미지가 번쩍이지 않도록 대기).

---

## 5. 메타데이터 수집

### 5.1 소스별 전략 (`electron/main/metadata/crawlGameMetadata.ts`)

| 코드 | 방식 |
| --- | --- |
| `ST` | Steam 스토어 페이지 HTML 파싱(cheerio). 연령 확인 쿠키(birthtime 등)를 미리 실어 성인 인터스티셜 우회(일부 "성인 전용" 티어는 불가). |
| `VNV` | VNDB Kana API `POST https://api.vndb.org/kana/vn` — 제목, 개발사 첫 번째, 발매일, 이미지, 태그(스포일러 0, rating 내림차순 상위 10개)를 장르로 사용 |
| `VNR` | VNDB Kana API `/kana/release` — 제목(없으면 VN 제목), 개발사(producer.developer 우선), 표지는 연결된 VN 이미지, 장르 없음 |
| `GC` | getchu.com 작품 페이지 (`?gc=gc`로 연령 게이트 우회), 응답을 `TextDecoder('euc-jp')`로 디코딩 |
| `RJ/VJ` | **폴백 체인**: ① `dlsite-html`(작품 페이지 파싱: `#work_name`, `#work_maker`, 販売日, ジャンル, 作品形式) → ② `dlsite-json`(내부 JSON 엔드포인트) → ③ `external`(사용자 설정 외부 API, 활성화 시) |

- 모든 네트워크 호출 타임아웃 15초, UA는 브라우저 위장 + `ArkManager/1.0`.
- 결과 구조 `CrawledGameMetadata`: `{title, circle, releaseDate('YYYY-MM-DD'|''), genres[], coverImageUrl, workType}`.
- **실패 추적**: 모든 시도 소스(`attemptedSources`)와 사유(`not_found | blocked | network | parse | provider_error`)를 `metadata_failures`에 기록. 실패한 코드는 앱을 다시 켜도 **자동 재시도하지 않음**(1.2.1). 수동 새로고침/전체 새로고침만 재시도.
- **표지 캐시**: `cache/covers/<safe(code)>.webp` (sharp로 webp 변환). 이미지 요청에 `Referer: <origin>/` 헤더를 붙임(핫링크 403 우회).
- `keyToSafeDirName(key)`: 영숫자/`_`/`-`만이면 그대로, 아니면 SHA-256 hex. (표지·세이브 폴더·미디어 썸네일 파일명에 공통 사용)

### 5.2 외부 메타데이터 프로바이더 (설정 > 실행·메타데이터)

- 설정 키: `external-metadata-provider-enabled`, `-url`, `-api-key`(Bearer).
- HTTPS 필수(로컬 loopback 개발 주소 제외), 응답은 Zod 스키마 검증 후에만 사용. RJ/VJ 폴백 체인의 마지막 단계에서만 호출.

### 5.3 크롤 트리거

| 트리거 | 동작 |
| --- | --- |
| 라이브러리 탐색 중 자동(`useBulkCrawlMissingMetadata`) | 캐시/실패 기록이 **없는** 코드만 `metadata:crawl-missing`으로 큐잉. **1초 간격 순차 처리**(서버 부하 방지). 진행률 배너(`BulkCrawlProgressBanner`) 표시. |
| 상세 사이드바 "메타데이터 새로고침" | 단건 `metadata:crawl-and-save` (실패 기록 지우고 재시도) |
| 메뉴 `File > Refresh All Metadata` | `game_metadata`에 이미 있는 **모든 코드**를 강제 재크롤(확인 다이얼로그 + 진행률). `forceEnqueue` |
| 게임 검색 결과 선택 | 해당 코드 단건 크롤 후 상세 표시 |

### 5.4 통합 검색 (`/game-search`)

- 소스 선택: **DLsite / Steam / VNDB / Getchu / 전체(All)**. 채널은 `metadata:search` 하나로 통합(`{source, query}`).
- 제목으로도, 식별 코드로도 검색 (`parseCodeInput`). 결과 선택 → 메타데이터 크롤 → 상세 → "결과로 돌아가기" 링크(데이터 있는 탭으로 복귀).
- Getchu 검색어는 **EUC-JP로 인코딩**해 전송. Steam은 공개 `storesearch` 엔드포인트(app 타입만). VNDB는 관련도/평점 기준 상위 10.
- 크롤된 제작사 이름을 클릭하면 그 이름으로 검색(상세 사이드바/리스트/상세리스트).

---

## 6. 라이브러리 뷰 (Gallery / List / DetailList)

공통 사항 (`useVisibleGames`가 공유 파생 데이터를 만듦):

- **데이터**: 등록·표시 중인 라이브러리 전체 재귀 스캔 결과에서 `excluded_entries`(제외 목록) 경로를 뺀 목록. 스캔 결과는 TanStack Query로 **5분 staleTime** 캐시(포커스 복귀마다 재스캔 방지).
- **검색**: 헤더 검색창(Ctrl+F로 포커스, 아이콘 클릭으로 열기). 검색 대상 = 파일명, 코드, 크롤 제목, 크롤 제작사 (부분 일치, 소문자).
- **장르 필터**: 태그 클릭 = **포함 필터**(다중 선택은 AND). 필터 컴포저로 제외 장르도 지정 가능(제외는 메타데이터가 있는 항목에만 적용).
- **파일 종류 필터**: 전체 / 압축파일만 / 압축파일 제외 (`FileKindFilterToggle`).
- **중복 표시**: 같은 `코드:kind:세부종류(folder|archive|file)` 그룹에 2개 이상이면 중복 배지. "중복만 보기" 토글. 같은 코드의 압축파일 + 폴더가 함께 있으면 "압축 해제됨" 표시(`getExtractedArchiveCodes`).
- **정렬**: 이름 / 수정일 / 확장자, 오름·내림. 페이지별로 `sort_preferences`에 영속.
- **선택 모드**: 체크박스는 기본 숨김, **롱프레스 또는 토글**로 활성화. 선택 툴바: 전체 선택, 이동, 이름변경(일괄), 삭제, 취소. 우클릭 시에는 롱프레스 타이머가 시작되지 않음.
- **카드/행 표시**: 즐겨찾기 하트, 평점 별, 장르 배지, 중복 배지, 서클/제작사, 누적 플레이타임(최근 플레이 탭), 클리어 표시.
- **상세 사이드바**(§7)는 카드/행 클릭 시 오른쪽에 열림 (과거 팝업 `DetailOverlay`는 Explorer 일부에서만 남음).
- **키보드**: 카드에 마우스를 올린 채 `F` = 즐겨찾기 토글 (`useFavoriteShortcut`, 입력창 포커스 중엔 무시). `Ctrl+Enter` = 실행(폴더만).

### 6.1 Gallery 전용
- 가상 스크롤 그리드(react-window). **Ctrl+휠로 카드 크기 줌**(0.6~1.8, 0.05 단위), 툴바에 줌 슬라이더. 열 수 변화에도 스크롤 위치 보존. 카드는 행 너비에 균등 분배, 장르 배지 폭은 카드 실제 폭 기준.
- 제목은 2줄까지 줄바꿈.

### 6.2 List / DetailList
- List: 가상 스크롤 행, 제목 2줄 줄바꿈, 장르 배지.
- DetailList: **표 형태**(컬럼 크기 조절, 헤더/본문 스크롤 동기화, 호버 툴팁), 파일 크기·수정일·서클·평점 등 다열.

### 6.3 우클릭 컨텍스트 메뉴 (`GameEntryContextMenu`)
실행/재생, 웹에서 열기(작품 페이지), 폴더 열기(OS 탐색기), 즐겨찾기, 클리어 표시, 평점·메모, 코드 연동, 메타데이터 새로고침, RJ 번호 복사/제목 복사, 새 탭에서 열기(Explorer), 재생목록에 추가/다음에 재생/저장된 재생목록에 추가(미디어 항목), 이름변경, 이동, 삭제, **보기에서 제외**.

### 6.4 제외 목록 (Excluded Entries)
- "보기에서 제외"로 **특정 경로만** 숨김 (코드가 아니라 **경로 기준** — 같은 코드의 다른 복사본은 영향 없음).
- 관리: 메뉴 `View > Manage Excluded Items`에서 복원.

---

## 7. 상세 사이드바 (`DetailSidebar`, `src/components/game/`)

리사이즈 가능(너비 `sidebar-width` 설정으로 영속), 열릴 때 애니메이션, 스크롤해도 헤더 고정.

- 헤더: 표지(**클릭하면 커스텀 표지 변경**), 제목(크롤 제목 우선), 코드, 서클, 발매일, 장르 배지(클릭 = 필터), 누적 플레이타임, 닫기.
- 액션: **실행**(초록 버튼) / ASMR·음성·음악·영상 폴더는 **재생**, 폴더 열기, 웹에서 열기, 메타데이터 새로고침(아이콘), 클리어 토글, 이름변경, 이동, 삭제.
- 항상 펼쳐진 **평점(1~5) / 메모** 섹션 (초기 데이터 로딩 전에는 덮어쓰기 방지로 입력 보호).
- 접고 펼치는 섹션: **실행 설정**, **코드 연동/해제**, **세이브 데이터**, **커스텀 표지**.
- 코드 없는 항목은 "코드 없음" 표시 + 연동 UI.

### 7.1 코드 연동 (Code Link)
- 코드 없는 항목에 `RJ…` 등 코드를 수동 지정 → `path_code_overrides(path→code)` 저장. 재스캔해도 유지됨. 이때 기존 **path 키 사용자 데이터가 code 키로 병합 이전**(`rekeyToCode`): 즐겨찾기·클리어는 OR, 평점·메모·실행설정·세이브경로·커스텀표지는 **기존 code 행 값 우선, 없으면 path 행 값**, 플레이타임은 code 행이 0이 아니면 code 행 우선.
- "연동 해제"는 `codeSource === 'override'`일 때만 가능 (파일명 코드는 해제 대상 아님). 오타 복구 안내 문구 존재.
- 확인 버튼은 코드 파싱 성공 시에만 활성화, 실패는 에러 표면화.

### 7.2 커스텀 표지
- 소스: 파일 선택(picker 결과만 허용 — 렌더러가 임의 경로를 읽을 수 없도록 검증), **클립보드 이미지**, 해제.
- 저장: 앱 캐시에 webp로 저장. 코드가 연결된 작품도 변경 가능(1.2.0). 코드 없는 항목은 경로 키로 저장.

---

## 8. 실행 · 플레이타임

- **실행 설정** (`game_user_data.launch_config` JSON): `{ executablePath, launchMode: 'normal' | 'locale-emulator' }`.
  - 실행 파일 후보는 폴더 내 `.exe` 목록 (`launch:list-executables`)에서 선택.
  - **Locale Emulator**: `LEProc.exe`를 `ProgramFiles`, `ProgramFiles(x86)`, `%LOCALAPPDATA%\Programs` 아래 깊이 4까지 탐색해 자동 감지. 수동 경로 지정 가능(`locale-emulator-path`). 번들/중첩 설치도 탐색. 미설치 시 에러.
  - 실행: `spawn(command, args)` → 프로세스 `exit` 시점에 `sessionMs` 기록.
- 설정이 없는 게임을 실행하면 **실행 설정 창이 자동으로 뜨고**, 저장하면 닫히고 토스트 + 조건부 자동 실행. 실패 시 중앙 모달로 설정 UI.
- **플레이타임**: 세션 종료 시 `total_playtime_ms` 누적 + `last_played_at` 갱신 (`recordPlaySession`). 실행 중인 세션은 `activeSessions`에 보관되어 **앱 종료 시 그 시점까지의 시간을 기록**(`before-quit`). 단 앱을 먼저 끄면 게임 프로세스도 같이 종료될 수 있음(README 주의사항).
- **보안**: 저장 시와 **실행 시점 두 번** 모두 `executablePath`가 등록 라이브러리 아래인지 재검증. 라이브러리 밖이면 "실행 설정 없음"으로 취급.
- **최근 플레이**(`/recently-played`): `last_played_at` 기준 상위 50, 누적 플레이타임 표시, 클릭 시 갤러리 상세로 이동(`pendingGalleryOpenStore`).
- **즐겨찾기**(`/favorites`): 숨긴 라이브러리 항목은 제외, 코드당 카드 1개, 코드 없는 항목 포함(경로 정규화 후 갤러리로 딥링크).
- **클리어 토글**: 항목별 `is_cleared`.

---

## 9. 세이브 백업 (버전별 스냅샷)

- 사용자가 게임별로 **세이브 폴더를 직접 지정**(폴더 선택 대화상자; 선택된 경로와 일치하는 값만 저장 허용 — `SAVE_SET_PATH`는 마지막으로 picker가 반환한 경로 외엔 거부). 선택 창은 게임 폴더 위치에서 시작.
- **스냅샷 생성**: 세이브 폴더를 `userData/saves/<keyToSafeDirName(항목키)>/<timestamp>/`로 재귀 복사. 생성 시 **게임 버전 자동 감지**(§9.1)해 라벨로 저장.
- **복원** (`restoreSnapshot`): 안전 스왑 방식 — ① 스냅샷을 `<target>.ark-manager-restoring`로 복사 ② 기존 세이브를 `<target>.ark-manager-previous`로 이동 ③ restoring → target로 rename ④ 성공 시 previous 삭제. 중간 실패 시 원복 시도, 이중 실패 시 수동 복구 경로를 메시지에 명시. 이전 복원이 덜 끝난 흔적(`previous` 존재)이 있으면 새 복원을 거부.
- **diff 미리보기** (`diffSaveFolders`): 저장/복원 모두 같은 diff를 쓰되 방향에 따라 라벨이 다름(스냅샷에만 있는 파일 = 저장 관점에선 삭제, 복원 관점에선 추가). 비교 불가(경로 없음)와 빈 폴더를 구분.
- **스냅샷 관리**: 메모/버전 라벨 편집(`save_snapshot_labels`), 개별·전체 삭제, 탐색기에서 스냅샷 폴더 열기, 라이브 세이브 폴더 열기.
- **버전 불일치 경고**: 스냅샷 버전 > 현재 게임 버전이면 경고(`compareVersions`).
- **세이브 탭**(`/saves`): 세이브 경로가 설정된 게임 목록 + 검색 + 스냅샷 개수.
- 같은 코드의 파일들은 세이브 백업을 **공유**(항목 키가 코드이므로).
- 설정 > 캐시 초기화 시 "세이브 백업도 삭제" 체크박스로 `userData/saves` 삭제 선택 가능.

### 9.1 게임 버전 감지 순서 (`detectGameVersion`)
① 지정된 실행 파일의 PE 파일 버전(`readExeFileVersion`, cmd 인젝션 방지 처리됨) → ② 폴더 내 다른 exe들의 PE 버전 → ③ 폴더 안 파일/폴더명에서 버전 패턴 추출(`extractVersionFromName`, 4자리 세그먼트 허용) → 실패 시 null.

---

## 10. 탐색기 (Explorer)

`ExplorerPage`가 단일 dnd-kit `DndContext`를 소유. 충돌 감지는 `pointerWithin`(의도하지 않은 이동 방지).

- **탭**: 여러 탭, 드래그로 순서 변경, 닫기 버튼/`Ctrl+W`/휠클릭 닫기, 새 탭 버튼(등록된 라이브러리 없으면 비활성; 새 탭 경로는 활성 탭 경로 상속), 임의 경로 폴더 열기 버튼. 탭 상태(경로·순서·활성·보기 방식)는 `explorer_tabs`에 **500ms 디바운스 저장**. 탭 라벨 길이 제한 + 탭 스트립 스크롤.
- **보기 방식**: 탭별 영속 **목록/그리드**(그리드 줌). 항목마다 파일 종류 아이콘(폴더는 노란색).
- **폴더 트리 사이드바**: 활성 탭의 **드라이브**를 루트로 표시(라이브러리 목록이 아님), 열림/너비 영속(`explorer-tree-open`, `explorer-tree-width`), 사이드바 자체 닫기 버튼. 트리 노드도 드롭 대상(droppable id는 네임스페이스로 분리, 라이브러리 소속일 때만 허용).
- **브레드크럼**: 드라이브 루트·UNC 경로 처리. 드라이브 루트 세그먼트와 구분자 불일치 버그 수정됨.
- **재귀 검색**: 현재 폴더를 루트로 하위 전체 검색(결과는 루트 기준 상대 경로 표시, 정렬/로딩/에러 상태 처리).
- **다중 선택** + 일괄 이름변경/이동/삭제. 코드가 있는 폴더는 클릭하면 안으로 진입(상세 팝업이 아니라).
- **드래그 앤 드롭 이동**: 폴더 위로 드롭 → 이동. 라이브러리 경계를 벗어나는 DnD는 하드 차단(드롭으로 파일이 라이브러리 밖에 고립되는 것 방지). 이동 후 **토스트 + `Ctrl+Z` 되돌리기**(`lastMoveStore` 1칸 슬롯; 되돌리기 = 같은 이동 뮤테이션을 반대 방향으로 호출, 원래 부모별로 그룹화).
- **그리드 키보드 이동**, 줌인 키 변형(`=`, `+` 등) 처리.
- **파일별 동작 가능 여부**(`getExplorerEntryCapabilities`): 폴더·압축파일 = 게임 데이터 관리 가능(즐겨찾기/평점/실행 등), `.exe` = 직접 실행, 미디어 파일 = 재생.
- 코드 없는 파일은 "실행" 버튼 숨김.

### 10.1 파일 조작 규칙 (`electron/main/fileOps/`, `ipc/explorerHandlers.ts`)
- **이름변경**: 거부 조건 — 빈 이름, `.`/`..`, 경로 구분자 포함, 끝이 `.`, Windows 예약 장치명(`CON PRN AUX NUL COM1-9 LPT1-9`). 대소문자만 바꾸는 변경은 허용. 동일 이름 존재 시 거부.
- **일괄 이름변경 템플릿** (`buildRenamePlan`): 기본 `{code} [{circle}] {title} {genres}`. 토큰 `{name} {index} {index:N}(0패딩) {code} {circle} {title} {genres}(최대 3개, 중괄호로 감쌈) {ext}`. Windows 금지 문자 `<>:"/\|?*`는 공백 치환, 연속 공백 정리. `{ext}` 토큰이 없으면 파일 확장자 자동 유지. 미리보기에서 빈 이름 결과 경고.
- **이동**: 같은 이름 존재 시 거부. 같은 볼륨은 `rename`, 다른 볼륨(`EXDEV`)은 `cp`+삭제, 복사 실패 시 부분 복사본 정리. 목적지 선택 대화상자 경로는 라이브러리 밖도 허용(드래그 이동만 경계 체크).
- **삭제**: 항상 **휴지통**(`shell.trashItem`).
- **키 재매핑**: 이름변경/이동이 성공하면 `game_user_data`(path 키)와 `path_code_overrides`의 키를 새 경로로 `rekeyPath`/`rekeyPathCodeOverride` — 즐겨찾기·평점·세이브·실행설정이 고아가 되지 않음.
- 모든 이름변경/이동/삭제/썸네일/실행/shell open은 서버(메인)에서 **등록 라이브러리 아래인지** 검증(`isPathWithinAnyLibrary`, `path.resolve`로 `..` 정리 후 비교; 라이브러리 밖이면 "허용되지 않은 경로입니다.").

---

## 11. 미디어 플레이어

### 11.1 구성
- **미디어 페이지**(`/media`): 설정된 미디어 폴더(`media-folder`) 탐색 — 폴더별 보기, 브레드크럼, 뒤로/앞으로(`mediaBrowseHistory`), 목록/그리드 전환(`media-view-mode`) + 줌 슬라이더, 썸네일 지연 로딩.
- **재생 엔진**: **libmpv 네이티브 애드온**(`electron/native/mpv-addon`, N-API) 을 Electron **utilityProcess**(`mpvWorker.ts`)에서 실행 → 크래시가 앱 전체로 번지지 않음. 비디오는 **raw 프레임을 MessagePort로 렌더러 `<canvas>`에 전달**, 오디오는 워커 프로세스 안에서 직접 출력. 상태(`state-update`: isPlaying/currentTime/duration/error)와 `ended`(eof-reached 폴링)를 메인이 렌더러로 중계. `hwdec=auto`.
- **UI 형태 3가지**: ① 하단 도킹 바(2단: 곡 정보 / 조작부) ② 전체화면 오버레이(영상은 사이드바와 화면 분할) ③ **별도 플레이어 창**(`#/player-window`)으로 분리 가능. 창 간 상태는 메인 프로세스를 중계자로 한 `media:state-broadcast`/`media:state-sync` (변경된 상태만 동기화, 새 창은 초기 상태를 pull).
- **재생 기능**: 재생/일시정지, 시크(드래그/키보드), 볼륨(영속 `media-volume`), 음소거, 반복 모드(끔/전체/한 곡), **셔플**(켜는 시점에 Fisher-Yates로 1회 순서 생성, 이후 포인터만 이동), 큐 관리, 단일 파일 재생은 **큐를 지우지 않고 추가**.
- **5밴드 EQ**: 60/230/910/3000/14000Hz, ±12dB, 프리셋(Flat / Bass boost[6,4,0,0,0] / Vocal boost[-2,0,4,3,0] / Treble boost[0,0,0,3,6]), 설정 영속(`media-equalizer-bands`, JSON 길이 5·범위 검증, 손상 시 무시). 슬라이더 드래그 중 변경된 밴드만 전송.
- **키보드 단축키**(텍스트 입력 중엔 비활성): `←/→` 5초 시크(호스트 창만), `↑/↓` 볼륨 ±5%, `Space` 재생/일시정지(버튼 포커스 중엔 제외).
- **하드웨어 미디어 키**: 재생 중일 때만 `globalShortcut`으로 `MediaPlayPause/NextTrack/PreviousTrack` 등록, **300ms 디바운스**(이중 신호 깜빡임 방지), 모든 창에 브로드캐스트. 재생 큐가 비면 해제. Web Media Session API도 병행.
- **새로고침 보호**: 재생 중 Ctrl+R/Ctrl+Shift+R 시 확인 다이얼로그.

### 11.2 사이드바 (미디어 탭 전용, 너비/열림 영속)
재생목록 관리 / 현재 대기열(썸네일·드래그 순서 변경·좋아요·"대기열 비우기") / 가사 로그 / 폴더 트리.

### 11.3 재생목록 · 좋아요
- 저장형 재생목록 CRUD(`media_playlists`, `media_playlist_tracks`), 트랙 추가·제거·순서 변경, 삭제 시 확인. 재생목록 상세 화면, 사용자 지정 표지(`mediathumb://playlist-cover/<id>`), 없으면 트랙 이미지 4분할 합성.
- 트랙 좋아요(`media_track_likes`) + "좋아요한 곡" 모아보기.
- 미디어 폴더를 바꿔도 **저장된 재생목록/좋아요 트랙은 계속 재생·썸네일·가사 가능**(신뢰 경계: 라이브러리 + 미디어 폴더 하위 **또는** 재생목록/좋아요 트랙의 **정확한 경로**).

### 11.4 가사 · 자막
- 형식: `.lrc`, `.vtt`, `.ass`. 탐색 순서: 같은 폴더의 동명 파일(확장자 `.lrc→.vtt→.ass`) → 대소문자 무시 동명 → 폴더에 자막 파일이 **정확히 1개**면 그것. `realpath`로 해석해 라이브러리 경계 재확인.
- 타임스탬프 없는 LRC는 정적 텍스트로 자동 전환. 현재 구절 자동 추적 + 클릭 시 해당 위치로 이동, 사용자가 직접 스크롤하면 자동 추적 방해 방지(디바운스 상한).
- ASS 도형 그리기(drawing) 명령은 로그에서 제거.
- **자막 PIP 창**(`#/subtitle-pip`): 현재 구절만 보여주는 항상 위 창, 위치/크기 영속(`subtitle-pip-x/y/width/height`), 화면 안으로 클램프, 테두리 없는 게임 창 위에도 표시. 현재 구절은 메인에서 broadcast.

### 11.5 미디어 썸네일 (`mediathumb://`)
- 해결 순서: 수동 override(`media_thumbnail_overrides`) → 캐시 → **ffmpeg-static**으로 영상 프레임/오디오 앨범아트 추출(동시 2개 제한, 같은 파일 요청 병합) → 오디오는 같은 폴더 이미지로 폴백 → 없으면 `.notfound` 마커로 **네거티브 캐시**.
- 캐시 위치 `userData/cache/media-thumbnails/`. WAV는 파일에 표지를 못 넣으므로 앱 내부 표지로 지정.
- **오디오 표지 삽입**(MP3/FLAC/M4A, `audioCover.ts`): 백업(고유명, exclusive) → 임시 파일에 삽입 → 재생 가능·디코딩 검증 → 원본 교체 → 재검증 → 둘 다 통과해야 백업 삭제. 실패 시 복원하고 SHA-256 일치할 때만 백업 삭제. 실패한 복구 백업은 UI에 노출.

### 11.6 ASMR/음성/음악/영상 작품 연동
- 크롤된 `work_type`이 `SOU`/`MOV`/`MUS`이고 **폴더**이며 코드가 있으면(`isAsmrPlayableFolder`) → "실행" 대신 **"재생"** 버튼, 실행 설정·세이브 UI 숨김. 라이브러리/탐색기/상세 어디서든 미디어 재생으로 진입(`usePlayAsmrFolder`).

---

## 12. 설정 화면 (`/settings`) — 4개 그룹

| 그룹 | 항목 |
| --- | --- |
| 라이브러리 | 라이브러리 추가(폴더 선택/드래그/경로 입력), 목록, 삭제(확인) |
| 일반 | 언어(ko/ja/en), 테마(라이트/다크는 사이드바 하단 토글), 창 닫기 동작(묻기/종료/트레이) |
| 실행·메타데이터 | Locale Emulator 감지 상태 및 `LEProc.exe` 수동 지정/초기화, 외부 메타데이터 프로바이더(URL/API 키/활성화) |
| 관리 | 캐시 초기화(표지·미디어 썸네일 캐시 삭제 + 세이브 백업 삭제 선택), 업데이트 확인/즉시 설치, 릴리스 노트 보기, 앱 버전 표시 |

### 12.1 `app_settings` 키 목록 (키/값 문자열 저장)
`theme`, `locale`, `sidebar-width`, `explorer-tree-open`, `explorer-tree-width`, `window-close-behavior`(`ask|quit|tray`), `locale-emulator-path`, `external-metadata-provider-enabled|-url|-api-key`, `media-folder`, `media-sidebar-open`, `media-sidebar-width`, `media-view-mode`(`list|grid`), `media-volume`(0~1), `media-equalizer-bands`(JSON 5개), `subtitle-pip-x|y|width|height`. 읽을 때 키별로 검증하고 잘못된 값은 null.

---

## 13. 앱 셸 · 수명주기

- **단일 인스턴스 락**: 2번째 실행은 기존 창을 띄움.
- **창**: 1280×800, 최소 720×480, `ready-to-show` 후 표시(흰 화면 깜빡임 방지), 테마는 첫 페인트 전에 `settings:get-sync`로 동기 적용.
- **트레이**: 트레이 아이콘(열기/종료, 더블클릭 열기). **창 닫기 동작** 설정: 매번 묻기(체크박스 "기억") / 종료 / 트레이로 최소화. 중복 close 결정 방지, 업데이트 설치 시 종료 승인 롤백 로직(`createQuitLifecycle`).
- **네이티브 메뉴**(언어 설정 따라 로컬라이즈): File(전체 메타데이터 새로고침, 종료) / Edit / View(새로고침[재생 중 확인], 강제 새로고침, 개발자 도구, 확대/축소, 전체화면, 제외 항목 관리) / Window. `Ctrl+W`는 네이티브 메뉴가 아니라 Explorer 탭 닫기가 처리.
- **줌**: 메뉴 줌 + `Ctrl+휠`(갤러리에서는 카드 크기 줌으로 사용), `=`/`+` 변형 지원.
- **자동 업데이트**(`electron-updater`): 시작 3초 후 확인(패키징된 경우만), 자동 다운로드, 설치는 사용자가 "지금 설치"를 누를 때만(`autoInstallOnAppQuit=false`). 업데이트 후 릴리스 노트 다이얼로그(`normalizeReleaseNotes`로 HTML 정리). 릴리스는 `npm run release` → GitHub에 직접 공개 발행.
- **토스트**: sonner 기반(`appToast`). 실행 실패·저장·이동·되돌리기 등 피드백.
- **초기 데이터 마이그레이션**: 시작 시 구 `dlibrary` 폴더 → 새 userData 이전(`migrateUserDataFolder`), 표지 경로 prefix 재작성, VNDB 세이브 폴더/DB 키 이전, 누락 컬럼 백필(DB `ALTER`). 치명적 시작 오류는 에러 박스 후 `app.exit(1)`.

---

## 14. 데이터베이스 (SQLite, `better-sqlite3` + Drizzle)

- 마이그레이션 파이프라인 없이 `client.ts`에서 `CREATE TABLE IF NOT EXISTS` + 컬럼 백필. `journal_mode=WAL`, `busy_timeout=5000`.
- **스키마 변경 시**: `schema.ts`(Drizzle 정의)와 `client.ts`(실제 DDL/백필) **둘 다** 수정해야 함.

| 테이블 | 주요 컬럼 / 비고 |
| --- | --- |
| `app_settings` | key, value |
| `libraries` | id, name, path(unique), created_at |
| `explorer_tabs` | id, label, path, position, is_active, view_mode |
| `sort_preferences` | page(pk), field, direction |
| `game_metadata` | code(pk), title, circle, release_date, genres(JSON), cover_image_path, work_type |
| `metadata_failures` | code(pk), attempted_sources, reason |
| `game_user_data` | key(pk), key_type, is_favorite, is_cleared, rating(1~5), memo, launch_config(JSON), total_playtime_ms, last_played_at, save_path, custom_cover_path |
| `path_code_overrides` | path(pk, 정규화), code |
| `save_snapshot_labels` | (key, timestamp) pk, memo, version |
| `media_thumbnail_overrides` | path(pk), thumbnail_path |
| `excluded_entries` | path(pk, 정규화), name, excluded_at |
| `media_playlists` | id, name, cover_image_path |
| `media_playlist_tracks` | (playlist_id, position) pk, path, name |
| `media_track_likes` | path(pk), liked_at |

JSON 컬럼(`genres`, `launch_config`)은 손상돼도 전체 읽기가 실패하지 않도록 `safeJsonParse`로 복구.

---

## 15. IPC · 신뢰 경계 규칙 (작업 시 반드시 지킬 것)

1. **채널 정의는 `shared/types/ipc.ts` 한 곳**(`IPC_CHANNELS`, 약 100개 상수 + Zod 요청 스키마). 새 채널 = 상수 + 스키마 추가 → `electron/main/ipc/*Handlers.ts`에 핸들러 → `electron/preload/index.ts`에 타입 지정 래퍼 → `src/services/*Service.ts`(TanStack Query 훅) 순.
2. 핸들러는 `payload: unknown` → `Schema.parse(payload)`. 푸시 전용 채널은 `webContents.send`; `ipcMain.on` 리스너는 `safeParse`(예외로 메인이 죽지 않도록).
3. 파일 시스템에 닿는 모든 핸들러는 `isPathWithinAnyLibrary` 검증(미디어는 `computeMediaAllowedRoots` + `computeMediaTrustedPaths`).
4. 렌더러는 `window.api.*`만 사용 가능(contextBridge 한 줄). 프리로드는 샌드박스라 `zod` 같은 번들 의존성 로딩에 주의(흰 화면 버그 이력).
5. 커스텀 프로토콜: `thumb://`(폴더 썸네일), `mediathumb://`(미디어/재생목록 썸네일). 경로 `..` 세그먼트는 resolve 후 비교.
6. 상태 관리 분담: **영속/OS/네트워크 유래 데이터 = TanStack Query**, **일시적 UI 상태 = Zustand**(Explorer 탭·선택·미디어 플레이어·되돌리기 등). Explorer 탭만 Zustand + 디바운스 저장 훅으로 SQLite 동기화.
7. 문자열은 `src/i18n/translations.ts`: 한국어 객체가 원본이고 `ja`/`en`은 `Record<keyof typeof ko, string>` → **한국어에 키를 추가하면 일본어/영어 누락 시 빌드(타입체크) 실패**. 새 UI 문자열은 3개 언어 모두 추가.
8. 렌더링 중 상태 동기화(effect 대신 render 중 비교 후 setState) 패턴이 여러 곳에서 의도적으로 사용됨 — 주석의 근거를 읽고 변경.

---

## 16. 디렉터리 지도

```
electron/main/
  index.ts                 앱 부트스트랩, 메뉴, 트레이, 수명주기
  database/                client(DDL), schema, *Repository, 마이그레이션
  ipc/                     *Handlers.ts (기능별 IPC)
  scanner/                 folderScanner, codeRecognition, thumbnail, concurrencyLimiter
  metadata/                crawl*/parser*/client, bulkCrawlQueue, cacheCoverImage, externalMetadataProvider
  launch/                  launchGame, localeEmulator, activeSessions, listExecutables
  save/                    snapshot 생성/목록/복원/diff, 버전 감지/비교
  fileOps/                 rename/move/delete
  media/                   mpvWorker/mpvProcessManager, resolveMediaThumbnail, lyrics, audioCover, 신뢰경계
  customCover/ cache/ shell/
  thumbnailProtocol.ts mediaThumbnailProtocol.ts mediaHardwareKeys.ts windowCloseBehavior.ts updater.ts ...
electron/preload/index.ts  window.api 정의
electron/native/mpv-addon/ libmpv N-API 애드온 (mpv_addon.cc, libmpv-2.dll 동봉, binding.gyp)
shared/                    IPC 타입/스키마, 코드 인식, 경로 정규화, 파일 종류 판별
src/
  pages/                   라우트 단위 화면
  components/{game,layout,media,ui}/
  services/                window.api 래핑 + React Query 훅
  stores/                  Zustand 스토어
  hooks/ lib/              순수 로직 (filterEntries, sortEntries, groupDuplicatesByCode, buildRenamePlan, lrc/vtt/ass 파서 ...)
  i18n/                    translations.ts (ko/ja/en)
docs/                      이 문서, 스크린샷, 검증 결과
```

---

## 17. 개발 · 빌드 · 테스트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | electron-vite 개발 모드 |
| `npm run build` | 빌드 + electron-builder (NSIS 설치 파일) |
| `npm run release` | 빌드 후 GitHub에 즉시 발행 (`--publish always`) |
| `npm test` | Vitest (테스트 파일 약 134개; 렌더러는 컴포넌트 렌더 테스트 없이 순수 함수 위주) |
| `npm run typecheck` / `lint` / `format:check` | tsc build / ESLint(flat) / Prettier |
| `npm run build:mpv-addon`, `rebuild:mpv-addon` | libmpv 네이티브 애드온 빌드/electron 리빌드 (`postinstall`에서 자동 실행, node-gyp·MSVC 필요) |

- 스택: Electron 43, electron-vite 5, Vite 7, React 19, TypeScript strict, Tailwind v4 + shadcn/ui(Radix), Zustand, TanStack Query v5 / Router, Drizzle + better-sqlite3, dnd-kit, react-window, cheerio, sharp, ffmpeg-static, electron-updater, zod 4, Pretendard 번들 폰트.
- 패키징: `extraResources`로 `LOGO.png`, `mpv_addon.node`, `libmpv-2.dll` 동봉, `asarUnpack` 사용.
- 사용 가능한 개발 방법론 문서(설계 스펙·구현 계획)는 `docs/superpowers/`(gitignore, 로컬 전용)에 있었음. 리포에는 `docs/2026-09-09-ui-renewal-handoff.md`, `docs/verification/*`이 남아 있음(성능 벤치마크는 합성 측정이며 실제 앱 GUI 프로파일링은 미실시).

---

## 18. 버전 이력 요약

| 버전 | 날짜 | 요점 |
| --- | --- | --- |
| 1.0.0/1.0.1 | 2026-08-02 | 정식 공개, 보안 경계 보강, 설치 프로그램·자동 업데이트·릴리스 노트 |
| 1.1.0 | 2026-08-08 | VNDB/Steam/Getchu 통합 검색, VNV/VNR 분리, 트레이, 외부 메타데이터 프로바이더, 오디오 표지 삽입, Explorer 개선 |
| 1.1.1 | 2026-08-09 | 창 닫기 동작 설정 |
| 1.2.0 | 2026-09-10 | libmpv 엔진, EQ, 재생목록/좋아요/사이드바, 자막(vtt/ass)·PIP, ASMR 폴더 재생, UI 전면 개편, 성능 개선, 전체 메타데이터 새로고침 |
| 1.2.1 | 2026-09-11 | 실패한 메타데이터 매 실행 재크롤 중단 |
| 1.2.2 | 2026-09-12 | VNDB 미평가 항목 메타데이터가 매 실행 삭제되던 문제 수정 (VNDB 코드 마이그레이션의 낡은 캐시 정리 로직 문제) |
| 1.2.3 | 2026-09-15 | libmpv 전환 후 먹통이던 하드웨어 미디어 키 복구(globalShortcut + 디바운스) |

---

## 19. 알려진 제약 · 주의할 점 · 아직 모호한 부분

- **Windows 전용**: Locale Emulator, 드라이브 루트/UNC 처리, `globalShortcut` 미디어 키, NSIS 등. macOS/Linux 고려 없음.
- 게임이 켜진 채로 앱을 먼저 종료하면 게임 프로세스도 같이 종료될 수 있고 그 세션의 플레이타임이 기록되지 않을 수 있음 (README 안내).
- 세이브 경로는 **자동 탐지 없음**, 사용자가 직접 지정해야 함.
- Steam "성인 전용" 티어는 로그인·연령 인증 계정이 필요해 크롤 불가할 수 있음 → `blocked` 실패 기록.
- DLsite/Getchu 등은 HTML 스크래핑이라 사이트 구조 변경 시 `parse`/`not_found` 실패로 나타남 (`__fixtures__`로 테스트).
- `app_settings`의 일부 키(예: `locale-emulator-path`, `external-metadata-provider-url/api-key`, `media-folder`)는 `SETTINGS_GET`의 키별 검증 목록에 없어 일반 문자열로 읽힘 `[확인]`.
- 9/13에 "베어 드라이브 문자 라이브러리 경로 정규화"와 "Windows 예약 시스템 폴더 스캔 제외" 수정을 넣었다가 되돌렸음(revert). 되돌린 사유는 커밋 메시지에 없음 → 관련 작업 시 현재 코드 기준으로 재검토 `[추정: 회귀 때문]`.
- 렌더러 컴포넌트 렌더링 테스트가 없으므로 UI 변경은 수동 확인이 필요.
- `package.json` `description`(DLsite game library manager)과 `DetailPage`(빈 상태 라우트)는 현재 실제 기능과 어긋나는 잔재.
- 이 문서는 소스를 전부 한 줄씩 읽고 쓴 것이 아님. 개별 UI 컴포넌트의 세부 동작(예: 정확한 배지 위치, 모든 단축키)은 해당 파일을 직접 열어 확인할 것.
