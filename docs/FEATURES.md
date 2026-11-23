# Ark Manager — 기능 명세서 (작업 참고용)

> **작성 기준: v1.2.3 + `security/hardening` 브랜치 (`aa51de8`, 714 커밋). 2026-11-23 소스 재검증.**
> 최초 작성(`012713b`, master 707 커밋) 이후 보안 커밋 6개로 바뀐 동작을 반영했고, 기존 서술 중 코드와 다른 부분을 정정했습니다(§21).
> 설계 판단과 이유는 [ARCHITECTURE.md](../ARCHITECTURE.md), 보안 점검 결과는 [SECURITY.md](SECURITY.md)·[SECURITY_FIXES.md](SECURITY_FIXES.md)를 참고하세요.
> 이 문서는 **기능 동작과 규칙, 파일 위치, 남은 작업** 중심입니다. 작업 전 §15(지킬 규칙)와 §20(할 일)을 먼저 보세요.
> 표기: `[확인]` = 코드에서 직접 확인, `[추정]` = 코드만으로 확정 불가(수정 전 재확인 필요), `[미검증]` = 코드는 있으나 실앱 동작 확인 기록 없음.

---

## 1. 한 줄 요약

PC에 흩어진 동인 소프트웨어(DLsite·Steam·VNDB·Getchu 게임, ASMR/음성/음악/영상 파일 등)를 **폴더 단위 라이브러리로 등록**하면, 파일/폴더 이름에서 **식별 코드**(RJ01234567 등)를 인식해 외부 사이트 메타데이터(표지·제목·제작사·발매일·태그)를 붙여 보여 주고, 실행·플레이타임·세이브 백업·파일 정리·미디어 재생까지 한 곳에서 처리하는 **Windows 전용 Electron 데스크톱 앱**.

- 앱 이름: **Ark Manager** (초기 이름 DLibrary → 2026-07-31 리브랜드). `package.json`의 `description`에는 아직 "DLsite game library manager"가 남아 있음.
- 배포: NSIS 설치 프로그램(경로 지정 가능, `oneClick: false`, `perMachine: false`), GitHub Releases 기반 자동 업데이트(`kth5352/ArkManager`). **설치 파일은 코드 서명되어 있지 않음.**
- 언어: UI는 한국어(원본)/일본어/영어(번역 키 354개). 문서·주석·커밋 메시지는 한국어+영어 혼용.
- 사용자 데이터 위치: Electron `userData` (`%APPDATA%/Ark Manager` 계열, 과거 `%APPDATA%/dlibrary`에서 자동 이전). DB 파일명 `ark-manager.db`. 폴더 구조는 §14.1.

### 1.1 현재 브랜치 상태 (2026-11-23)

| 항목 | 상태 |
| --- | --- |
| 브랜치 | `security/hardening` (master `012713b`에서 분기, 보안 커밋 6개). **아직 master 미병합·미릴리스** |
| 작업 트리 | `docs/SECURITY.md` 수정, `docs/SECURITY_FIXES.md` 신규 — 미커밋 |
| `npm test` | ✅ 141 파일 / 1009 테스트 통과 (hover-tooltip `act(...)` 경고 4건, §20) |
| `npm run typecheck` | ✅ 통과 |
| `npm run lint` | ❌ **오류 5건** — `scripts/verify-native-binaries.mjs`에 Node 전역(`console`, `process`)이 ESLint 설정에 없음. 경고 1건(`button.tsx` react-refresh, 기존) |
| 실앱(GUI) 검증 | 보안 변경 이후 **미실시** (CSP, mpv 애드온 재빌드, 설치본 Fuses/자동 업데이트). UI 개편 U1~U8도 시각 검증 미실시 |

---

## 2. 핵심 개념 (용어집)

| 용어 | 의미 |
| --- | --- |
| **라이브러리(Library)** | 사용자가 등록한 루트 폴더. 스캔·파일 조작·실행의 **신뢰 경계(trust root)**. 이름은 선택(미입력 시 폴더명 자동). 경로는 중복 불가. 등록 정책은 §4.1. |
| **항목(Entry, `ScannedEntry`)** | 스캔 결과 한 건. 파일 또는 폴더. `name, path, kind('file'|'folder'), mtimeMs, size, code, codeSource` |
| **식별 코드(Code)** | 파일/폴더명에서 정규식으로 뽑은 `RJ|VJ|ST|VNV|VNR|GC` + 숫자. 항목의 "작품 정체성". |
| **codeSource** | `'filename'`(이름에서 인식) / `'override'`(사용자가 "코드 연동"으로 수동 연결). override만 "연동 해제" 가능. |
| **항목 키(Entry key)** | 사용자 데이터를 저장하는 키. 코드가 있으면 `code.value`(keyType `code`), 없으면 `normalizeLibraryPath(path)`(keyType `path`). `resolveGameEntryKey()` 한 곳에서 결정. 렌더러는 항상 `{code, path}`를 함께 보내고 키 도출은 메인만 한다. |
| **메타데이터** | 외부 사이트에서 크롤링해 `game_metadata`에 캐시한 제목/제작사/발매일/장르/표지/작품유형. 코드 단위. |
| **사용자 데이터** | 즐겨찾기·클리어·평점·메모·실행 설정·플레이타임·마지막 플레이·세이브 경로·커스텀 표지. 항목 키 단위(`game_user_data`). |
| **작업 유형(workType)** | DLsite `work_type` 원문(`SOU`=음성/ASMR, `MOV`=동영상, `MUS`=음악, `RPG` 등). SOU/MOV/MUS 폴더는 "실행" 대신 "재생"으로 연결. |
| **스냅샷(Snapshot)** | 세이브 폴더를 통째로 복사해 둔 백업 한 버전. 폴더명 = ISO 타임스탬프(`:`/`.` → `-`, 정규식 `^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$`로 IPC에서 검증). |
| **"방금 고른 경로" 패턴** | 메인 프로세스가 네이티브 선택창이 마지막으로 반환한 경로를 1회용으로 기억하고, 그 경로와 일치할 때만 저장을 허용하는 신뢰 패턴. 세이브 폴더·커스텀 표지·미디어 썸네일·재생목록 표지·라이브러리 등록(일치하지 않으면 확인창)에 사용. |

### 2.1 식별 코드 규칙 [확인]

- 정규식: `/(?<![A-Za-z0-9])((?:RJ|VJ|ST|VNV|VNR|GC)\d+)(?![0-9])/i` (`electron/main/scanner/codeRecognition.ts`)
  - `\b` 대신 lookaround를 쓰는 이유: `RJ01234567_작품명`처럼 밑줄로 코드와 제목이 붙는 DLsite 관례를 인식하기 위해. `COST1234`처럼 문자에 붙은 건 거부.
  - 대소문자 무관, 결과는 대문자로 정규화 (`parseCanonicalGameCode`, `shared/gameCode.ts`, 정규식 `^(RJ|VJ|ST|VNV|VNR|GC)(\d+)$`).
- 코드 종류와 출처:

| 접두사 | 출처 | 외부 링크 / 비고 |
| --- | --- | --- |
| `RJ` | DLsite (maniax: 일반·성인 동인) | `https://www.dlsite.com/maniax/work/=/product_id/RJxxxx.html` |
| `VJ` | DLsite (pro: 상업) | `https://www.dlsite.com/pro/work/=/product_id/VJxxxx.html` |
| `ST` | Steam | 숫자 = Steam appid |
| `VNV` | VNDB **Visual Novel** (`v123`) | 반드시 `VNV` 접두사 명시 |
| `VNR` | VNDB **Release** (`r123`) | VN과 Release는 ID 공간이 달라 숫자가 같아도 다른 작품 → 접두사 분리 |
| `GC` | getchu.com | `https://www.getchu.com/item/{id}/` |

- 외부 링크 URL은 메인의 `shell/buildExternalUrl.ts`가 코드로부터 생성(렌더러는 URL을 보내지 못하고 코드만 보냄).
- 과거 `VN`/`VR` 접두사는 `VNV`/`VNR`로 DB 오픈 시 자동 마이그레이션(`migrateVndbCodePrefixes.ts`, 세이브 폴더는 `migrateVndbSaveDirectories.ts`). 이제 파일명에서는 **`VNV`/`VNR`만 인식**.
- 이름에 코드가 없으면 `path_code_overrides`(수동 연동) 조회 → 그래도 없으면 `code: null`.

---

## 3. 화면(라우트) 구성 [확인]

해시 라우터(`createHashHistory`, `src/router.tsx`). 사이드바는 3그룹 + 하단 고정(설정, 테마 토글).

| 그룹 | 메뉴 | 라우트 | 파일 |
| --- | --- | --- | --- |
| 라이브러리 | 갤러리 | `/` | `src/pages/Gallery/GalleryPage.tsx` |
| | 리스트 | `/list` | `src/pages/List/ListPage.tsx` |
| | 상세 리스트 | `/detail-list` | `src/pages/DetailList/DetailListPage.tsx` |
| | 탐색기 | `/explorer` | `src/pages/Explorer/*` |
| | 게임 검색 | `/game-search` | `src/pages/GameSearch/GameSearchPage.tsx` (코드 입력 파서는 `src/pages/DlsiteSearch/parseCodeInput.ts` — 옛 폴더명 잔재) |
| 활동 | 즐겨찾기 | `/favorites` | `src/pages/Favorites/FavoritesPage.tsx` |
| | 최근 플레이 | `/recently-played` | `src/pages/RecentlyPlayed/RecentlyPlayedPage.tsx` |
| | 세이브 | `/saves` | `src/pages/Saves/SavesPage.tsx` |
| 미디어 | 미디어 | `/media` | `src/pages/Media/MediaPage.tsx` |
| (하단) | 설정 | `/settings` | `src/pages/Settings/SettingsPage.tsx` |
| (숨김) | 상세 | `/detail` | `DetailPage.tsx` — 안내 문구만 있는 빈 상태 페이지(상세는 사이드바로 대체된 잔재) |

**별도 창**(같은 렌더러 번들): 플레이어 창 `#/player-window`(`PlayerWindowPage`, 960×640), 자막 PIP `#/subtitle-pip`(`SubtitlePipPage`). 이 두 해시는 **TanStack Router를 거치지 않고** `src/main.tsx`가 `location.hash`로 직접 분기한다(라우터/AppLayout을 거치면 `MediaPlayerHost`가 이중 마운트되기 때문). 세 창 모두 `MotionConfig reducedMotion="user"` 공유.

---

## 4. 라이브러리 관리와 스캔

### 4.1 라이브러리 등록 (설정 > 라이브러리) [확인]

- 입력 방식: 폴더 선택 대화상자, **드래그 앤 드롭**, 직접 경로 입력. 이름 생략 시 폴더명. 삭제 시 확인 다이얼로그. 등록 해제해도 디스크 파일은 건드리지 않음.
- **등록 정책** (`electron/main/libraries/libraryPathPolicy.ts`, `ipc/librariesHandlers.ts`, 보안 브랜치에서 추가):
  - **존재하는 폴더만** 허용.
  - 금지: 앱 `userData` 폴더와 그 **상위·하위**(`C:\`, `C:\Users`, 사용자 프로필, AppData 등 포함), `%SystemRoot%`(Windows), `Program Files`/`Program Files (x86)`, `ProgramData`(각각 상·하위 포함). 다른 드라이브 루트(`D:\`)는 허용.
  - **방금 네이티브 폴더 선택창에서 고른 경로**와 같으면 그대로 등록. 직접 입력·드래그한 경로는 메인 프로세스 **네이티브 확인창**("앱이 이 폴더 안 파일의 이름변경·이동·삭제·실행을 할 수 있게 됩니다", ko/ja/en)을 거쳐야 등록.
- `libraries:list`는 각 라이브러리에 `exists`(실시간 존재 여부)를 붙여 반환 → 설정 화면에서 오프라인/삭제된 경로 경고.
- **라이브러리별 표시 토글**(체크박스 팝업, `LibraryVisibilityDialog`): 숨긴 라이브러리의 항목은 갤러리/리스트/즐겨찾기 등에서 제외(`libraryVisibilityStore`, 휘발성 Zustand).
- 라이브러리 일부가 오프라인이어도 나머지는 정상 스캔(`allowPartial: true`, 1개뿐이어도 동일).
- 경로 비교는 항상 `normalizeLibraryPath` = **소문자 + 끝 슬래시 제거**. 경계 비교(`isPathWithinAnyLibrary`)는 여기에 `path.resolve` + 슬래시 통일을 더함.

### 4.2 두 종류의 스캐너 (`electron/main/scanner/folderScanner.ts`)

1. **얕은 스캔 `scanFolderShallow`** — Explorer·미디어용. 폴더의 직계 자식을 전부(이미지 포함) 나열. **라이브러리 경계 검사 없음**(읽기 전용 목록, 의도된 설계 — §16).
2. **재귀 스캔 `scanLibraryRecursive`** — Gallery/List/DetailList(`allowPartial: true`, 다중 경로) + Explorer 재귀 검색(`allowPartial: false`, **경로 정확히 1개**, 실패를 그대로 전파). 이 역시 경계 검사 없음.

#### 재귀 스캔 규칙 (핵심 휴리스틱) [확인]

- **이미지 파일(jpg/jpeg/png/gif/bmp/webp)은 작품 인식에서 완전 제외** — stat도 호출 안 함.
- 코드가 있는 항목(파일·폴더) = **리프**. 더 안으로 들어가지 않음.
- 코드 없는 **파일**은 항목으로 노출(`code: null`)하되, 그 부모 폴더가 "다중 작품 컨테이너"일 때만.
- 코드 없는 **폴더** 처리: 자식을 읽어 분류 후
  - `hasDirectFile && !hasSingletonCodedChild && !hasMultipleArchiveFiles` → 이 폴더 자체를 **하나의 작품(리프)**으로 취급
  - 그 외 → 안으로 재귀 (서클/카테고리 폴더로 간주)
  - `hasSingletonCodedChild`: 같은 코드가 정확히 1번 나오는 자식이 있음 (= 개별 작품이 들어 있는 래퍼)
  - 같은 코드가 2번 이상 나오는 자식들(예: 같은 RJ코드가 붙은 수십 개 음성 파일)은 "한 작품의 에셋" 신호로 보고 폴더를 리프로 접음
  - `hasMultipleArchiveFiles`: 압축 파일이 직접 2개 이상 → 시리즈/다중 작품 폴더로 보고 접지 않음
- 심볼릭 링크/정션은 걷지 않음 (순환 방지, `lstat`).
- 읽기 실패한 하위 폴더/stat 실패 항목은 건너뜀(스캔 전체는 실패시키지 않음).
- 성능: 프로세스 전역 `stat` 동시성 제한 **32**, `stat` 타임아웃 **15초**, 폴더당 1회만 readdir.
- 진행률: **25개** 항목마다 `scanner:scan-progress` push + 최종 1회.
- 압축 파일 확장자(`shared/isArchiveFile.ts`): `.zip .7z .rar .egg .tar .gz .bz2 .xz .lzh .cab .iso`
- 미디어 확장자(`shared/isMediaFile.ts`): 영상 `.mp4 .webm .mkv .avi .mov .wmv .flv .m4v`, 음성 `.mp3 .wav .flac .aac .ogg .m4a .wma`

### 4.3 썸네일 (표지 이미지) 우선순위

1. 사용자 지정 커스텀 표지 (`game_user_data.custom_cover_path`, `cache/custom-covers/*.webp`)
2. 크롤링한 DLsite/Steam/… 표지 (코드 있는 경우, `cache/covers/*.webp`)
3. 폴더 내 로컬 이미지 (`findThumbnailPath`): 이름이 `cover`·`folder`·`thumbnail`로 시작하는 이미지 우선 → 없으면 이름순 첫 이미지
- 폴더 썸네일은 커스텀 프로토콜 **`thumb://thumbnail/<encodeURIComponent(path)>`**로 서빙. 라이브러리 경계 밖 경로는 404. 원본 바이트를 디코딩 없이 그대로 응답(이미지 디코더를 거치지 않으므로 BMP도 표시됨).
- 커스텀 표지·크롤 표지는 아직 IPC + base64(`encodeThumbnail`)로 전달(트래픽이 적은 경로).
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
| `RJ/VJ` | **폴백 체인**: ① `dlsite-html`(작품 페이지 파싱: `#work_name`, `#work_maker`, 販売日, ジャンル, 作品形式) → ② `dlsite-json`(내부 JSON 엔드포인트) → ③ `external`(사용자 설정 외부 API, **단건 크롤에서만**, §5.3) |

- **모든 외부 요청은 `electron/main/net/safeFetch.ts`** 경유 [확인]: https·443만, URL 내 자격 증명 금지, 사설/루프백/링크로컬/CGNAT/멀티캐스트/IPv6 내부 대역 및 `localhost`·`*.local`·`*.internal`·단일 라벨 호스트 거부(DNS 결과 전체 검사), 리다이렉트는 수동 최대 **3홉**(매 홉 재검증, 교차 출처 시 `Authorization`/`Cookie` 제거), 응답 크기 기본 상한 **5MB**(표지는 15MB), 타임아웃 **15초**.
- UA: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArkManager/1.0`.
- 결과 구조 `CrawledGameMetadata`: `{title, circle, releaseDate('YYYY-MM-DD'|''), genres[], coverImageUrl, workType}`.
- **실패 추적**: 시도한 소스(`attemptedSources`)와 사유(`not_found | blocked | network | parse | provider_error`)를 `metadata_failures`에 기록. 실패한 코드는 앱을 다시 켜도 **자동 재시도하지 않음**(1.2.1). 단건 새로고침/전체 새로고침만 재시도.
- **표지 캐시**: `cache/covers/<keyToSafeDirName(code)>.webp`. 이미지 요청에 `Referer: <origin>/` 헤더(핫링크 403 우회). 다운로드한 바이트는 `openRasterImage`(§16) 통과 후 webp 변환.
- `keyToSafeDirName(key)`: 영숫자/`_`/`-`만이면 그대로, 아니면 SHA-256 hex. (표지·세이브 폴더·미디어 썸네일 파일명에 공통 사용)

### 5.2 외부 메타데이터 프로바이더 (설정 > 실행·메타데이터)

- 설정 키: `external-metadata-provider-enabled`, `-url`, `-api-key`(Bearer 헤더로 전송). 요청은 `GET <url>?code=RJxxxx`, `Accept: application/json`.
- HTTPS 필수(단 `http://localhost|127.0.0.1|[::1]` 개발 주소 허용). 사용자가 직접 입력한 주소라 **사설망(LAN/NAS) 허용**(`allowPrivateNetwork`). 응답 204/404/410 = 결과 없음, 그 외 비정상은 `provider_error`.
- 응답은 Zod 스키마(`title` 필수, 나머지 선택) 검증 후에만 사용.
- API 키는 **DPAPI(`safeStorage`)로 암호화 저장**(`enc:v1:<base64>`, `settingsRepository.SECRET_KEYS`). 시작 시 기존 평문 값 자동 이전(`migrateSecretSettings`). 암호화 불가 환경이면 평문 저장, 복호화 실패 시 빈 문자열. `SETTINGS_GET`은 **복호화된 값을 렌더러에 반환**(설정 화면 표시용).

### 5.3 크롤 트리거 [확인]

| 트리거 | 동작 |
| --- | --- |
| 라이브러리 탐색 중 자동(`useBulkCrawlMissingMetadata`) | 캐시·실패 기록이 **모두 없는** 코드만 `metadata:crawl-missing`으로 큐잉. **1초 간격 순차 처리**. 세션 내 시도한 코드는 `Set`으로 중복 방지. 진행률 배너(`BulkCrawlProgressBanner`). |
| 상세 사이드바 "메타데이터 새로고침" | 단건 `metadata:crawl-and-save` (실패 기록 지우고 재시도). **외부 프로바이더가 체인에 포함되는 유일한 경로.** |
| 메뉴 `File > Refresh All Metadata` | `game_metadata`에 있는 코드 **+ `metadata_failures`에만 있는 코드**(실패 코드를 재시도하는 유일한 방법)를 강제 재크롤(확인 다이얼로그에 개수 표시 + 진행률). `forceEnqueue` |
| 게임 검색 결과 선택 / 코드 수동 연동 | 해당 코드 단건 크롤 후 상세 표시 |

> ⚠ 일괄 큐(`bulkCrawlQueue.ts`)는 `crawlGameMetadataWithTrace(code)`를 **기본 deps(외부 프로바이더 비활성)**로 호출한다. 그래서 자동 크롤·전체 새로고침에서는 외부 프로바이더가 쓰이지 않는다. 의도인지 누락인지 기록이 없음 → §20.

### 5.4 통합 검색 (`/game-search`)

- 탭: **전체(All, 기본) / DLsite / Steam / VNDB / Getchu**. IPC 채널은 `metadata:search` 하나(`{source: 'dlsite'|'steam'|'vndb'|'getchu', query}`). **"전체"는 렌더러가 4개 소스에 병렬 요청**하고 소스별 그룹으로 각자의 로딩/오류/결과를 독립 표시(느린 DLsite가 다른 결과를 막지 않음).
- 제목으로도, 식별 코드로도 검색 (`parseCodeInput`). 결과 선택 → 메타데이터 크롤 → 상세 → "결과로 돌아가기"(데이터 있는 탭으로 복귀).
- Getchu 검색어는 **EUC-JP로 인코딩**(iconv-lite)해 전송. Steam은 공개 `storesearch` 엔드포인트(app 타입만). VNDB는 관련도/평점 기준 상위 10.
- 크롤된 제작사 이름을 클릭하면 그 이름으로 검색(상세 사이드바/리스트/상세리스트).

---

## 6. 라이브러리 뷰 (Gallery / List / DetailList)

공통 사항 (`useVisibleGames`가 공유 파생 데이터를 만듦):

- **데이터**: 등록·표시 중인 라이브러리 전체 재귀 스캔 결과에서 `excluded_entries` 경로를 뺀 목록. 스캔 결과는 TanStack Query로 **5분 staleTime** 캐시. (메타데이터·사용자 데이터·폴더 스캔 쿼리도 5분, 재생목록 5초, LE 감지·업데이트 상태 Infinity)
- **검색**: 헤더 검색창(`Ctrl+F`로 포커스). 대상 = 파일명, 코드, 크롤 제목, 크롤 제작사 (부분 일치, 소문자) — `src/lib/filterEntries.ts`.
- **장르 필터**: 태그 클릭 = **포함 필터**(다중 선택은 AND, 메타데이터 없는 항목은 숨김). 제외 장르는 메타데이터가 있는 항목에만 적용.
- **파일 종류 필터**: 전체 / 압축파일만 / 압축파일 제외 (`FileKindFilterToggle`).
- **중복 표시**: 같은 `코드:kind:세부종류(folder|archive|file)` 그룹에 2개 이상이면 중복 배지. "중복만 보기" 토글. 같은 코드의 압축파일 + 폴더가 함께 있으면 "압축 해제됨" 표시(`getExtractedArchiveCodes`).
- **정렬**: 이름 / 수정일 / 확장자, 오름·내림. 페이지별(`gallery|list|explorer|detail-list`)로 `sort_preferences`에 영속.
- **선택 모드**: 체크박스는 기본 숨김, **롱프레스 또는 토글**로 활성화. 선택 툴바: 전체 선택, 이동, 이름변경(일괄), 삭제, 취소. 우클릭 시에는 롱프레스 타이머가 시작되지 않음.
- **카드/행 표시**: 즐겨찾기 하트, 평점 별, 장르 배지, 중복 배지, 서클/제작사, 누적 플레이타임(최근 플레이 탭), 클리어 표시.
- **상세 사이드바**(§7)는 카드/행 클릭 시 오른쪽에 열림 (팝업형 `DetailOverlay`는 Explorer에서 사용).
- **키보드**: 카드에 마우스를 올린 채 `F` = 즐겨찾기 토글 (`useFavoriteShortcut`, 입력창 포커스·Ctrl/Alt 조합 중엔 무시). `Ctrl+Enter` = 실행(폴더만, DetailOverlay).

### 6.1 Gallery 전용
- 가상 스크롤 그리드(react-window). **Ctrl+휠로 카드 크기 줌**(0.6~1.8, 0.05 단위), 툴바 줌 슬라이더. 열 수 변화에도 스크롤 위치 보존. 카드는 행 너비에 균등 분배.
- 제목은 2줄까지 줄바꿈.

### 6.2 List / DetailList
- List: 가상 스크롤 행, 제목 2줄 줄바꿈, 장르 배지.
- DetailList: **표 형태**(컬럼 크기 조절, 헤더/본문 스크롤 동기화, 호버 툴팁), 파일 크기·수정일·서클·평점 등 다열.

### 6.3 우클릭 컨텍스트 메뉴 (`GameEntryContextMenu`)
실행/재생, 웹에서 열기(작품 페이지), 폴더 열기(OS 탐색기), 즐겨찾기, 클리어 표시, 평점·메모, 코드 연동, 메타데이터 새로고침, RJ 번호 복사/제목 복사, 새 탭에서 열기(Explorer), 재생목록에 추가/다음에 재생/저장된 재생목록에 추가(미디어 항목), 이름변경, 이동, 삭제, **보기에서 제외**.

### 6.4 제외 목록 (Excluded Entries)
- "보기에서 제외"로 **특정 경로만** 숨김 (코드가 아니라 **경로 기준** — 같은 코드의 다른 복사본은 영향 없음).
- 관리: 메뉴 `View > Manage Excluded Items`(메인 창에만 다이얼로그가 있으므로 항상 메인 창으로 전송)에서 복원.
- ⚠ 제외한 항목을 이동/이름변경하면 제외 기록은 옛 경로에 남는다(재키 대상 아님, §20).

---

## 7. 상세 사이드바 (`DetailSidebar`, `src/components/game/`)

리사이즈 가능(너비 `sidebar-width` 설정으로 영속), 열릴 때 애니메이션, 스크롤해도 헤더 고정.

- 헤더: 표지(**클릭하면 커스텀 표지 변경**), 제목(크롤 제목 우선), 코드, 서클, 발매일, 장르 배지(클릭 = 필터), 누적 플레이타임, 닫기.
- 액션: **실행**(초록 버튼) / ASMR·음성·음악·영상 폴더는 **재생**, 폴더 열기, 웹에서 열기, 메타데이터 새로고침(아이콘), 클리어 토글, 이름변경, 이동, 삭제.
- 항상 펼쳐진 **평점(1~5) / 메모** 섹션 (초기 데이터 로딩 전에는 입력 보호 — 덮어쓰기 방지).
- 접고 펼치는 섹션: **실행 설정**, **코드 연동/해제**, **세이브 데이터**, **커스텀 표지**.
- 코드 없는 항목은 "코드 없음" 표시 + 연동 UI. 메타데이터 실패 시 사유 표시(`useMetadataFailure`).

### 7.1 코드 연동 (Code Link)
- 코드 없는 항목에 `RJ…` 등 코드를 수동 지정 → `path_code_overrides(path→code)` 저장(한 트랜잭션). 재스캔해도 유지. 이때 기존 **path 키 사용자 데이터가 code 키로 병합 이전**(`rekeyToCode`): 즐겨찾기·클리어는 OR, 평점·메모·실행설정·마지막 플레이·세이브경로·커스텀표지는 **기존 code 행 값 우선, 없으면 path 행 값**, 플레이타임은 code 행이 0이 아니면 code 행 우선(합산하지 않음).
- "연동 해제"는 `codeSource === 'override'`일 때만 가능 (파일명 코드는 해제 대상 아님). 해제 시 override 행만 지우며 이미 code 키로 옮겨진 사용자 데이터는 path 키로 되돌리지 않는다 [확인].
- 확인 버튼은 코드 파싱 성공 시에만 활성화, 실패는 에러 표면화. 연동 직후 해당 코드 단건 크롤.

### 7.2 커스텀 표지
- 소스: 파일 선택(**"방금 고른 경로"만 허용** — 렌더러가 임의 경로를 읽을 수 없도록), **클립보드 이미지**(PNG로 변환), 해제(캐시 파일 삭제 + DB null).
- 저장: `cache/custom-covers/<safeKey>.webp`, 긴 변 **512px**로 축소(확대 없음). 디코딩은 `openRasterImage` 경유 → **jpeg/png/webp/gif만** 허용.
- ⚠ 선택창 필터에는 `bmp`가 있지만 디코더 허용 목록에 없어 BMP 선택 시 저장 실패(재생목록 표지·미디어 썸네일도 동일, §20).
- 코드가 연결된 작품도 변경 가능(1.2.0). 코드 없는 항목은 경로 키로 저장.

---

## 8. 실행 · 플레이타임

- **실행 설정** (`game_user_data.launch_config` JSON): `{ executablePath, launchMode: 'normal' | 'locale-emulator' }`.
  - 실행 파일 후보는 폴더 내 `.exe` 목록(`launch:list-executables`, 라이브러리 밖 폴더는 빈 목록)에서 선택.
  - **Locale Emulator**: `LEProc.exe`를 `ProgramFiles`, `ProgramFiles(x86)`, `%LOCALAPPDATA%\Programs` 아래 깊이 4까지 탐색해 자동 감지. 수동 경로 지정 가능(`locale-emulator-path`, 파일 선택창 필터 `exe`). 미설치 시 에러. LE에 대상 exe 경로를 인자로 넘기는 사용법은 공식 문서로 검증되지 않은 가정(코드 주석) [미검증].
  - 실행: `spawn(command, args, { windowsHide: false })` — **셸 없음, `cwd` 미지정**(게임 작업 폴더가 exe 폴더가 아님 → 상대 경로에 의존하는 게임 확인 필요, §20). 프로세스 `exit` 시점에 `sessionMs` 기록.
- **실행 허용 조건** [확인]: 저장 시(`LAUNCH_SET_CONFIG`)와 **실행 시(`LAUNCH_GAME`) 두 번 모두** `executablePath`가 ① 확장자 `.exe`(NUL 바이트 없음) ② 등록 라이브러리 아래인지 재검증. 실패 시 저장은 "허용되지 않은 실행 파일 경로입니다." 오류, 실행은 "실행 설정 없음" 오류로 처리되어 재설정 흐름으로 이어짐.
- 설정이 없는 게임을 실행하면 **실행 설정 창이 자동으로 뜨고**, 저장하면 닫히고 토스트 + 조건부 자동 실행.
- **플레이타임**: 세션 종료 시 `total_playtime_ms` 누적 + `last_played_at` 갱신 (`recordPlaySession`). 실행 중인 세션은 `activeSessions`에 보관되어 **앱 종료 시 그 시점까지의 시간을 기록**(`createQuitLifecycle`). 단 앱을 먼저 끄면 게임 프로세스도 같이 종료될 수 있음(README 주의사항).
- **최근 플레이**(`/recently-played`): `last_played_at` 기준 상위 **50**, 누적 플레이타임 표시, 클릭 시 갤러리 상세로 이동(`pendingGalleryOpenStore`).
- **즐겨찾기**(`/favorites`): 숨긴 라이브러리 항목은 제외, 코드당 카드 1개, 코드 없는 항목 포함(경로 정규화 후 갤러리로 딥링크).
- **클리어 토글**: 항목별 `is_cleared`.
- Explorer에서 `.exe` 파일을 직접 열면 실행 설정이 아니라 `shell:open-path` 경로(§10.1의 확인창)를 탄다.

---

## 9. 세이브 백업 (버전별 스냅샷)

- 사용자가 게임별로 **세이브 폴더를 직접 지정**(폴더 선택 대화상자, 게임 폴더 위치에서 시작). `SAVE_SET_PATH`는 **방금 picker가 반환한 경로만** 허용(1회용). 세이브 경로는 라이브러리 밖(AppData, 문서 등)이어도 됨 — "폴더 열기"(`shell:show-item-in-folder`)는 설정된 세이브 경로와 **정확히 일치**할 때 허용.
- **스냅샷 생성**: 세이브 폴더를 `userData/saves/<keyToSafeDirName(항목키)>/<timestamp>/`로 재귀 복사. 생성 시 **게임 버전 자동 감지**(§9.1)해 라벨로 저장.
- **복원** (`restoreSnapshot`): 안전 스왑 — ① 스냅샷을 `<target>.ark-manager-restoring`로 복사 ② 기존 세이브를 `<target>.ark-manager-previous`로 이동 ③ restoring → target로 rename ④ 성공 시 previous 삭제. 중간 실패 시 원복 시도, 이중 실패 시 수동 복구 경로를 메시지에 명시. 이전 복원의 흔적(`previous` 존재)이 있으면 새 복원 거부.
- **diff 미리보기** (`diffSaveFolders`, `SAVE_DIFF`의 `mode: 'save'|'restore'`): 같은 diff를 방향에 따라 다르게 라벨링. `save` 모드는 라이브 세이브 폴더가 없으면 오류, `restore` 모드는 허용. 선택한 스냅샷 폴더가 사라졌으면 오류(빈 폴더로 취급하지 않음).
- **스냅샷 관리**: 메모/버전 라벨 편집(`save_snapshot_labels`), 개별·전체 삭제(2단계 확인), 탐색기에서 스냅샷 폴더 열기, 라이브 세이브 폴더 열기.
- **버전 불일치 경고**: 스냅샷 버전 > 현재 게임 버전이면 복원 전 경고(`compareVersions`).
- **세이브 탭**(`/saves`): 세이브 경로가 설정된 게임 목록 + 검색 + 스냅샷 개수(스냅샷 없는 게임은 숨김).
- 같은 코드의 파일들은 세이브 백업을 **공유**(항목 키가 코드이므로).
- 설정 > 캐시 초기화 시 "세이브 백업도 삭제" 체크박스로 `userData/saves` 삭제 선택 가능.

### 9.1 게임 버전 감지 순서 (`detectGameVersion`)
① 지정된 실행 파일의 PE 파일 버전(`readExeFileVersion`) → ② 폴더 내 다른 exe들의 PE 버전 → ③ 폴더 안 파일/폴더명에서 버전 패턴 추출(`extractVersionFromName`, 4자리 세그먼트 허용) → 실패 시 null.
- `readExeFileVersion`(보안 브랜치에서 재작성): 셸 없이 `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`를 `execFile`로 실행, exe 경로는 **환경변수 `ARK_EXE_PATH`로만** 전달(스크립트는 상수), `PSModulePath` 비움, `windowsHide`, 10초 타임아웃, 출력 크기 제한.

---

## 10. 탐색기 (Explorer)

`ExplorerPage`가 단일 dnd-kit `DndContext`를 소유. 충돌 감지는 `pointerWithin`.

- **탭**: 여러 탭, 드래그로 순서 변경, 닫기 버튼/`Ctrl+W`(렌더러 전역 처리 — 네이티브 Window 메뉴의 Close는 단축키를 뺌)/휠클릭 닫기, 새 탭 버튼(라이브러리 없으면 비활성; 활성 탭 경로 상속), 임의 경로 폴더 열기 버튼. 탭 상태(경로·순서·활성·보기 방식)는 `explorer_tabs`에 **500ms 디바운스 저장**. 탭 라벨 길이 제한 + 탭 스트립 스크롤.
- **보기 방식**: 탭별 영속 **목록/그리드**(그리드 줌). 항목마다 파일 종류 아이콘(폴더는 노란색).
- **폴더 트리 사이드바**: 활성 탭의 **드라이브**를 루트로 표시, 열림/너비 영속(`explorer-tree-open`, `explorer-tree-width`). 트리 노드도 드롭 대상(droppable id는 `tree:` 접두사로 분리, 라이브러리 소속일 때만 허용).
- **브레드크럼**: 드라이브 루트·UNC 경로 처리.
- **재귀 검색**: 현재 폴더를 루트로 하위 전체 검색(결과는 루트 기준 상대 경로 표시).
- **다중 선택** + 일괄 이름변경/이동/삭제. 코드가 있는 폴더는 클릭하면 안으로 진입.
- **드래그 앤 드롭 이동**: 폴더 위로 드롭 → 이동. 라이브러리 경계를 벗어나는 DnD는 렌더러에서 하드 차단. 이동 후 **토스트 + `Ctrl+Z` 되돌리기**(`AppLayout` 전역 단축키, `lastMoveStore` 1칸 슬롯; 같은 이동 뮤테이션을 반대 방향으로 호출, 원래 부모별로 그룹화 → 두 번 누르면 재실행).
- **키보드**: 행/타일에서 `Ctrl+Shift+↑` = 이동 대화상자 열기(DnD 대체), 그리드 화살표 이동, 줌인 키 변형(`=`, `+`) 처리.
- **파일별 동작 가능 여부**(`getExplorerEntryCapabilities`): 폴더·압축파일 = 게임 데이터 관리 가능(즐겨찾기/평점/실행 등), `.exe` = 직접 열기(확인창), 미디어 파일 = 재생. 코드 없는 파일은 "실행" 버튼 숨김.

### 10.1 파일 조작 규칙 (`electron/main/fileOps/`, `ipc/explorerHandlers.ts`, `ipc/shellHandlers.ts`)
- **이름변경**: 거부 조건 — 빈 이름, `.`/`..`, 경로 구분자 포함, 끝이 `.`, Windows 예약 장치명(`CON PRN AUX NUL COM1-9 LPT1-9`, 첫 점 앞부분 기준이라 `CON.txt`도 거부). 대소문자만 바꾸는 변경은 허용. 동일 이름 존재 시 거부.
- **일괄 이름변경 템플릿** (`src/lib/buildRenamePlan.ts`): 기본 `{code} [{circle}] {title} {genres}`. 토큰 `{name} {index} {index:N}(0패딩) {code} {circle} {title} {genres}(최대 3개, 중괄호로 감쌈) {ext}`. Windows 금지 문자 `<>:"/\|?*`는 공백 치환, 연속 공백 정리. `{ext}` 토큰이 없으면 확장자 자동 유지. 미리보기에서 빈 이름 결과 경고.
- **이동**: 같은 이름 존재 시 거부. 같은 볼륨은 `rename`, 다른 볼륨(`EXDEV`)은 `cp`+삭제, 복사 실패 시 부분 복사본 정리. 목적지(`destDir`)는 백엔드에서 제한하지 않음(선택창으로 라이브러리 밖 이동 허용, DnD만 렌더러에서 경계 체크).
- **삭제**: 항상 **휴지통**(`shell.trashItem`).
- **열기**(`shell:open-path`): 라이브러리 안 + NUL 없음 + 실제 존재해야 함. 폴더·일반 문서는 바로 열고, **실행 가능 형식**(실행 파일·스크립트·바로가기·설치 파일·디스크 이미지·매크로 문서 등, `shell/openPathPolicy.ts`) 또는 **확장자 없음**은 메인 프로세스 **네이티브 경고창**(기본 버튼 "취소"). `evil.exe.`(끝 점/공백)·`file.txt:evil.exe`(ADS) 위장도 처리.
- **키 재매핑**: 이름변경/이동이 성공하면 `game_user_data`(path 키)와 `path_code_overrides`의 키를 새 경로로 `rekeyPath`/`rekeyPathCodeOverride`.
  - ⚠ **한계** [확인]: 대상 경로와 **정확히 같은** 행만 옮긴다. ① 폴더를 옮기면 그 **하위 항목**의 path 키 데이터·override는 옛 경로에 남음 ② `launch_config.executablePath`, `save_path`(게임 폴더 안일 때), `excluded_entries`, 재생목록 트랙·좋아요·미디어 썸네일 override의 경로는 **갱신되지 않음** → 코드가 있는 게임도 폴더를 옮기면 실행 설정이 깨져 재설정 창이 뜸. §20.
- 경계 검증: 이름변경/이동/삭제/썸네일/실행/열기는 메인에서 **등록 라이브러리 아래인지** 확인(`isPathWithinAnyLibrary`, 위치는 `electron/main/thumbnailProtocol.ts`; `path.resolve`로 `..` 정리 후 비교; 라이브러리 밖이면 "허용되지 않은 경로입니다."). `realpath`는 쓰지 않음(정션 우회 가능성, §16).

---

## 11. 미디어 플레이어

### 11.1 구성
- **미디어 페이지**(`/media`): 설정된 미디어 폴더(`media-folder`) 탐색 — 폴더별 보기, 브레드크럼, 뒤로/앞으로(`mediaBrowseHistory`), 목록/그리드 전환(`media-view-mode`) + 줌 슬라이더, 썸네일 지연 로딩.
- **재생 엔진**: **libmpv 네이티브 애드온**(`electron/native/mpv-addon`, N-API) 을 Electron **utilityProcess**(`mpvWorker.ts`, 빌드 시 별도 엔트리로 출력)에서 실행 → 크래시가 앱 전체로 번지지 않음, 크래시 시 재생성. 비디오는 **SW 렌더 프레임을 MessagePort로 렌더러 `<canvas>`에 전달**(영상일 때만 프레임 루프, 오디오는 250ms 이벤트 폴링), 오디오는 워커 안에서 직접 출력. 상태(`mpv:state-update`: isPlaying/currentTime/duration/error)와 `mpv:ended`(keep-open 일시정지 감지)를 메인이 호스트 창으로 중계. `hwdec=auto`.
- **mpv 보안 옵션**(보안 브랜치, **애드온 재빌드 필요**): `access-references/load-unsafe-playlists/ytdl/load-scripts/config/audio-file-auto/input-default-bindings/input-vo-keyboard/osc = no`. 앱이 자막을 직접 그리므로 `sub-auto=no`, `sid=no`. `MPV_LOAD`는 경계 검증 후 **`path.resolve`한 절대경로**만 mpv에 전달.
- DLL 로딩: 워커가 애드온 폴더를 `PATH` 앞에 붙인 뒤 애드온이 `LoadLibraryA("libmpv-2.dll")`(상대 이름) 호출. 패키징 시 `resources/mpv-addon/`. `libmpv-2.dll`은 `CHECKSUMS.sha256`로 빌드 전 검증.
- **UI 형태 3가지**: ① 하단 도킹 바(2단: 곡 정보 / 조작부) ② 전체화면 오버레이(영상은 사이드바와 화면 분할) ③ **별도 플레이어 창**(`#/player-window`). 창 간 상태는 메인 프로세스를 중계자로 한 `media:state-broadcast`/`media:state-sync`(변경된 상태만, `currentTime`/`duration`은 제외) + 새 창의 pull(`media:request-state-sync`). 호스트 전환은 `mpv:become-host`(재생 중단 없이 프레임 수신 창만 변경).
- **재생 기능**: 재생/일시정지, 시크, 볼륨(영속 `media-volume`), 음소거, 반복 모드(끔/전체/한 곡), **셔플**(켜는 시점에 Fisher-Yates로 1회 순서 생성, 이후 포인터만 이동; 재생목록 길이가 바뀌면 재생성), 큐 관리, 단일 파일 재생은 **큐를 지우지 않고 추가**.
- **5밴드 EQ**: 60/230/910/3000/14000Hz, ±12dB, 프리셋(Flat / Bass boost[6,4,0,0,0] / Vocal boost[-2,0,4,3,0] / Treble boost[0,0,0,3,6]), 설정 영속(`media-equalizer-bands`, JSON 길이 5·범위 검증, 손상 시 무시). 재적용은 메인이 워커의 `init-ok` 시점에 수행(콜드 스타트·크래시 재생성·분리 창 모두 커버). 밴드 수 5는 `settingsHandlers.ts`·`equalizerPresets.ts`·`mpv_addon.cc` 세 곳이 **수동 동기화**.
- **키보드 단축키**(텍스트 입력 중엔 비활성): `←/→` 5초 시크(호스트 창만), `↑/↓` 볼륨 ±5%, `Space` 재생/일시정지(버튼 포커스 중엔 제외).
- **하드웨어 미디어 키**: 재생 중일 때만 `globalShortcut`으로 `MediaPlayPause/NextTrack/PreviousTrack` 등록, **300ms 디바운스**, 모든 창에 브로드캐스트. 재생 큐가 비면 해제. Web Media Session API도 병행.
- **새로고침 보호**: 재생 중 Ctrl+R/Ctrl+Shift+R 시 확인 다이얼로그.

### 11.2 사이드바 (미디어 탭 전용, 너비/열림 영속)
재생목록 관리 / 현재 대기열(썸네일·드래그 순서 변경·좋아요·"대기열 비우기") / 가사 로그 / 폴더 트리.

### 11.3 재생목록 · 좋아요
- 저장형 재생목록 CRUD(`media_playlists`, `media_playlist_tracks`), 트랙 추가·제거·순서 변경(`set-tracks`로 통째 교체), 삭제 시 확인. 재생목록 상세 화면, 사용자 지정 표지(`cache/playlist-covers/`, `mediathumb://playlist-cover/<id>`), 없으면 트랙 이미지 4분할 합성.
- 트랙 좋아요(`media_track_likes`) + "좋아요한 곡" 모아보기.
- **미디어 신뢰 경계**(`media/mediaTrustBoundary.ts`): 라이브러리 + `media-folder` 하위 **또는** 재생목록/좋아요 트랙의 **정확한 경로**. 재생(`MPV_LOAD`)·썸네일·가사·썸네일 override가 모두 이 함수를 공유 → 미디어 폴더를 바꿔도 저장된 트랙은 계속 사용 가능.

### 11.4 가사 · 자막
- 형식: `.lrc`, `.vtt`, `.ass`. 탐색 순서: 같은 폴더의 동명 파일(`.lrc→.vtt→.ass`) → 대소문자 무시 동명 → 폴더에 자막 파일이 **정확히 1개**면 그것. `realpath`로 해석해 경계 재확인.
- 타임스탬프 없는 LRC는 정적 텍스트로 자동 전환. 현재 구절 자동 추적 + 클릭 시 해당 위치로 이동, 사용자가 직접 스크롤하면 자동 추적 일시 중단. 켜기/끄기는 곡별로 기억.
- ASS 도형 그리기(drawing) 명령은 로그에서 제거.
- **자막 PIP 창**(`#/subtitle-pip`): 현재 구절만 보여주는 테두리 없는 투명 창(기본 360×90), `setAlwaysOnTop(true, 'screen-saver')`로 전체화면 게임 위에도 표시, 위치/크기 영속(`subtitle-pip-x/y/width/height`), 화면 안으로 클램프(`subtitlePipBounds.ts`). 표시할 줄은 호스트 창이 계산해 `subtitle-pip:line-update`(`line | no-active-line | no-lyrics | no-track`, 메인이 Zod 검증)로 보냄.

### 11.5 미디어 썸네일 (`mediathumb://`)
- 해결 순서: 수동 override(`media_thumbnail_overrides`, 파일은 `cache/media-thumbnail-overrides/`) → 자동 캐시(`cache/media-thumbnails/<safe>.webp`) → **ffmpeg-static**으로 영상 프레임/오디오 앨범아트 추출(`execFile`+인자 배열, 동시 **2개** 제한, 같은 파일 요청 병합, 15초 타임아웃) → 오디오는 같은 폴더 이미지로 폴백 → 없으면 `.notfound` 마커로 **네거티브 캐시**.
- 모든 결과 이미지는 `saveCustomCoverImage`(`openRasterImage` + 512px webp)로 재인코딩.
- 캐시 초기화는 `covers`·`media-thumbnails`·(레거시)`media-remux`만 지움. `custom-covers`·`media-thumbnail-overrides`·`playlist-covers`는 사용자 선택이라 유지.
- **오디오 표지 삽입**(MP3/FLAC/M4A, `audioCover.ts`): 백업(고유명, exclusive) → 임시 파일에 삽입 → 재생 가능·디코딩 검증 → 원본 교체 → 재검증 → 둘 다 통과해야 백업 삭제. 실패 시 복원하고 SHA-256 일치할 때만 백업 삭제. 실패한 복구 백업은 UI에 노출. 삽입 성공 시 해당 파일의 자동 썸네일 캐시 무효화. WAV 등 삽입 불가 형식은 앱 내부 override로 저장.

### 11.6 ASMR/음성/음악/영상 작품 연동
- 크롤된 `work_type`이 `SOU`/`MOV`/`MUS`이고 **폴더**이며 코드가 있으면(`isAsmrPlayableFolder`) → "실행" 대신 **"재생"** 버튼, 실행 설정·세이브 UI 숨김. 라이브러리/탐색기/상세 어디서든 진입(`usePlayAsmrFolder`).
- 동작: 그 폴더를 **`media-folder` 설정으로 덮어쓴 뒤**(사용자가 지정했던 미디어 폴더가 바뀜) 루트에 미디어 파일이 있으면 즉시 재생, 하위 폴더뿐이면 `/media`로 이동만.

---

## 12. 설정 화면 (`/settings`) — 4개 그룹

| 그룹 | 항목 |
| --- | --- |
| 라이브러리 | 라이브러리 추가(폴더 선택/드래그/경로 입력 — 선택창 외에는 확인창), 목록(오프라인 경고), 삭제(확인) |
| 일반 | 언어(ko/ja/en), 테마(라이트/다크는 사이드바 하단 토글), 창 닫기 동작(묻기/종료/트레이) |
| 실행·메타데이터 | Locale Emulator 감지 상태 및 `LEProc.exe` 수동 지정/초기화, 외부 메타데이터 프로바이더(URL/API 키/활성화) |
| 관리 | 캐시 초기화(§11.5 + 세이브 백업 삭제 선택), 업데이트 확인/즉시 설치, 릴리스 노트 보기, 앱 버전 표시 |

### 12.1 `app_settings` 키 목록 (`SettingKeySchema`, 20개) [확인]
`theme`, `locale`, `sidebar-width`, `explorer-tree-open`, `explorer-tree-width`, `window-close-behavior`(`ask|quit|tray`), `locale-emulator-path`, `external-metadata-provider-enabled|-url|-api-key`(api-key는 암호화), `media-folder`, `media-sidebar-open`, `media-sidebar-width`, `media-view-mode`(`list|grid`), `media-volume`(0~1), `media-equalizer-bands`(JSON 5개), `subtitle-pip-x|y|width|height`.

- **읽기(`SETTINGS_GET`) 시 키별 검증**하는 키: theme, sidebar-width, locale, explorer-tree-width/open, external-provider-enabled, window-close-behavior, media-sidebar-open/width, media-view-mode, media-volume, media-equalizer-bands → 잘못된 값은 null.
- 검증 없이 원문 반환: `locale-emulator-path`, `external-metadata-provider-url/api-key`, `media-folder`, `subtitle-pip-*`(PIP 창 핸들러가 직접 숫자 변환·클램프).
- **쓰기(`SETTINGS_SET`)는 키만 검증하고 값은 임의 문자열**을 그대로 저장한다. 이 중 `locale-emulator-path`(실행 경로)와 `media-folder`(미디어 신뢰 루트)는 보안상 의미가 있는 값 → §16, §20.
- `settings:get-sync`는 첫 페인트 전 테마 적용용으로 `theme`만 동기 반환.

---

## 13. 앱 셸 · 수명주기

- **시작 순서**(`electron/main/index.ts`): 단일 인스턴스 락 → `installTrustedIpcGuard()`·`installWebContentsLockdown()`(어떤 핸들러/창보다 먼저) → 커스텀 스킴 등록(`thumb`, `mediathumb`) → `whenReady`: 권한 잠금 → 구 `dlibrary` 폴더 이전 → VNDB 세이브 폴더 이전 → `safeStorage` 암호기 설치 → DB 열기(DDL/백필/VNDB 코드 마이그레이션) → 비밀값 이전 → 표지 경로 prefix 재작성 → 핸들러 등록 → 메뉴·창·트레이 → 3초 후 업데이트 확인. 치명적 시작 오류는 `showErrorBox` 후 `app.exit(1)`.
- **단일 인스턴스 락**: 2번째 실행은 기존 창을 띄움(DB 배타 잠금 충돌 방지).
- **창**: 1280×800, 최소 720×480, `ready-to-show` 후 표시, 테마는 첫 페인트 전에 `settings:get-sync`로 동기 적용(기본 dark). 모든 창(메인/플레이어/PIP)은 `secureWebPreferences()` 사용. 개발 모드에서만 렌더러 콘솔을 터미널로 전달.
- **트레이**: 트레이 아이콘(Open/Exit — 영어 고정, 더블클릭 열기). **창 닫기 동작** 설정: 매번 묻기("기억" 체크박스) / 종료 / 트레이로 최소화. 업데이트 설치 시 종료 승인 롤백 로직(`createQuitLifecycle`).
- **네이티브 메뉴**(앱이 추가한 항목만 로컬라이즈, `menuLocalization.ts`; 언어 변경 시 즉시 재구성): File(전체 메타데이터 새로고침, Exit) / Edit(role) / View(새로고침·강제 새로고침[재생 중 확인], **개발자 도구**, 확대/축소, 전체화면, 제외 항목 관리) / Window(Minimize, Zoom, Close — Close의 `Ctrl+W` 가속키 제거). Help 메뉴 없음.
- **줌**: 메뉴 줌 + `Ctrl+휠`(갤러리에서는 카드 크기 줌으로 사용), `=`/`+` 변형 지원(`zoomShortcuts.ts`).
- **자동 업데이트**(`electron-updater`): 패키징된 경우만 시작 3초 후 확인, 자동 다운로드(`autoDownload=true`), 설치는 "지금 설치"를 누를 때만(`autoInstallOnAppQuit=false`). 상태는 `update:status` push + `update:get-status` pull. 업데이트 후 릴리스 노트 다이얼로그(`normalizeReleaseNotes`로 HTML 태그 제거, 건너뛴 버전 노트 모두 포함). 릴리스는 `npm run release` → GitHub에 즉시 공개 발행.
- **토스트**: sonner 기반(`appToast`). 실행 실패·저장·이동·되돌리기·뮤테이션 실패 피드백.
- **초기 데이터 마이그레이션**: 구 `dlibrary` → 새 userData 이전(`migrateUserDataFolder`), 표지 경로 prefix 재작성, VNDB 세이브 폴더/DB 키 이전, 누락 컬럼 백필, 평문 API 키 암호화.

---

## 14. 데이터베이스 (SQLite, `better-sqlite3` + Drizzle)

- 마이그레이션 파이프라인 없이 `client.ts`에서 `CREATE TABLE IF NOT EXISTS` + `ensureColumns()` 백필. `journal_mode=WAL`, `busy_timeout=5000`. `drizzle-kit`(`db:generate/migrate`)은 문서화 용도로만 존재.
- **스키마 변경 시**: `schema.ts`(Drizzle 정의)와 `client.ts`(실제 DDL/백필) **둘 다** 수정. 새 컬럼은 nullable 또는 `NOT NULL DEFAULT`여야 백필 가능.

| 테이블 | 주요 컬럼 / 비고 |
| --- | --- |
| `app_settings` | key(pk), value |
| `libraries` | id, name, path(unique), created_at |
| `explorer_tabs` | id, label, path, position, is_active, view_mode(기본 list) |
| `sort_preferences` | page(pk), field, direction |
| `game_metadata` | code(pk), title, circle, release_date, genres(JSON), cover_image_path, work_type, created_at, updated_at |
| `metadata_failures` | code(pk), attempted_sources(JSON), reason, updated_at |
| `game_user_data` | key(pk), key_type(`code|path`), is_favorite, is_cleared, rating(1~5), memo, launch_config(JSON), total_playtime_ms, last_played_at, save_path, custom_cover_path, created_at, updated_at |
| `path_code_overrides` | path(pk, 정규화), code, created_at |
| `save_snapshot_labels` | (key, timestamp) pk, memo, version |
| `media_thumbnail_overrides` | path(pk), thumbnail_path |
| `excluded_entries` | path(pk, 정규화), name, excluded_at (구 `key/key_type` 형태 테이블은 시작 시 DROP 후 재생성 — 미출시 형태) |
| `media_playlists` | id, name, cover_image_path, created_at, updated_at |
| `media_playlist_tracks` | (playlist_id, position) pk, path, name |
| `media_track_likes` | path(pk), liked_at |

JSON 컬럼(`genres`, `launch_config`)은 손상돼도 전체 읽기가 실패하지 않도록 `safeJsonParse`로 복구. 비밀값은 `app_settings`에 `enc:v1:` 접두사로 저장.

### 14.1 userData 폴더 구조 [확인]

```
%APPDATA%/Ark Manager/
  ark-manager.db (+ -wal, -shm)
  cache/
    covers/                    크롤 표지 (재생성 가능, 캐시 초기화 대상)
    media-thumbnails/          미디어 자동 썸네일 + *.notfound (캐시 초기화 대상)
    media-remux/               레거시, 캐시 초기화 시 정리만
    custom-covers/             사용자 지정 게임 표지 (유지)
    media-thumbnail-overrides/ 사용자 지정 미디어 썸네일 (유지)
    playlist-covers/           재생목록 표지 (유지)
  saves/<safeKey>/<timestamp>/ 세이브 스냅샷 (선택적으로만 삭제)
```
주의: Windows에서 `cache/`는 Chromium 자체 `Cache` 폴더와 같은 물리 폴더(대소문자 무시)이므로 `cache/` 전체 삭제 금지.

---

## 15. IPC · 신뢰 경계 규칙 (작업 시 반드시 지킬 것)

1. **채널 정의는 `shared/types/ipc.ts` 한 곳**(`IPC_CHANNELS` **106개** 상수 + Zod 요청 스키마). 새 채널 = 상수 + 스키마 → `electron/main/ipc/*Handlers.ts` 핸들러 → `electron/preload/index.ts` 타입 지정 래퍼 → `src/services/*Service.ts`(TanStack Query 훅) 순.
2. 핸들러는 `payload: unknown` → `Schema.parse(payload)`. 푸시 전용 채널(`scanner:scan-progress`, `metadata:bulk-crawl-progress`, `update:status`, `mpv:state-update`, `mpv:ended`, `media:hardware-key`, `menu:open-excluded-entries-dialog` 등)은 `webContents.send`. `ipcMain.on` 리스너는 `safeParse`(예외로 메인이 죽지 않도록) — 단 `MPV_RESIZE`는 현재 `parse`를 씀.
3. **모든 `ipcMain.handle/on`은 `installTrustedIpcGuard()`가 감싸** 발신 프레임이 앱 자신의 최상위 프레임(패키징 시 정확히 `out/renderer/index.html`, 개발 시 dev 서버 출처)인지 검사. 위반 시 handle은 throw, on은 `returnValue = null`. 새 핸들러도 자동 적용되지만 가드 설치 전에 등록하면 안 됨.
4. 파일 시스템에 닿는 모든 핸들러는 `isPathWithinAnyLibrary` 검증(미디어는 `computeMediaAllowedRoots` + `computeMediaTrustedPaths`). 사용자가 고른 임의 위치(세이브 폴더·표지 원본 등)는 **"방금 고른 경로"** 패턴.
5. 파일을 **실행**하는 동작은 `.exe` 한정(실행 설정) 또는 메인 프로세스 네이티브 확인창(`shell:open-path`). 렌더러가 확인을 대신 누를 수 없게 확인창은 항상 메인에서 띄움.
6. 렌더러는 `window.api.*`만 사용(contextBridge 한 줄, `export type Api = typeof api`). 프리로드는 샌드박스라 런타임 의존성은 번들해야 함(`zod`는 `externalizeDepsPlugin({ exclude: ['zod'] })` — 흰 화면 버그 이력).
7. 커스텀 프로토콜: `thumb://`(폴더 썸네일), `mediathumb://`(미디어/재생목록 썸네일). 경로 `..`는 resolve 후 비교. CSP의 `img-src`/`connect-src`에 두 스킴이 들어 있으므로 새 스킴 추가 시 CSP도 수정.
8. 메인 프로세스의 외부 요청은 `safeFetch`, 받은/고른 이미지 디코딩은 `openRasterImage`(또는 이를 쓰는 `saveCustomCoverImage`)만. 외부 프로세스는 `shell: true` 금지, 인자 배열/환경변수로만 데이터 전달.
9. 새 `BrowserWindow`는 `secureWebPreferences(preloadPath)` 사용, 원격 URL 로드 금지. 새 비밀값 설정은 `SECRET_KEYS`에 추가.
10. 상태 관리 분담: **영속/OS/네트워크 유래 데이터 = TanStack Query**, **일시적 UI 상태 = Zustand**(`src/stores/`: explorer 탭·선택·미디어 플레이어·셔플 순서·되돌리기·라이브러리 표시·제외 다이얼로그·갤러리 딥링크). Explorer 탭만 Zustand + 디바운스 저장 훅으로 SQLite 동기화.
11. 문자열은 `src/i18n/translations.ts`: 한국어 객체가 원본이고 `ja`/`en`은 `Record<keyof typeof ko, string>` → 키 누락 시 타입체크 실패. **예외**: 메인 프로세스 네이티브 확인창 문구(`librariesHandlers.ts`, `shellHandlers.ts`)·메뉴(`menuLocalization.ts`)·창 닫기 프롬프트(`windowCloseBehavior.ts`)는 메인에 ko/ja/en을 직접 둠. 일부 메인 오류 메시지·선택창 필터명('이미지')은 한국어 하드코딩.
12. 렌더링 중 상태 동기화(effect 대신 render 중 비교 후 setState) 패턴이 여러 곳에서 의도적으로 사용됨 — 주석의 근거를 읽고 변경.
13. 메인 tsconfig(`tsconfig.node.json`)는 `electron/**`·`shared/**`만 포함 → 메인에서 `src/` import 불가. 공유 로직은 `shared/`에.

---

## 16. 보안 계층 요약

자세한 위협 모델·수정 이유는 [SECURITY_FIXES.md](SECURITY_FIXES.md), 결과표·잔여 위험은 [SECURITY.md](SECURITY.md).

| 계층 | 구현 위치 |
| --- | --- |
| 렌더러 격리 | `security.ts` `secureWebPreferences`(sandbox, contextIsolation, nodeIntegration off, webviewTag off) |
| 탐색/팝업/webview 차단 | `installWebContentsLockdown` (`isTrustedAppUrl` 외 `will-navigate`/`will-redirect` 차단, `window.open` 거부) |
| 권한 | `installPermissionLockdown` — `clipboard-sanitized-write`만 허용 |
| IPC 발신자 검증 | `installTrustedIpcGuard` |
| CSP | `electron.vite.config.ts` — **프로덕션 빌드에만** 주입: `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: thumb: mediathumb:; font-src 'self' data:; media-src 'none'; connect-src 'self' thumb: mediathumb:; worker/object/frame-src 'none'; base-uri/form-action 'none'` |
| 네트워크 | `net/safeFetch.ts` (§5.1) |
| 이미지 디코딩 | `net/rasterImage.ts` — jpeg/png/webp/gif만, 30MB·5천만 픽셀 상한, `failOn: 'error'` |
| 파일 열기 | `shell/openPathPolicy.ts` + 네이티브 확인창 |
| 라이브러리 루트 | `libraries/libraryPathPolicy.ts` + 확인창 |
| 비밀값 | `database/secretStore.ts` (DPAPI) |
| 패키징 | `package.json build.electronFuses`: runAsNode off, NODE_OPTIONS off, `--inspect` off, cookie 암호화 on, asar에서만 로드 [미검증: 설치본] |
| 공급망 | `CHECKSUMS.sha256` + `npm run verify:binaries`(build/release 선행), `.npmrc audit-level=high`, `npm run audit:prod` |

**아직 막히지 않은 경로(코드 확인)** — §20에 작업으로 정리:
- `SETTINGS_SET`이 값 검증 없이 `locale-emulator-path`를 저장 → 장악된 렌더러가 임의 파일 경로를 넣고 LE 모드 게임을 실행하면 그 파일이 `spawn`됨(`.exe`·라이브러리 검사 우회).
- 같은 이유로 `media-folder`를 임의 경로(예: `C:\`)로 바꾸면 미디어 신뢰 루트가 넓어짐 → 그 아래 파일을 mpv/ffmpeg로 열거나, MP3/FLAC/M4A에 표지 삽입(파일 쓰기) 가능.
- 렌더러가 `file://`로 로드됨, DevTools 메뉴가 프로덕션에도 노출, 경계 검사에 `realpath` 미사용(정션), 스캐너(얕은/재귀)는 경계 검사 없이 임의 폴더 목록을 반환, `detectGameVersion`이 렌더러가 보낸 `identifier.path`로 exe를 탐색(읽기 전용), `libmpv-2.dll`을 상대 이름으로 로드(DLL 검색 순서), 설치 파일 미서명.

---

## 17. 디렉터리 지도

```
electron/main/
  index.ts                 부트스트랩, 메뉴, 트레이, 수명주기 (§13)
  security.ts              창/IPC/권한 잠금
  net/                     safeFetch, rasterImage
  database/                client(DDL), schema, *Repository, secretStore, 마이그레이션, safeJsonParse
  ipc/                     *Handlers.ts (기능별 IPC 19개 + resolveGameEntryKey)
  scanner/                 folderScanner, codeRecognition, thumbnail, concurrencyLimiter
  metadata/                crawl*/parser*/client, bulkCrawlQueue, cacheCoverImage, externalMetadataProvider, __fixtures__/
  launch/                  launchGame, localeEmulator, activeSessions, listExecutables
  save/                    snapshot 생성/목록/복원/diff, 버전 감지/비교, readExeFileVersion
  fileOps/                 rename/move/delete
  media/                   mpvWorker/mpvProcessManager, resolveMediaThumbnail, extract*, lyrics, audioCover, mediaTrustBoundary
  libraries/               libraryPathPolicy
  shell/                   buildExternalUrl, openPathPolicy
  customCover/ cache/
  thumbnailProtocol.ts(isPathWithinAnyLibrary 포함) mediaThumbnailProtocol.ts mediaHardwareKeys.ts
  windowCloseBehavior.ts updater.ts menuLocalization.ts zoomShortcuts.ts subtitlePipBounds.ts
  migrateUserDataFolder.ts normalizeReleaseNotes.ts
electron/preload/index.ts  window.api 정의
electron/native/mpv-addon/ libmpv N-API 애드온 (mpv_addon.cc, libmpv-2.dll + CHECKSUMS.sha256, binding.gyp, TESTING.md, 벤치 스크립트 *.cjs)
scripts/verify-native-binaries.mjs  DLL 해시 검증
shared/                    IPC 타입/스키마, 코드 인식, 경로 정규화, 파일 종류 판별, 오류 메시지 상수
src/
  main.tsx                 진입점 (창 종류 분기, 테마 선적용)
  router.tsx               라우트
  pages/                   라우트 단위 화면 (+ PlayerWindow, SubtitlePip)
  components/{game,layout,media,ui}/
  services/                window.api 래핑 + React Query 훅
  stores/                  Zustand 스토어
  hooks/ lib/              순수 로직 (filterEntries, sortEntries, groupDuplicatesByCode, buildRenamePlan, lrc/vtt/ass 파서 ...)
  i18n/                    translations.ts (ko/ja/en)
docs/                      이 문서, SECURITY*.md, 스크린샷, 검증 결과, UI 개편 인수인계(역사 기록)
```

---

## 18. 개발 · 빌드 · 테스트

| 명령 | 설명 |
| --- | --- |
| `npm ci` | 설치(권장, lockfile 고정). `postinstall`이 better-sqlite3 리빌드 + mpv 애드온 빌드/리빌드 실행(node-gyp·MSVC 필요) |
| `npm run dev` | electron-vite 개발 모드 (CSP 미적용) |
| `npm run build` | `verify:binaries` → electron-vite build → electron-builder (NSIS, `dist/`) |
| `npm run release` | 위와 같고 GitHub에 즉시 발행 (`--publish always`, `GH_TOKEN` 필요) |
| `npm test` | Vitest, node 환경. **141 파일 / 1009 테스트** (src 54, electron 83, shared 4). 렌더러는 순수 함수 위주 + jsdom 렌더 테스트 9개 파일(별점·메모, 세이브 다이얼로그, 툴팁, 일부 훅/서비스). 그 외 UI 변경은 수동 확인 필요 |
| `npm run typecheck` / `lint` / `format:check` | tsc build / ESLint(flat) / Prettier |
| `npm run build:mpv-addon`, `rebuild:mpv-addon` | libmpv 네이티브 애드온 빌드 / Electron ABI 리빌드 — `mpv_addon.cc` 변경 시 필수 |
| `npm run verify:binaries` | `libmpv-2.dll` SHA-256 검증 |
| `npm run audit:prod` | `npm audit --omit=dev --audit-level=high` (의존성 변경 시) |

- Node 버전: `.nvmrc` = 20.
- 스택: Electron 43.8.7, electron-vite 5, Vite 7.3, React 19.2, TypeScript 6(strict), Tailwind v4 + shadcn/ui(Radix), Zustand 5, TanStack Query 5 / Router 1, Drizzle 0.45 + better-sqlite3 13, dnd-kit, react-window 2, framer-motion 12, cheerio, sharp 0.35.5, ffmpeg-static, iconv-lite, electron-updater, zod 4.6.7, sonner, Pretendard 번들 폰트. `overrides`로 undici/seroval/js-yaml 등 하위 의존성 고정.
- 패키징: `extraResources`로 `LOGO.png`, `mpv_addon.node`, `libmpv-2.dll` 동봉, `asarUnpack` 사용. 앱 ID `com.arkmanager.app`.
- 규모: 비테스트 TS/TSX 약 31,000줄, IPC 채널 106개, preload API 함수 약 140개, 번역 키 354개.
- 설계 스펙·구현 계획(`docs/superpowers/`, `.superpowers/`)은 gitignore 대상이고 **현재 작업 폴더에도 없음**. 코드 주석이 이 경로의 문서를 여러 번 인용하지만 열람 불가 → 주석 자체가 유일한 근거.

---

## 19. 버전 이력 요약

| 버전 | 날짜 | 요점 |
| --- | --- | --- |
| 1.0.0/1.0.1 | 2026-08-02 | 정식 공개, 보안 경계 보강, 설치 프로그램·자동 업데이트·릴리스 노트 |
| 1.1.0 | 2026-08-08 | VNDB/Steam/Getchu 통합 검색, VNV/VNR 분리, 트레이, 외부 메타데이터 프로바이더, 오디오 표지 삽입, Explorer 개선 |
| 1.1.1 | 2026-08-09 | 창 닫기 동작 설정 |
| 1.2.0 | 2026-09-10 | libmpv 엔진, EQ, 재생목록/좋아요/사이드바, 자막(vtt/ass)·PIP, ASMR 폴더 재생, UI 전면 개편, 성능 개선, 전체 메타데이터 새로고침 |
| 1.2.1 | 2026-09-11 | 실패한 메타데이터 매 실행 재크롤 중단 |
| 1.2.2 | 2026-09-12 | VNDB 미평가 항목 메타데이터가 매 실행 삭제되던 문제 수정 |
| 1.2.3 | 2026-09-15 | libmpv 전환 후 먹통이던 하드웨어 미디어 키 복구 |
| (미출시) | 2026-11-05 | `security/hardening`: 명령 인젝션 구조 제거, Electron/의존성 상향, 창·IPC·권한 잠금+CSP, SSRF 방지 fetch, 이미지 형식 제한, 위험 파일 열기 확인, 라이브러리 루트 검증, exe 전용 실행, mpv 옵션 강화, API 키 암호화, Fuses, DLL 체크섬. 버전 번호는 아직 1.2.3 |

---

## 20. 앞으로 할 일 (코드 기준 정리, 2026-11-23)

### 20.1 보안 브랜치 마무리 (릴리스 전 필수)
1. **lint 오류 수정**: `eslint.config.js`에 `scripts/**/*.mjs`용 Node globals 추가(현재 `npm run lint` 실패 → SECURITY_FIXES.md "ESLint 오류 0" 기록과 불일치).
2. 미커밋 문서(`docs/SECURITY.md`, `docs/SECURITY_FIXES.md`, 이 문서 등) 커밋.
3. `npm ci` 후 **mpv 애드온 재빌드**(`build:mpv-addon` + `rebuild:mpv-addon`) — 보안 옵션은 재빌드해야 반영.
4. **실앱 수동 점검**(SECURITY.md §2 체크리스트): `npm run dev`에서 동작, `npm run build` 산출물에서 CSP 위반 없음(표지/아이콘/미디어 썸네일/폰트/테마), 라이브러리 추가 3경로(선택창 무확인/입력 확인창/`C:\` 거부), `.exe` 열기 확인창, 미디어 재생·EQ·미디어 키·분리 창·PIP, 클립보드 복사, 설치본의 Fuses·자동 업데이트·mpv 유틸리티 프로세스.
5. 버전 번호 결정(1.2.4 또는 1.3.0), README 업데이트 내역 작성, master 병합.
6. 계정·배포 보호(SECURITY.md §2-3): 2FA, 토큰 재발급, fine-grained `GH_TOKEN`, 가능하면 CI 릴리스. `libmpv-2.dll` 해시를 공식 배포본과 대조.

### 20.2 보안 후속 (코드로 해결 가능)
| 우선 | 작업 | 근거 |
| --- | --- | --- |
| 높음 | `SETTINGS_SET`에 키별 쓰기 검증: `locale-emulator-path`는 picker로 고른 경로만(또는 `LEProc.exe` 파일명 + 존재 확인), `media-folder`는 라이브러리 하위 또는 picker 경로만(ASMR 재생 경로 고려) | §16 |
| 높음 | 렌더러를 `app://` 커스텀 프로토콜로 서빙 + Fuse `grantFileProtocolExtraPrivileges` off | SECURITY.md §3 |
| 중간 | ASAR 무결성 Fuse(설치본으로 `asarUnpack` 상호작용 확인 후) | SECURITY.md §3 |
| 중간 | 경계 검사에 `realpath` 적용(정션/심볼릭 링크 우회) | SECURITY.md §3 |
| 중간 | `ffmpeg-static` 설치 시 다운로드 통제(CI에서 `--ignore-scripts` + 해시 고정) | SECURITY.md §3 |
| 낮음 | 패키징 빌드에서 `toggleDevTools` 메뉴 제거 | SECURITY.md §3 |
| 낮음 | `LoadLibraryA("libmpv-2.dll")` → 전체 경로 + `LoadLibraryExW(LOAD_LIBRARY_SEARCH_*)` | §11.1 |
| 낮음 | `detectGameVersion`의 `identifier.path` 경계 검증, `MPV_RESIZE`의 `parse` → `safeParse` | §15 |
| 외부 | 코드 서명 인증서 확보 후 `win.signtoolOptions`/`publisherName` | SECURITY.md §2-4 |

### 20.3 기능 결함 · 확인 필요 (코드로 확인된 것)
1. **이동/이름변경 시 경로 재키 범위 부족**(§10.1): 하위 항목의 path 키 데이터·override, `launch_config.executablePath`, 게임 폴더 내부 `save_path`, `excluded_entries`, 재생목록 트랙/좋아요/썸네일 override 경로를 접두사 기준으로 함께 갱신해야 함.
2. **일괄 크롤이 외부 프로바이더를 쓰지 않음**(§5.3): `bulkCrawlQueue`에 설정 기반 deps를 넘길지 결정.
3. **BMP 표지 선택 실패**(§7.2): 선택창 필터에서 `bmp` 제거하거나 BMP를 별도 변환. (sharp는 BMP 입력을 지원하지 않음)
4. 게임 `spawn`에 `cwd` 미지정(§8): 작업 폴더를 exe 폴더로 지정해야 하는 게임이 있는지 확인 [추정: 상대 경로 리소스를 쓰는 구형 게임에서 실패 가능].
5. ASMR "재생"이 사용자의 `media-folder`를 덮어씀(§11.6) — 의도된 동작인지 UX 확인.
6. 코드 연동 해제 시 code 키로 옮겨진 데이터는 되돌아오지 않음(§7.1) — 오타 연동 후 해제하면 데이터가 잘못된 코드에 남음.
7. hover-tooltip 테스트의 `act(...)` 경고(통과는 함) 원인 조사.
8. Locale Emulator 인자 사용법 실기 검증.

### 20.4 정리 작업
- `package.json` `description`을 현재 기능에 맞게 수정.
- `/detail` 라우트(`DetailPage`) 제거 여부 결정, `src/pages/DlsiteSearch/` → `GameSearch/`로 이동.
- 코드 주석에 남은 `media://` 프로토콜 언급(제거된 프로토콜) 정리, 존재하지 않는 `docs/superpowers/...` 경로 인용 정리.
- 트레이 메뉴(Open/Exit)·메인 오류 메시지·선택창 필터명 다국어화.
- EQ 밴드 수 5 하드코딩 3곳을 `shared/`로 통합.

### 20.5 README "추후 개발 예정" (사용자 공개 로드맵)
지역 제한 게임 메타데이터 조회 개선 / 미디어 재생기와 Explorer 연동 강화 / 파일명 일괄 변경에 AI 탑재 검토 / Steam API 연동(실행·다운로드·조회, 시기 미정).

---

## 21. 이번 재검증에서 정정한 내용 (구버전 문서 → 코드)

| 구버전 서술 | 실제 코드 |
| --- | --- |
| IPC 채널 약 100개(FEATURES) / 77개(ARCHITECTURE) | **106개** |
| 테스트 파일 약 134개 | **141개 / 1009 테스트** |
| 전체 새로고침 = `game_metadata`에 있는 모든 코드 | + `metadata_failures`에만 있는 코드 |
| RJ/VJ 폴백 체인 ③ external(활성화 시) | 단건 크롤에서만. 일괄/전체 새로고침은 external 미사용 |
| 통합 검색 채널 하나로 "전체" 포함 | 채널 소스는 4개, "전체"는 렌더러 병렬 요청 |
| 플레이어 창/PIP는 해시 라우트 | 라우터 미사용, `main.tsx`에서 해시로 직접 분기 |
| 라이브러리 등록: 경로 존재 검증·중복 에러 | + 금지 경로 정책 + 비선택창 경로 확인창 |
| shell open: 라이브러리 경계 검증 | + 위험 확장자/확장자 없음 네이티브 확인창 |
| 실행: 라이브러리 아래인지 2회 검증 | + `.exe` 확장자 2회 검증 |
| 외부 프로바이더 API 키 평문 | DPAPI 암호화 |
| 커스텀 표지 webp 저장 | 512px 축소 + jpeg/png/webp/gif만(BMP 실패) |
| 캐시 초기화 = 표지·미디어 썸네일 | covers·media-thumbnails·media-remux만, 사용자 지정 캐시 3종 유지 |
| (없음) | 이동 시 재키 한계, `cwd` 미지정, ASMR 재생의 media-folder 덮어쓰기, `Ctrl+Shift+↑` 이동, `SETTINGS_SET` 값 무검증, lint 실패 |
