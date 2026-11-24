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
- 언어: UI는 한국어(원본)/일본어/영어(번역 키 364개, 2026-11-23 `ko` 객체 재집계). 문서·주석·커밋 메시지는 한국어+영어 혼용.
- 사용자 데이터 위치: Electron `userData` (`%APPDATA%/Ark Manager` 계열, 과거 `%APPDATA%/dlibrary`에서 자동 이전). DB 파일명 `ark-manager.db`. 폴더 구조는 §14.1.

### 1.1 현재 브랜치 상태 (2026-11-23)

| 항목 | 상태 |
| --- | --- |
| 브랜치 | `security/hardening` (master `012713b`에서 분기). **아직 master 미병합·미릴리스** |
| 최근 작업 | 2026-11-23: Steam/DLsite 크롤 수정 + §20의 보안·기능 결함 수정(§20.0), 미디어 전체 화면·표지 파이프라인·장면 미리보기 개편(§11.7~11.13, §20.0) |
| `npm test` | ✅ 172 파일 / 1354 테스트 통과 (2026-11-23 최종 리뷰 수정 후; hover-tooltip `act(...)` 경고, §20) |
| `npm run typecheck` | ✅ 통과 |
| `npm run lint` | ✅ 오류 0 (경고 1건 `button.tsx` react-refresh, 기존) |
| `electron-vite build` | ✅ 성공(`out/main/mpvPreviewWorker.js` 포함), 빌드 `index.html`에 CSP 삽입 확인 |
| mpv 애드온 | ✅ 이 PC에서 `build:mpv-addon` 컴파일 + `rebuild:mpv-addon`(Electron ABI) 완료. 새 DLL 로딩은 Node에서 `init()`으로 확인 |
| 실앱(GUI) 검증 | **미실시** (CSP, 미디어 재생, 설치본 Fuses/자동 업데이트, 미디어 탭 임시 루트 버튼). UI 개편 U1~U8, 미디어 전체 화면·음성 화면·장면 미리보기(§20.1 체크리스트)도 시각 검증 미실시 |
| 로컬 환경 주의 | `node_modules/ffmpeg-static/ffmpeg.exe` 없음(과거 `--ignore-scripts` 설치) → 미디어 썸네일 추출 불가. `npm ci`로 복구 |

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
| `ST` | **Steam 공개 스토어 API**(`steamStoreApi.ts`): `IStoreBrowseService/GetItems`(국가 `US`, 영어) → 제목·개발사(없으면 퍼블리셔)·발매일(`steam_release_date`)·표지(`header.jpg`)·사용자 태그(가중치 상위 10개, 이름은 `IStoreService/GetTagList`를 프로세스당 1회 받아 캐시). API 자체가 실패할 때만 기존 HTML 상점 페이지 파싱(연령 쿠키 포함)으로 폴백. API가 "없는 앱"이라고 답하면 그대로 `not_found`. |
| `VNV` | VNDB Kana API `POST https://api.vndb.org/kana/vn` — 제목, 개발사 첫 번째, 발매일, 이미지, 태그(스포일러 0, rating 내림차순 상위 10개)를 장르로 사용 |
| `VNR` | VNDB Kana API `/kana/release` — 제목(없으면 VN 제목), 개발사(producer.developer 우선), 표지는 연결된 VN 이미지, 장르 없음 |
| `GC` | getchu.com 작품 페이지 (`?gc=gc`로 연령 게이트 우회), 응답을 `TextDecoder('euc-jp')`로 디코딩 |
| `RJ/VJ` | **폴백 체인**: ① `dlsite-html`(작품 페이지 파싱) → ② `dlsite-json` → ③ `external`(사용자 설정 외부 API, 활성화 시). ①이 제목은 얻었지만 **장르가 비었거나 서클이 비면** ②로 빈 필드만 채움(`enrichFromJson`). |

- **Steam이 HTML로 안 되는 이유**(2026-11 한국 IP에서 실측): "성인 전용(Adult Only Sexual Content)" 등급은 `/agecheck/app/<id>`로 302 → 다시 **Steam 로그인 페이지**로 보내므로 쿠키로 통과 불가. 한국에서 판매하지 않는 타이틀은 200 "Site Error — This item is currently unavailable in your region". 스토어 API는 국가를 `US`로 지정하면 두 경우 모두 익명으로 응답한다. 일반 "성인/폭력" 등급(Senren＊Banka, DOOM Eternal 등)은 HTML+쿠키로도 됐었음.
- **DLsite 페이지 구조** [확인, 2026-11]: 작품 페이지가 Nuxt 마크업으로 바뀌어 옛 `#work_outline` 표(`th`/`td`)와 `#work_maker`가 사라지고 `.c-productInfo__item`(`dt.c-productInfo__key` / `dd.c-productInfo__value`)이 됨. 제목(`#work_name`)과 `og:image`는 남아 있어서 옛 파서는 **제목·표지만 있고 장르·서클·발매일·작품형식이 빈 결과를 "성공"으로 저장**했음(→ ASMR 판정도 실패). 파서는 두 구조를 모두 읽고(`collectSpecRows`), 서클은 `サークル名`(maniax) 또는 `ブランド名`(pro) 행에서 읽는다.
- **DLsite JSON 소스**: ① `/{maniax|pro}/api/=/product.json?workno=` (전체 레코드: maker_name, genres, custom_genres, work_type, regist_date, image_main 객체) → ② `/product/info/ajax?product_id=` (제목·날짜·work_type만). 예전 ①자리의 `/product.json?workno=`는 404였고, ②가 먼저 시도되어 장르 없는 결과로 끝났음. `custom_genres`는 `lang=ja_JP && is_active=1`인 것만(페이지에 실제 표시되는 것, 예: `Vtuber本人出演作品`).
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
| 상세 사이드바 "메타데이터 새로고침" | 단건 `metadata:crawl-and-save` (실패 기록 지우고 재시도). |
| 메뉴 `File > Refresh All Metadata` | `game_metadata`에 있는 코드 **+ `metadata_failures`에만 있는 코드**(실패 코드를 재시도하는 유일한 방법)를 강제 재크롤(확인 다이얼로그에 개수 표시 + 진행률). `forceEnqueue` |
| 게임 검색 결과 선택 / 코드 수동 연동 | 해당 코드 단건 크롤 후 상세 표시 |

- 모든 트리거가 같은 deps(`metadataHandlers.ts`의 `crawlDepsFromSettings`)로 크롤한다. 외부 프로바이더 설정은 코드마다 새로 읽으므로, 일괄 큐가 도는 중에 설정을 바꿔도 남은 코드부터 반영된다. (이전에는 일괄 큐가 기본 deps를 써서 외부 프로바이더를 전혀 쓰지 않았음.)
- ⚠ **기존 DB의 잘못된 결과는 자동으로 다시 받지 않는다**: 이번 수정 전에 받은 DLsite 항목(장르·서클 빈 행)은 `game_metadata`에 이미 있어서 자동 큐가 건너뛰고, Steam 실패 코드는 `metadata_failures` 때문에 건너뛴다. **File > 전체 메타데이터 새로고침**(또는 항목별 새로고침)을 한 번 실행해야 갱신된다.

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
- 제외한 항목(또는 그 상위 폴더)을 앱에서 이동/이름변경하면 제외 기록도 새 경로로 따라간다(§10.1 재키).

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
- 선택창 필터는 `COVER_IMAGE_EXTENSIONS`(`rasterImage.ts`, png/jpg/jpeg/webp/gif) 한 곳에서 관리(게임 표지·재생목록 표지·미디어 썸네일 공통). 예전에는 `bmp`도 보였지만 sharp가 BMP를 디코딩하지 못해 항상 실패했음 → 제거. (폴더 썸네일 `thumb://`은 디코딩 없이 원본을 보내므로 BMP도 표시됨)
- 코드가 연결된 작품도 변경 가능(1.2.0). 코드 없는 항목은 경로 키로 저장.

---

## 8. 실행 · 플레이타임

- **실행 설정** (`game_user_data.launch_config` JSON): `{ executablePath, launchMode: 'normal' | 'locale-emulator' }`.
  - 실행 파일 후보는 폴더 내 `.exe` 목록(`launch:list-executables`, 라이브러리 밖 폴더는 빈 목록)에서 선택.
  - **Locale Emulator**: `LEProc.exe`를 `ProgramFiles`, `ProgramFiles(x86)`, `%LOCALAPPDATA%\Programs` 아래 깊이 4까지 탐색해 자동 감지. 수동 경로 지정 가능(`locale-emulator-path`): **파일 선택창으로 방금 고른 `.exe`만 저장 가능**(§12.1). 저장된 값이 `.exe`가 아니면 무시하고 자동 감지로 폴백. 미설치 시 에러. LE에 대상 exe 경로를 인자로 넘기는 사용법은 공식 문서로 검증되지 않은 가정(코드 주석) [미검증].
  - 실행: `spawn(command, args, { windowsHide: false, cwd: dirname(executablePath) })` — 셸 없음, **작업 폴더 = 게임 exe 폴더**(바로가기/탐색기 실행과 같음, LE 모드도 동일하게 지정). 프로세스 `exit` 시점에 `sessionMs` 기록.
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
- **키 재매핑** (`database/rekeyMovedPath.ts`, 한 트랜잭션): 이름변경/이동이 성공하면 옮긴 경로 **자신과 그 하위 전체**(대소문자·구분자 무시, `Circle2`처럼 접두 문자열만 같은 형제는 제외)에 대해
  - 키로 쓰는 경로: `game_user_data`(path 키), `path_code_overrides`, `excluded_entries`(정규화 키), `media_playlist_tracks`, `media_track_likes`, `media_thumbnail_overrides`(원본 경로)
  - 행 안에 저장된 절대경로: **모든** `game_user_data` 행(코드 키 포함)의 `launch_config.executablePath`와 `save_path`
  를 새 위치로 바꾼다. 목적지에 같은 키가 이미 있으면 덮어씀. (예전 `rekeyPath`/`rekeyPathCodeOverride`는 정확히 같은 경로의 행만 옮겨, 폴더 이동 시 하위 데이터가 남고 코드 게임의 실행 설정이 깨졌음 — 제거됨)
  - 앱 밖(Windows 탐색기 등)에서 옮긴 경우는 감지하지 않는다.
- 경계 검증: 이름변경/이동/삭제/썸네일/실행/열기는 메인에서 **등록 라이브러리 아래인지** 확인(`isPathWithinAnyLibrary`, 위치는 `electron/main/thumbnailProtocol.ts`; `path.resolve`로 `..` 정리 후 비교; 라이브러리 밖이면 "허용되지 않은 경로입니다."). `realpath`는 쓰지 않음(정션 우회 가능성, §16).

---

## 11. 미디어 플레이어

### 11.1 구성
- **미디어 페이지**(`/media`): 설정된 미디어 폴더(`media-folder`) 탐색 — 폴더별 보기, 브레드크럼, 뒤로/앞으로(`mediaBrowseHistory`), 목록/그리드 전환(`media-view-mode`) + 줌 슬라이더, 썸네일 지연 로딩.
- **재생 엔진**: **libmpv 네이티브 애드온**(`electron/native/mpv-addon`, N-API) 을 Electron **utilityProcess**(`mpvWorker.ts`, 빌드 시 별도 엔트리로 출력)에서 실행 → 크래시가 앱 전체로 번지지 않음, 크래시 시 재생성. 비디오는 **SW 렌더 프레임을 MessagePort로 렌더러 `<canvas>`에 전달**(영상일 때만 프레임 루프, 오디오는 250ms 이벤트 폴링), 오디오는 워커 안에서 직접 출력. 상태(`mpv:state-update`: isPlaying/currentTime/duration/error)와 `mpv:ended`(keep-open 일시정지 감지)를 메인이 호스트 창으로 중계. `hwdec=auto`.
- **mpv 보안 옵션**(보안 브랜치, **애드온 재빌드 필요**): `access-references/load-unsafe-playlists/ytdl/load-scripts/config/audio-file-auto/input-default-bindings/input-vo-keyboard/osc = no`. 앱이 자막을 직접 그리므로 `sub-auto=no`, `sid=no`. `MPV_LOAD`는 경계 검증 후 **`path.resolve`한 절대경로**만 mpv에 전달.
- DLL 로딩: 애드온이 자기 `.node` 위치에서 `<addonDir>/libmpv-2.dll` **절대경로**를 계산해 `LoadLibraryExW(..., LOAD_WITH_ALTERED_SEARCH_PATH)`로 로드(`LoadLibmpvNextToAddon`, dev·패키징 레이아웃 동일: `mpv-addon/libmpv-2.dll` + `mpv-addon/build/Release/mpv_addon.node`). 작업 폴더에 심은 동명 DLL이 먼저 로드되는 검색 순서 문제를 막음. 워커의 `PATH` 추가는 구버전 애드온용 폴백으로만 남김. `libmpv-2.dll`은 `CHECKSUMS.sha256`로 빌드 전 검증.
- **UI 형태 3가지**: ① 하단 도킹 바(2단: 곡 정보 / 조작부, `MediaTransportBar` `variant: 'default'`) ② 전체화면 오버레이(`FullscreenMediaOverlay`, 메인 창 위에 `fixed inset-0`; 열린 미디어 사이드바와 화면 분할) ③ **별도 플레이어 창**(`#/player-window`, `PlayerWindowPage`). ②와 ③은 **같은 공용 화면 `FullscreenPlayerView` + 위/아래 조작 띠 `PlayerControlBands`**를 쓴다(§11.7). 창 간 상태는 메인 프로세스를 중계자로 한 `media:state-broadcast`/`media:state-sync`(변경된 상태만, `currentTime`/`duration`은 제외) + 새 창의 pull(`media:request-state-sync`). 호스트 전환은 `mpv:become-host`(재생 중단 없이 프레임 수신 창만 변경).
- **재생 기능**: 재생/일시정지, 시크, 볼륨(영속 `media-volume`), 음소거, 반복 모드(끔/전체/한 곡), **셔플**(켜는 시점에 Fisher-Yates로 1회 순서 생성, 이후 포인터만 이동; 재생목록 길이가 바뀌면 재생성), 큐 관리, 단일 파일 재생은 **큐를 지우지 않고 추가**.
- **5밴드 EQ**: 60/230/910/3000/14000Hz, ±12dB, 프리셋(Flat / Bass boost[6,4,0,0,0] / Vocal boost[-2,0,4,3,0] / Treble boost[0,0,0,3,6]), 설정 영속(`media-equalizer-bands`, JSON 길이 5·범위 검증, 손상 시 무시). 재적용은 메인이 워커의 `init-ok` 시점에 수행(콜드 스타트·크래시 재생성·분리 창 모두 커버). 밴드 수 5는 `settingsHandlers.ts`·`equalizerPresets.ts`·`mpv_addon.cc` 세 곳이 **수동 동기화**.
- **키보드 단축키**(판정은 `mediaKeyboard.ts`): `←/→` 5초 시크(호스트 창만), `↑/↓` 볼륨 ±5%, `Space` 재생/일시정지(버튼 포커스 중엔 제외) — `useMediaPlayback.ts`에서 **bubble 단계**로 처리(요소 핸들러의 `defaultPrevented`를 존중하기 위해). 전체 화면용 `F`/`Esc`는 별도로 **capture 단계**(`useFullscreenKeys`, §11.9). 텍스트 입력 중, `Ctrl/Alt/Meta` 조합, 다른 핸들러가 이미 `preventDefault`한 키는 무시. 시크바·볼륨 슬라이더(`input[type=range]`)에 포커스가 있어도 같은 단축키로 동작(예전엔 슬라이더 클릭 후 `←/→`가 1초 이동·`Space` 무반응으로 바뀌었음).
- **시크 대기**: mpv 시크는 비동기라 워커가 착지 전까지 옛 위치를 보고함 → 시크 목표를 `pendingSeek`로 기억하고, 보고 위치가 목표 ±1초 안에 들거나 1.5초가 지날 때까지 옛 위치 보고를 무시. 연속 `←/→`는 대기 중인 목표에서 이어서 계산(예전엔 빠르게/길게 누르면 뒤로 튀거나 제자리였음).
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

### 11.5 미디어 썸네일·표지 (`mediathumb://`)
- 호스트 3개: `thumbnail`(긴 변 **512px**, 목록·그리드·대기열), `cover`(긴 변 **2048px**, 전체 화면 음성 화면), `playlist-cover`. 그 밖의 호스트는 404. 경로는 URL의 pathname만 해석하고 `?v=<version>`(캐시 무효화용 쿼리)은 무시. `thumbnail`/`cover`는 같은 신뢰 경계(§11.3)를 적용해 경계 밖이면 404.
- 해결 순서(`resolveMediaArtwork`, `media/resolveMediaThumbnail.ts`): 수동 override(`media_thumbnail_overrides`, 파일은 `cache/media-thumbnail-overrides/`; `cover` 호스트는 옆의 `<key>.large.webp`가 있으면 그것, 없으면 512px 파일) → 자동 캐시 → **소스 탐색**. 소스 탐색은 **오디오**: 내장 표지(ffmpeg-static 추출) → 같은 폴더 이미지 → **작품 표지**(§11.11); **영상**: 프레임 추출만(폴더 이미지·작품 표지 단계 없음). ffmpeg는 `execFile`+인자 배열, 동시 **2개** 제한, 같은 파일 요청 병합, 15초 타임아웃. 없으면 `.notfound` 마커로 **네거티브 캐시**(영구 오류가 아닌 일시 실패는 기록하지 않음).
- 한 번의 디코딩(`openRasterImage`)으로 512px·2048px webp와 강조색·비율 JSON을 함께 만든다. 이미지 디코딩은 항상 `rasterImage.ts` 경유.
- 캐시 초기화는 `covers`·`media-thumbnails`·**`media-covers`**·(레거시)`media-remux`만 지움(초기화 직후 작품 표지 세대를 올려 열려 있는 화면이 다시 받게 함). `custom-covers`·`media-thumbnail-overrides`·`playlist-covers`는 사용자 선택이라 유지.
- **오디오 표지 삽입**(MP3/FLAC/M4A, `audioCover.ts`): 백업(고유명, exclusive) → 임시 파일에 삽입 → 재생 가능·디코딩 검증 → 원본 교체 → 재검증 → 둘 다 통과해야 백업 삭제. 실패 시 복원하고 SHA-256 일치할 때만 백업 삭제. 실패한 복구 백업은 UI에 노출. 삽입 성공 시 해당 곡의 표지 캐시 4종(512px·`.notfound`·2048px·JSON)을 함께 무효화(§11.11; 예전엔 `.webp`만 지워 `.notfound`가 남았음). WAV 등 삽입 불가 형식은 앱 내부 override로 저장.

### 11.6 ASMR/음성/음악/영상 작품 연동
- 크롤된 `work_type`이 `SOU`/`MOV`/`MUS`이고 **폴더**이며 코드가 있으면(`isAsmrPlayableFolder`) → "실행" 대신 **"재생"** 버튼, 실행 설정·세이브 UI 숨김. 라이브러리/탐색기/상세 어디서든 진입(`usePlayAsmrFolder`).
- 동작 (`usePlayAsmrFolder` + `src/lib/mediaBrowseRoot.ts`): **저장된 `media-folder` 설정은 바꾸지 않는다.** 작품 폴더가 저장된 미디어 폴더 안이면 그 루트에서 해당 폴더로 이동만 하고, 밖이면 **세션 전용 임시 루트**(`mediaPlayerStore.temporaryMediaRoot`, 미저장)로 연다. 미디어 탭에 "저장된 미디어 폴더로"/"이 폴더를 미디어 폴더로 저장" 버튼이 나타나고, 폴더 선택으로 새 폴더를 고르면 임시 루트는 해제. 미디어 페이지와 사이드바 폴더 트리는 `useMediaBrowseRoot()`로 같은 루트를 본다. 이후 루트에 미디어 파일이 있으면 즉시 재생, 하위 폴더뿐이면 `/media`로 이동만. (예전에는 재생할 때마다 사용자가 고른 미디어 폴더를 덮어썼음)

### 11.7 전체 화면 구조 (오버레이 · 분리 창 공용)
- `FullscreenPlayerView`(`src/components/media/`)가 영상/음성 화면과 조작 띠를 모두 그린다. `FullscreenMediaOverlay`는 얇은 래퍼(사이드바 분할·큐 탭 ☰·`mediaFullscreenBarHeight` 보고만 담당), `PlayerWindowPage`는 `mode="detached"`로 쓴다. 루트는 `useRef`로 항상 렌더되고 오버레이는 CSS `hidden`으로만 숨김(`<canvas>` 노드가 바뀌면 프레임 수신이 끊기므로).
- **영상**: `<canvas>`가 화면 전체(띠가 캔버스 위에 겹침, 예전엔 캔버스가 바 위에서 끝났음). 캔버스 **더블클릭 = 모니터 전체 화면 토글**.
- **위 띠**: 제목(`playback.title || track.name`, §11.12). 오버레이에서만 분리(⤡)·최소화(⊟) 버튼. 분리 창에는 둘 다 없음.
- **아래 띠**(`PlayerControlBands`, 위/아래 그라데이션): 좌측 재생(강조색 원형)·이전·다음·음소거+볼륨·`현재 / 전체`, 우측 반복·셔플·가사·EQ·좋아요·자막 PIP·☰·⛶. 분리 창에도 좋아요·자막 PIP 버튼이 있다(PIP 열림 상태는 창 로컬이고 메인이 다시 방송하면 보정). 조작부 마크업은 `MediaTransportBar`와 공유(`variant: 'band'`, 로직은 갈라지지 않음).
- **☰**: 오버레이에서는 메인 창 미디어 사이드바(큐 탭)를 여닫고, **분리 창에서는 오른쪽 288px 패널**(`MediaPlaylistPanel`)을 여닫는다. 예전 분리 창은 재생목록이 하단에 항상 붙어 있었지만 지금은 **기본 닫힘**이고, 열려 있는 동안 띠를 숨기지 않는다. 사이드바는 하단 띠의 측정된 높이(숨겨도 레이아웃은 그대로라 변하지 않음) 위에 붙는다.
- **가사 오버레이**: 띠가 보이면 띠 바로 위, 숨으면 하단 24px로 내려온다(200ms 전환).
- 메인 창이 모니터 전체 화면이어도 사이드바 등은 오버레이 밑에 그대로 있다(별도 레이아웃 변경 없음).

### 11.8 자동 숨김 (`useAutoHideControls` + 순수 판정 `autoHide.ts`/`playerView.ts`)
- 영상·음성 공통, 오버레이·분리 창 모두. **2초** 동안 활동이 없으면 위/아래 띠가 fade out(200ms, `opacity-0 pointer-events-none` — 숨은 띠가 포인터를 가로채지 않음)하고 **커서도 숨김**(루트 `cursor: none`). 숨는 동안 하단에 **2px 진행선**(`--media-accent`, 기본 `hsl(var(--primary))`)이 남는다.
- **활동**: 루트의 `pointermove`(좌표가 직전과 **다를 때만** — 띠가 사라지거나 커서 스타일이 바뀔 때 Chromium이 제자리에 쏘는 합성 `pointermove`는 무시)·`pointerdown`·`wheel`, 창의 `keydown`(`F`/`Esc` 포함).
- **띠를 숨기지 않는 경우(hold)**: 일시정지 중 / 포인터가 띠 위 / 시크·볼륨 슬라이더 드래그 중 / EQ 팝오버 열림 / 사이드바(메인 미디어 사이드바 또는 분리 창 ☰ 패널) 열림 / **키보드 포커스**가 띠 안(`:focus-visible`만 인정 — 마우스 클릭 뒤 남은 포커스가 띠를 영구히 붙잡지 않도록. `:focus-visible` 미지원이면 키보드 포커스로 간주). 마지막 hold가 풀리면 그 순간부터 2초를 다시 센다. 오버레이가 비활성(숨김)이 되면 hover/focus/드래그 hold를 초기화한다(`display:none`은 pointerleave/blur를 쏘지 않으므로).
- 훅 시그니처는 `useAutoHideControls({ enabled, hold, rootRef })`. `rootRef`는 `enabled`가 true가 되기 전에 마운트돼 있어야 하고 안정적인 `useRef`여야 한다(리스너 effect가 `rootRef` 정체성에 의존).

### 11.9 모니터 전체 화면 · 키 우선순위
- **진입/해제**: ⛶ 버튼 / `F` / 영상 더블클릭이 토글, `Esc`가 해제(**모니터 전체 화면일 때만** 처리하고 아니면 소비하지 않음). `F`는 오버레이가 보이는 동안만. 텍스트 입력 중·`Ctrl/Alt/Meta` 조합은 제외하고 슬라이더 포커스에서는 동작. 키 자동 반복은 소비하되 동작하지 않음(`F` 길게 눌러도 깜빡이지 않음).
- **IPC**: `window:set-fullscreen`(invoke, `{fullscreen, reason: 'media-toggle' | 'media-flip' | 'media-release'}` → `{fullscreen, owner}`) → 호출한 창(`BrowserWindow.fromWebContents`)의 `setFullScreen`. 상태 변화는 `enter-full-screen`/`leave-full-screen` 이벤트로 그 창에 `window:fullscreen-changed`(`{fullscreen, owner}`)를 push(F11·OS 등 다른 경로도 반영). 창마다 컨트롤러 하나(`windowFullscreenOwner.ts`; 메인 창은 `index.ts`, 분리 창은 `mediaWindowHandlers.ts`에서 부착). 렌더러는 `useWindowFullscreen()`(`fullscreen`, `owner`, `toggle`, `release`).
- **소유자 추적** `owner: 'media' | 'user' | null`: 미디어가 `setFullScreen(true)`를 요청한 직후의 enter 이벤트만 `media`로 귀속(요청이 거부되면 즉시, 이벤트가 안 오면 1초 뒤 대기 플래그 해제 — 이후 사용자의 F11이 media로 오귀속되지 않도록). 메뉴의 F11(`togglefullscreen`)로 켠 것은 `user`.
- **새로고침·렌더러 종료**: mpv를 호스팅하는 창이 새로고침(메인 프레임 이동)되거나 렌더러가 죽으면 `stopPlaybackWhenRendererResets`가 mpv 워커를 종료한다(스토어·재생 바는 초기화되는데 소리만 남는 상태 방지). 다음 재생 때 워커가 다시 뜬다. 분리 창이 호스트면 메인 창 새로고침은 영향 없음.
- **해제 규칙**: `media-release`는 `owner === 'media'`일 때만 실제로 끈다 — ⊟ 최소화(해제 후 최소화), 분리(⤡), 재생 중단·재생목록 비움(`MediaPlayerHost`와 `PlayerWindowPage`의 effect)·마지막 곡 자연 종료(`useMediaPlayback`의 `ended` 처리). 사용자가 F11로 켠 것은 이 경로들에서 유지된다. 반대로 UI 토글(⛶/`F`/`Esc`/더블클릭)은 `media-flip`으로 보내며 누가 켰든 끈다 — 메인 프로세스가 보낸 `fullscreen` 값을 무시하고 창의 실제 상태를 뒤집는다. `media-toggle`은 `fullscreen` 값을 그대로 따르는 명시적 진입/해제 요청(소유자 무관하게 끔)으로 스키마에 남아 있으나 현재 렌더러는 쓰지 않는다. 분리 시 새 창은 창 모드로 열리고, 분리 창이 전체 화면인 채 닫혀도 메인 창 상태는 바뀌지 않는다. 훅은 마운트 시 `window:get-fullscreen`으로 실제 상태·소유자를 읽는다(그 사이 push가 먼저 오면 push가 우선). 토글(`⛶`/`F`/더블클릭)은 `reason: 'media-flip'`으로 보내 메인 프로세스가 창의 실제 상태를 기준으로 뒤집으므로, 초기 조회가 끝나기 전의 첫 조작도 맞게 동작한다(그 짧은 구간의 `Esc`만 가로채지 않음). `get-cover-info`는 해결 중 버전이 바뀌면(최대 3회) 다시 해결하고, 해결이 실패한 경로에서도 사용자 지정 표지를 다시 확인한다. 마지막 곡이 자연 종료돼 큐가 끝나면(`next()`가 재생을 멈춘 채 현재 곡 유지) `useMediaPlayback`의 `ended` 처리가 `media-release`를 보내 미디어가 켠 전체 화면을 푼다.
- **키 우선순위**: `F`/`Esc`는 `window`에 **capture 단계**로 등록한 `useFullscreenKeys`가 먼저 받아 `preventDefault()` + `stopImmediatePropagation()`으로 소비 → 이후 bubble 리스너(`DetailSidebar`의 `Esc` 닫기, `useFavoriteShortcut`의 `F`)에 도달하지 않는다. 방어로 두 핸들러도 `shouldYieldKeyToMediaOverlay`로 `defaultPrevented`이거나 미디어 오버레이가 보이는 중(`mediaExpanded && !isDetached`)이면 무시. 화살표·`Space`는 bubble 유지. 최소화(도킹 바) 상태에서는 `F`/`Esc`를 가져가지 않는다.

### 11.10 음성 화면 (`AudioArtworkView`)
- **기본 배치(시안 C)**: 배경은 같은 곡의 512px 썸네일을 `blur(40px)`로 깔고 어둡게 덮은 것. 띠 위 영역에 왼쪽 표지 + 오른쪽 `NOW PLAYING` 라벨·제목(최대 3줄)·파일명(최대 2줄). 표지는 **원래 비율**(`coverBoxSize`: 높이 ≤ 화면의 2/3, 너비 ≤ 45%; 창 폭 520px 미만이면 세로로 쌓고 한도 0.5/0.8)이고 2048px 이미지를 쓴다. 표지 상자는 하단 띠 위 영역 기준으로 맞춘다.
- **확대**: 표지 버튼(`aria-label` = 확대/축소, 줌 커서 — 띠가 숨으면 `cursor-none`)을 누르면 표지가 화면에 꽉 맞게(잘림 없음) 커지고, 제목·파일명은 어두운 반투명 하단 띠 안으로 옮겨진다. 포커스는 바뀐 버튼으로 이어진다. 상태 `coverExpanded`는 `mediaPlayerStore`에 있으며 **창 로컬**(`mediaSyncState`의 허용 목록에 없어 창 간 동기화되지 않음)이고 곡이 바뀌어도 유지된다(표지 없는 곡에서는 무시하되 값은 보존).
- **표지 없음**: 남색 라디얼 배경 + 음표 아이콘 사각형(클릭 불가), 강조색은 앱 primary. 표지 정보 조회 중(pending)에는 직전 곡의 배치·강조색·띠 높이를 유지해 화면이 흔들리지 않고(이미지는 현재 곡 것만 표시), 이미지 로딩 오류는 표지 없음으로 처리하며 곡/버전이 바뀌면 재시도.
- **강조색**: 표지에서 뽑은 색을 `--media-accent`로 루트에 설정(재생 버튼·슬라이더·2px 진행선에 적용), 밝은 색이면 재생 아이콘을 어두운 색으로(`--media-accent-foreground`, `accentForeground` 상대 휘도 0.4 기준). 영상·표지 없는 곡은 앱 primary.

### 11.11 표지 파이프라인 (메인 `electron/main/media/`)
- **캐시 파일(곡당 4개)**: `cache/media-thumbnails/<key>.webp`(512px) + `<key>.webp.notfound`, `cache/media-covers/<key>.webp`(2048px) + `<key>.json`(`source: embedded|folder|work-cover`, `workCoverGeneration`, `accent`, `aspectRatio`). 강조색은 sharp `stats().dominant`를 HSL로 보정(명도 0.45~0.70, 채도 최소 0.35 — `accentColor.ts`). 작품 표지 세대는 `cache/media-covers/work-cover-generation.json`(`{generation}`, 없거나 손상 시 1)에 저장(설계 스펙은 settings 테이블을 말했지만 코드는 파일).
- **무효화**: 곡 단위(표지 삽입 성공, 미디어 썸네일 override 설정/해제) → `invalidateTrack` = 곡별 세대 +1 후 4개 파일 삭제. 작품 단위(크롤로 `cover_image_path` 저장[단건·일괄], 게임 사용자 표지 설정/해제, 코드 수동 연동/해제, 캐시 초기화) → `bumpWorkCover` = 작품 표지 세대 +1(파일은 안 지움; `.notfound`·`work-cover` 출처 캐시는 기록된 세대가 현재보다 작으면 없는 것으로 보고 다시 해결). 둘 다 `mediaArtworkServices.ts`가 유일한 진입점이며 영속 실패해도 알림은 항상 보낸다(이미 커밋된 작업이 실패처럼 보이지 않도록).
- **경쟁 방지**: 비동기 해결(ffmpeg·sharp)이 무효화와 겹쳐도 옛 결과를 되살리지 못하게 해결 작업이 시작 시 `(곡 세대, 작품 세대)` 스냅샷을 잡고, **곡별 직렬 잠금** 안에서 세대를 다시 비교한 뒤 임시 파일을 rename으로 커밋한다(다르면 임시 파일만 지우고 'stale' → 현재 세대로 다시 해결). 무효화도 같은 잠금 안에서 세대 증가+삭제를 끝낸다. 4개 파일은 한 묶음으로 커밋/롤백. 진행 중 요청 공유 키에도 두 세대가 들어간다. 곡별 잠금 키는 `filePath` 문자열 그대로라 호출자는 같은 경로 문자열을 써야 한다.
- **작품 표지 대체**(오디오만, `workCoverLookup.ts`): 파일의 부모 폴더부터 **파일을 포함하는 가장 바깥 허용 루트(그 루트 폴더 자신 포함, 그 위로는 안 올라감)**까지, 가까운 폴더부터: 코드 = `path_code_overrides` → 폴더명 `extractCode`. 폴더마다 ① 사용자 지정 게임 표지(`game_user_data.custom_cover_path`, 키는 `resolveGameEntryKey` 규칙 — 코드가 없어도 항상 확인) → ② 코드가 있을 때만 크롤 표지(`game_metadata.cover_image_path`). 파일이 실제로 있을 때만 채택. 허용 루트에 속하지 않고 정확한 경로로만 신뢰되는 트랙(재생목록/좋아요)은 이 단계가 null. 코드 종류는 RJ/VJ에 한정하지 않음. 조회 실패(reject)는 "표지 없음".
- **사용자 override**: 새로 지정하면 512px 파일 옆에 `<key>.large.webp`(2048px, 최선 노력)도 저장하고 이전 것은 먼저 지운다. 예전 override는 512px뿐이라 `cover`/`get-cover-info`가 그것을 그대로 쓴다(흐림). `get-cover-info`는 override가 있으면 그 파일에서 강조색·비율을 읽는다.
- **렌더러 조회**: `media:get-cover-info`(경로 → `{hasCover, accent, aspectRatio, version}`, `version = "<곡 세대>-<작품 세대>"`). 신뢰 경계 밖이면 던지지 않고 **트랙이 신뢰되지만 표지 없는 경우와 같은 모양**(`hasCover:false`, `accent`/`aspectRatio` null)으로 응답. `AudioArtworkView`(전체 화면 음성 화면)는 `buildMediaThumbnailUrl(path, version)`/`buildMediaCoverUrl(path, version)`으로 `?v=`를 붙여 브라우저 이미지 캐시를 깬다(도킹 바·큐·재생목록 행·MediaSession artwork는 버전 없는 URL — §20.6). 변경은 `media:artwork-changed`(`{filePath | null}`; null = 모든 작품 표지) push로 알리고 `useMediaCoverInfo`가 쿼리를 무효화한다(훅마다 리스너 1개).

### 11.12 재생 상태 필드 (제목 · 세대 · 로드된 경로)
- `mpv:state-update`에 `mediaTitle`(mpv `media-title`, 애드온이 observe로 캐시한 값 — 렌더 스레드 제약상 동기 `get_property` 금지), `loadGeneration`(메인 `mpvProcessManager`가 `loadFile`마다 +1), `loadedPath`(그 로드의 요청 경로)가 추가됐다. 세대/경로는 **메인이 로드 때 워커에 넘기고 워커가 모든 상태 메시지에 그대로 실어** 보낸다(릴레이 시점에 붙이면 "새 세대 + 옛 제목" 조합이 생기므로). 식별 정보가 없는 메시지는 0/null(채택 불가).
- 렌더러(`useMediaPlayback`)는 `state.loadedPath === 현재 곡 경로`일 때만 `mediaTitle`/`loadGeneration`/`loadedPath`를 채택하고(`shouldAdoptLoadIdentity`), 곡이 바뀌면 즉시 null로 되돌린다. 표시 제목은 `displayTitle`: `mediaTitle`이 파일명과 같으면(태그 없음) 확장자 뺀 파일명. `mpv:ended`도 같은 식별 정보(`{loadGeneration, loadedPath}`, `MpvEndedPayload`)를 워커가 싣고 메인이 그대로 릴레이한다. 렌더러는 `loadedPath`가 null이 아니고 현재 곡 경로와 다르면 그 `ended`를 버린다(`shouldHandleEnded`) — 이전 곡이 끝나는 순간 사용자가 다음/이전 곡을 누른 경우 새 곡을 건너뛰거나(한 곡 반복이면 0초로 되감기) 하지 않도록.

### 11.13 재생 바 장면 미리보기 (영상)
- 영상 시크바에 마우스를 올리면 해당 시각의 장면(240×135)과 시간을 카드(`SeekPreviewCard`, `pointer-events: none`, 창 가장자리 8px 안으로 클램프, 640px 미만 창은 192px)로 표시. 도킹 바·전체 화면 띠·분리 창 공통. 시크 thumb 드래그 중에는 바 밖으로 나가도 따라간다. 오디오나 길이를 모르는 영상은 카드 없음.
- **렌더러**(`seekPreview.ts`, `useSeekPreview.ts`): 시각을 버킷(`max(1초, 길이/200)`)으로 양자화, 곡별 LRU 캐시(최대 300장, 곡이 바뀌면 비움), 동시 요청 1개(응답이 오면 가장 최근 호버 버킷 요청). **미리보기 세대**는 위 `loadGeneration`을 채택 규칙대로 받은 값이고 곡이 바뀌면 `null` — `null`인 동안은 요청도 표시도 없이 시간 알약만 보인다. 그리는 것은 저장된 프레임의 버킷·곡 경로·세대가 모두 현재 호버와 같을 때만. 응답이 `null`/오류면 그 버킷은 포인터가 다른 버킷으로 갈 때까지 재시도하지 않으므로 **`null` = 미리보기 없음**(시간 툴팁만, 루프 없음). 분리 창이 열려 호스트가 아니게 된 메인 창은 상태 업데이트를 더 받지 않지만, `useMediaPlayback`은 세대를 **곡이 바뀔 때만** null로 되돌리므로(호스트 해제 시에는 아님) 마지막으로 채택한 세대를 그대로 갖고 있다. 분리 창이 같은 파일을 다시 `load`해도 메인은 같은 경로면 세대를 올리지 않으므로, 메인 창 도킹 바도 그 세대가 현재 로드와 같은 동안(다음 곡이 로드될 때까지)은 프레임을 요청·표시한다. 곡이 바뀌면 메인 창은 세대가 null이 되고 호스트가 아니라 새 세대를 받지 못해 시간 알약만 나온다.
- **IPC** `mpv:preview-frame`(invoke): 요청 `{seconds, generation, requestId}`(Zod `.strict()` — `path`를 끼워 넣으면 **거부**), 응답 `{generation, requestId, seconds, width: 240, height: 135, data: Uint8Array(RGBA 129,600B)} | null`(`seconds`는 요청 값 그대로 = 버킷 시작). **경로는 IPC에 실리지 않는다** — 메인이 `mpvProcessManager.getCurrentLoadedPath()`(이미 경계 검증·resolve된 현재 재생 파일)에서 얻고, 요청 `generation`이 `getLoadState().generation`과 다르거나 현재 파일이 영상이 아니거나 로드된 게 없으면 `null`(큐에서 나올 때와 워커 응답 뒤에도 다시 검사).
- **두 번째 mpv**(`mpvPreviewWorker.ts` utilityProcess + `mpvPreviewManager.ts` + 순수 상태기계 `mpvPreviewSession.ts` + `previewQueue.ts`): 같은 애드온을 `init(path, 240, 135, 'no', {preview: true})`로 — `ao=null, aid=no, pause=yes, hr-seek=no, cache=no, demuxer-readahead-secs=0, hwdec=no, vd-lavc-threads=2`(애드온은 이 5번째 인자에서 `preview === true`만 읽고 임의 옵션 통로 없음). 요청 흐름: 로드(`file-loaded` + 초기 `playback-restart` 대기, 3초) → `seek(t, 'keyframes')` → **대기 중 4ms마다 `renderFrame`을 호출**하고 `playback-restart` 이후 첫 성공 프레임을 반환(800ms 초과 시 `null`). 실측 **중앙값 약 27ms**(`playback-restart` 뒤에만 렌더하면 약 230ms — 시크 대기 중 렌더가 계약).
- **큐/수명**: 진행 1 + 대기 1(새 요청이 대기 중인 것을 `null`로 교체, 진행 중인 것은 중단 안 함). 첫 요청에 지연 생성, 요청 없이 **60초**면 종료(`shutdown` 후 2초 유예 뒤 kill; 워커는 `process.exit(0)`), 앱 종료 시 정리. 작업 6초 무응답이면 kill(크래시로 계산, 대기 작업은 새 워커로), **60초 안에 3회 비정상 종료면 이번 실행 동안 끔**(`null`). 시크 실패/타임아웃 뒤에는 `loadedPath`를 비워 다음 요청이 `loadFile`로 재로드(늦게 온 `playback-restart`가 다음 요청에 섞이지 않도록). 크기가 240×135×4가 아닌 프레임은 폐기. 본 mpv 크래시 시 현재 경로가 비워져 다음 로드까지 `null`. 워커는 `setPause`/`setVolume`을 호출하지 않아 소리가 나지 않는다.
- 패키징은 기존 `files: out/**/*` + `extraResources`가 그대로 포함(`MPV_ADDON_DIR` 해석이 본 워커와 같음). 빌드 엔트리는 `electron.vite.config.ts`의 세 번째 main 엔트리.

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
- **쓰기(`SETTINGS_SET`)**: 대부분 키는 값 그대로 저장. 권한이 걸린 두 키만 `assertSettingWriteAllowed`로 검증(빈 문자열 = 초기화는 항상 허용):
  - `locale-emulator-path`: `.exe`이고 **`launch:pick-locale-emulator-path`가 방금 반환한 경로**일 때만(1회용).
  - `media-folder`: 등록 라이브러리 하위이거나 **`libraries:pick-folder`가 방금 반환한 경로**일 때만(1회용).
  - 1회용 슬롯은 `electron/main/ipc/pickedPaths.ts`(선택창을 여는 핸들러와 값을 저장하는 핸들러가 다를 때 공유).
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
    media-thumbnails/          미디어 자동 썸네일 512px + *.notfound (캐시 초기화 대상)
    media-covers/              미디어 큰 표지 2048px + 강조색·비율 JSON + work-cover-generation.json (캐시 초기화 대상)
    media-remux/               레거시, 캐시 초기화 시 정리만
    custom-covers/             사용자 지정 게임 표지 (유지)
    media-thumbnail-overrides/ 사용자 지정 미디어 썸네일 512px + <key>.large.webp 2048px 사본(새 지정분) (유지)
    playlist-covers/           재생목록 표지 (유지)
  saves/<safeKey>/<timestamp>/ 세이브 스냅샷 (선택적으로만 삭제)
```
주의: Windows에서 `cache/`는 Chromium 자체 `Cache` 폴더와 같은 물리 폴더(대소문자 무시)이므로 `cache/` 전체 삭제 금지.

---

## 15. IPC · 신뢰 경계 규칙 (작업 시 반드시 지킬 것)

1. **채널 정의는 `shared/types/ipc.ts` 한 곳**(`IPC_CHANNELS` **112개** 상수 + Zod 요청 스키마). 새 채널 = 상수 + 스키마 → `electron/main/ipc/*Handlers.ts` 핸들러 → `electron/preload/index.ts` 타입 지정 래퍼 → `src/services/*Service.ts`(TanStack Query 훅) 순. (실제로는 mpv·창 전체 화면 채널처럼 이벤트/명령성인 것은 서비스 래퍼 없이 `window.api.mpv.*`/`window.api.window.*`를 훅·스토어·컴포넌트에서 직접 호출한다 — `useMediaPlayback`, `useWindowFullscreen`, `useSeekPreview` 등.)
2. 핸들러는 `payload: unknown` → `Schema.parse(payload)`. 푸시 전용 채널(`scanner:scan-progress`, `metadata:bulk-crawl-progress`, `update:status`, `mpv:state-update`, `mpv:ended`, `media:hardware-key`, `media:artwork-changed`, `window:fullscreen-changed`, `menu:open-excluded-entries-dialog` 등)은 `webContents.send`. `ipcMain.on` 리스너는 `safeParse`(예외로 메인이 죽지 않도록) — 단 `MPV_RESIZE`는 현재 `parse`를 씀.
3. **모든 `ipcMain.handle/on`은 `installTrustedIpcGuard()`가 감싸** 발신 프레임이 앱 자신의 최상위 프레임(패키징 시 정확히 `out/renderer/index.html`, 개발 시 dev 서버 출처)인지 검사. 위반 시 handle은 throw, on은 `returnValue = null`. 새 핸들러도 자동 적용되지만 가드 설치 전에 등록하면 안 됨.
4. 파일 시스템에 닿는 모든 핸들러는 `isPathWithinAnyLibrary` 검증(미디어는 `computeMediaAllowedRoots` + `computeMediaTrustedPaths`). 사용자가 고른 임의 위치(세이브 폴더·표지 원본 등)는 **"방금 고른 경로"** 패턴.
5. 파일을 **실행**하는 동작은 `.exe` 한정(실행 설정) 또는 메인 프로세스 네이티브 확인창(`shell:open-path`). 렌더러가 확인을 대신 누를 수 없게 확인창은 항상 메인에서 띄움.
6. 렌더러는 `window.api.*`만 사용(contextBridge 한 줄, `export type Api = typeof api`). 프리로드는 샌드박스라 런타임 의존성은 번들해야 함(`zod`는 `externalizeDepsPlugin({ exclude: ['zod'] })` — 흰 화면 버그 이력).
7. 커스텀 프로토콜: `thumb://`(폴더 썸네일), `mediathumb://`(호스트 `thumbnail` 512px / `cover` 2048px / `playlist-cover`; 앞의 둘은 미디어 신뢰 경계 적용). 경로 `..`는 resolve 후 비교. CSP의 `img-src`/`connect-src`에 두 스킴이 들어 있으므로 새 스킴 추가 시 CSP도 수정.
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
| 장면 미리보기 | `mpv:preview-frame`은 `.strict()` 스키마로 경로 필드 거부, 경로는 메인이 현재 재생 파일에서만 얻음, 미리보기 mpv는 `ao=null`·일시정지(§11.13) |
| 패키징 | `package.json build.electronFuses`: runAsNode off, NODE_OPTIONS off, `--inspect` off, cookie 암호화 on, asar에서만 로드 [미검증: 설치본] |
| 공급망 | `CHECKSUMS.sha256` + `npm run verify:binaries`(build/release 선행), `.npmrc audit-level=high`, `npm run audit:prod` |

**2026-11-23에 막은 경로**: `SETTINGS_SET`의 `locale-emulator-path`/`media-folder` 무검증(§12.1), `libmpv-2.dll` 상대 이름 로드(§11.1), `detectGameVersion`이 라이브러리 밖 폴더를 탐색하던 것(이제 라이브러리 안일 때만, 아니면 버전 null), `MPV_RESIZE`의 `parse`(→ `safeParse`).

**아직 막히지 않은 경로** — §20.2: 렌더러가 `file://`로 로드됨, DevTools 메뉴가 프로덕션에도 노출, 경계 검사에 `realpath` 미사용(정션), 스캐너(얕은/재귀)는 경계 검사 없이 임의 폴더 목록을 반환(읽기 전용, 의도), 설치 파일 미서명. 기존에 저장된 `media-folder` 값(검증 도입 전 저장)은 그대로 신뢰됨.

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
  media/                   mpvWorker/mpvProcessManager, mpvPreviewWorker/Manager/Session/previewQueue(장면 미리보기), resolveMediaThumbnail(resolveMediaArtwork)/mediaArtworkCache/mediaArtworkServices/workCoverLookup/accentColor/overrideCoverInfo/saveLargeOverride(표지 파이프라인), extract*, lyrics, audioCover, mediaTrustBoundary
  libraries/               libraryPathPolicy
  shell/                   buildExternalUrl, openPathPolicy
  customCover/ cache/
  thumbnailProtocol.ts(isPathWithinAnyLibrary 포함) mediaThumbnailProtocol.ts mediaHardwareKeys.ts
  windowFullscreenOwner.ts(창 전체 화면 소유자 추적) windowCloseBehavior.ts updater.ts menuLocalization.ts zoomShortcuts.ts subtitlePipBounds.ts
  migrateUserDataFolder.ts normalizeReleaseNotes.ts
electron/preload/index.ts  window.api 정의
electron/native/mpv-addon/ libmpv N-API 애드온 (mpv_addon.cc, libmpv-2.dll + CHECKSUMS.sha256, binding.gyp, TESTING.md, 벤치 스크립트 *.cjs)
scripts/verify-native-binaries.mjs  DLL 해시 검증
shared/                    IPC 타입/스키마, 코드 인식, 경로 정규화, 파일 종류 판별, 오류 메시지 상수
src/
  main.tsx                 진입점 (창 종류 분기, 테마 선적용)
  router.tsx               라우트
  pages/                   라우트 단위 화면 (+ PlayerWindow, SubtitlePip)
  components/{game,layout,media,ui}/  (media: FullscreenPlayerView/PlayerControlBands/AudioArtworkView/useAutoHideControls/useFullscreenKeys/useSeekPreview/SeekPreviewCard 등)
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
| `npm run build` | `verify:binaries` → `build:mpv-addon` → `rebuild:mpv-addon`(postinstall과 같은 애드온 재빌드 — `npm ci` 없이 갱신한 체크아웃의 옛 `mpv_addon.node`가 포장되지 않도록) → electron-vite build → electron-builder (NSIS, `dist/`) |
| `npm run release` | 위와 같고 GitHub에 즉시 발행 (`--publish always`, `GH_TOKEN` 필요) |
| `npm test` | Vitest, node 환경. **172 파일 / 1354 테스트**(2026-11-23 미디어 전체 화면 작업·최종 리뷰 수정 후 합계; 폴더별 분포는 재집계하지 않음). 렌더러는 순수 함수 위주 + jsdom 렌더 테스트 9개 파일(별점·메모, 세이브 다이얼로그, 툴팁, 일부 훅/서비스). 그 외 UI 변경은 수동 확인 필요 |
| `npm run typecheck` / `lint` / `format:check` | tsc build / ESLint(flat) / Prettier |
| `npm run build:mpv-addon`, `rebuild:mpv-addon` | libmpv 네이티브 애드온 빌드 / Electron ABI 리빌드 — `mpv_addon.cc` 변경 시 필수 |
| `npm run verify:binaries` | `libmpv-2.dll` SHA-256 검증 |
| `npm run audit:prod` | `npm audit --omit=dev --audit-level=high` (의존성 변경 시) |

- Node 버전: `.nvmrc` = 20.
- 스택: Electron 43.8.7, electron-vite 5, Vite 7.3, React 19.2, TypeScript 6(strict), Tailwind v4 + shadcn/ui(Radix), Zustand 5, TanStack Query 5 / Router 1, Drizzle 0.45 + better-sqlite3 13, dnd-kit, react-window 2, framer-motion 12, cheerio, sharp 0.35.5, ffmpeg-static, iconv-lite, electron-updater, zod 4.6.7, sonner, Pretendard 번들 폰트. `overrides`로 undici/seroval/js-yaml 등 하위 의존성 고정.
- 패키징: `extraResources`로 `LOGO.png`, `mpv_addon.node`, `libmpv-2.dll` 동봉, `asarUnpack` 사용. 앱 ID `com.arkmanager.app`.
- 규모: 비테스트 TS/TSX 약 31,000줄, IPC 채널 112개, preload API 함수 약 140개(미디어 전체 화면 작업으로 몇 개 늘었으나 재집계하지 않음), 번역 키 364개(2026-11-23 TypeScript 파서로 `ko` 객체 재집계, ja/en 동일).
- 설계 스펙·구현 계획(`docs/superpowers/`, `.superpowers/`)은 gitignore 대상이라 **저장소에는 없음**(2026-11-23 미디어 전체 화면 작업의 스펙·계획은 이 PC 작업 폴더에만 남아 있고 커밋되지 않음). 그 외 코드 주석이 인용하는 이 경로의 문서는 대부분 열람 불가 → 주석 자체가 유일한 근거.

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
| (미출시) | 2026-11-23 | 같은 브랜치: Steam 스토어 API 전환, DLsite 새 마크업·JSON 폴백 수정, 설정값 쓰기 검증, 이동 재키 확장, 실행 cwd, ASMR 임시 루트, libmpv 절대경로 로드 등(§20.0) |

---

## 20. 앞으로 할 일 (코드 기준 정리, 2026-11-23)

### 20.0 2026-11-23에 완료한 것
| 항목 | 위치 |
| --- | --- |
| Steam: 성인 전용·지역 제한 타이틀 크롤 실패 → 스토어 API로 전환(HTML 폴백 유지) | §5.1, `metadata/steamStoreApi.ts` |
| DLsite: 새 Nuxt 마크업 파싱, JSON 폴백 URL·스키마 수정, HTML 누락 필드를 JSON으로 보충 | §5.1, `dlsiteParser.ts`, `dlsiteJsonFallback.ts`, `crawlGameMetadata.ts` |
| 일괄/자동 크롤도 외부 프로바이더 사용 | §5.3 |
| `SETTINGS_SET`의 `locale-emulator-path`·`media-folder` 쓰기 검증 | §12.1, `ipc/pickedPaths.ts` |
| 이동/이름변경 재키를 하위 항목·행 내부 경로·미디어 테이블까지 확장 | §10.1, `database/rekeyMovedPath.ts` |
| BMP 선택창 필터 제거 | §7.2 |
| 게임 실행 `cwd` = exe 폴더 | §8 |
| ASMR 재생이 미디어 폴더 설정을 덮어쓰지 않음(임시 루트) | §11.6 |
| libmpv 절대경로 로드 | §11.1 |
| `detectGameVersion` 라이브러리 경계, `MPV_RESIZE` safeParse | §16 |
| lint 오류(`scripts/*.mjs` Node globals) | `eslint.config.js` |
| 미디어 전체 화면 개편: 오버레이·분리 창 공용 `FullscreenPlayerView`/`PlayerControlBands`, 2초 자동 숨김(커서 포함), 모니터 전체 화면(⛶/`F`/더블클릭/`Esc`)과 소유자 추적, capture 단계 키 우선순위 | §11.7~11.9, `window:set-fullscreen` |
| 음성 화면(표지 중심·확대·표지 없음·강조색) + 표지 파이프라인(2048px 큰 표지, 곡/작품 세대 + 곡별 잠금 무효화, RJ 작품 표지 대체, `.notfound` 잔존 버그 수정) | §11.10~11.11, `media:get-cover-info` |
| 곡 제목(`media-title`)·`loadGeneration`/`loadedPath` 식별 정보 | §11.12 |
| 시크바 장면 미리보기(두 번째 mpv utilityProcess, 중앙값 약 27ms) | §11.13, `mpv:preview-frame` |
| 최종 리뷰 수정: `mpv:ended`에 로드 식별 정보(늦은 `ended` 무시), `build`/`release`가 애드온 재빌드 + 옛 애드온이면 제목 null·미리보기 거부, 전체 화면에서 EQ 팝오버가 열려 있으면 `Esc`는 팝오버만 닫음, `get-cover-info`/`mediathumb://`가 resolve 예외에 "표지 없음"/404, 일괄 크롤의 작품 표지 세대는 표지 저장 시점마다 영속화하고 렌더러 알림만 큐 소진 시 1회로, 영상 `.notfound`는 작품 표지 세대와 무관, 미리보기 프레임 길이 검사(방어 심층) + 곡 전환 시 호버 초기화 | §11.12, §11.13, `package.json` |

### 20.1 보안 브랜치 마무리 (릴리스 전 필수)
1. `npm ci`(ffmpeg 바이너리 복구 포함) 후 mpv 애드온 재빌드 확인. (이 PC에서는 2026-11-23에 `build:mpv-addon` + `rebuild:mpv-addon` 완료)
2. **실앱 수동 점검**(SECURITY.md §2 체크리스트): `npm run dev`에서 동작, `npm run build` 산출물에서 CSP 위반 없음(표지/아이콘/미디어 썸네일/폰트/테마), 라이브러리 추가 3경로(선택창 무확인/입력 확인창/`C:\` 거부), `.exe` 열기 확인창, 미디어 재생·EQ·미디어 키·분리 창·PIP, 클립보드 복사, 설치본의 Fuses·자동 업데이트·mpv 유틸리티 프로세스.
3. **이번 수정분 실앱 점검**: Steam/DLsite 항목 "전체 메타데이터 새로고침" 후 장르·서클 표시와 ASMR "재생" 버튼 판정 / 설정에서 LE 경로 지정·초기화 / 미디어 탭 폴더 선택·ASMR 재생 후 임시 루트 버튼 2개 / 게임 폴더를 탐색기 탭에서 이동한 뒤 실행 설정·즐겨찾기 유지 / LE 모드 게임 실행.
4. **미디어 전체 화면 실앱 점검**(`npm run dev`, 단위 테스트가 닿지 않는 시각·동작; 애드온 재빌드 후 앱 재시작 필요):
   - 자동 숨김: 영상에서 마우스를 2초 두면 띠가 fade out(약 200ms)되고 커서가 사라지며 하단 2px 진행선이 남는다 / 움직이면 즉시 복귀 / 숨긴 뒤 마우스를 가만히 두면 띠가 다시 깜빡이지 않는다 / 띠 위 포인터·일시정지·슬라이더 드래그·EQ 팝오버(프리셋 드롭다운 포함)·미디어 사이드바 열림 중엔 숨지 않는다 / 키보드 Tab 포커스 중에는 유지되고 마우스 클릭 뒤에는 다시 숨는다.
   - 레이아웃: 사이드바 하단이 띠 바로 위에 붙고 띠가 숨어도 튀지 않는다 / 가사 줄이 띠 위에 있다가 띠가 숨으면 하단 24px로 내려온다 / 도킹 `MediaPlayerBar`는 예전과 같다.
   - 모니터 전체 화면: ⛶·`F`·영상 더블클릭이 토글(`F` 길게 눌러도 깜빡임 없음), `Esc`는 해제만 하고 뒤의 상세 사이드바를 닫지 않으며 전체 화면이 아닐 땐 예전처럼 동작 / 미디어가 켠 전체 화면은 ⊟·분리(⤡)·재생 종료/재생목록 비움에서 풀리고 사용자가 F11로 켠 것은 유지 / F11 상태에서 오버레이를 열고 ⛶ 한 번에 해제되는지(아이콘이 잠시 "진입"으로 보일 수 있음) / 도킹(최소화) 상태에서 F11 중 `F`·`Esc`를 미디어가 가져가지 않는다.
   - 분리 창: 같은 띠·자동 숨김·⛶/`F`/더블클릭/`Esc`, 분리·최소화 버튼 없음, ☰가 오른쪽 재생목록 패널을 열고(기본 닫힘, 열려 있는 동안 띠 유지), 좋아요·자막 PIP 버튼 동작.
   - 음성 화면: 내장 표지 / 폴더 이미지 `cover.jpg` / 표지 없는 RJ 작품 폴더 안 곡(작품 표지 표시)에서 흐린 배경·원 비율 표지·강조색(재생 버튼·슬라이더·진행선) / 표지 없는 곡(남색 배경·음표 사각형·클릭 무반응·primary 강조색) / 표지 클릭·Tab+Enter/Space로 확대·축소(재생/일시정지가 같이 토글되지 않음, 곡이 바뀌어도 유지, 분리 창은 독립) / 긴 일본어 제목 3줄 말줄임·파일명 2줄 / 4:3 가로 표지(너비 45% 한도)와 세로·정사각 표지(높이 2/3 한도), 창 크기 변경 시 띠와 겹치지 않음 / 표지 교체 후 곡을 바꾸지 않아도 이미지·강조색 갱신 / 표지가 매우 밝거나 어두울 때 재생 아이콘·제목 가독성 / 곡 전환 중 확대 상태에서 화면이 navy·기본 배치로 번쩍이지 않음 / 폭 520px 미만 분리 창의 세로 배치 / 4K·최대화에서 블러 배경의 GPU 부하와 자동 숨김 fade 부드러움.
   - 장면 미리보기: 1시간 이상 영상에서 새 지점은 약 0.1초 안에, 본 지점은 즉시 카드가 뜬다 / 빠르게 왕복해도 마지막 지점 장면만 남는다 / 곡 전환 직전·직후 호버에서 이전 곡 장면이 나오지 않는다 / 도킹 바·전체 화면 띠·분리 창에서 확인(분리 중 메인 창 도킹 바는 분리 시점의 곡 동안은 장면이 나오고, 곡이 바뀐 뒤에는 시간 알약만 — §11.13) / 오디오·길이 모르는 영상은 카드 없음 / 좌우 끝과 640px 미만 창에서 카드가 창 안에 머문다 / thumb 드래그 중 바 밖에서도 따라가고 바 밖에서 놓으면 사라진다 / 미리보기 소리가 나지 않고 격렬한 스크럽에도 본 재생이 끊기지 않는다 / 숨은 띠와 함께 카드가 사라지고 클릭을 막지 않는다.
   - 최종 리뷰 수정분: 전체 화면에서 EQ 팝오버(프리셋 드롭다운 포함)를 연 채 `Esc` → 팝오버만 닫히고 전체 화면 유지(다시 `Esc`로 해제) / 트랙 끝 직전·끝나는 순간에 다음 곡 버튼(또는 큐 항목 클릭) → 누른 곡이 그대로 재생되고 한 곡 더 건너뛰지 않음(한 곡 반복이면 새 곡이 0초로 되감기지 않음).
   - 외부 리뷰·사후 수정분(`2a37bbd`~`dd65b14`): ① 일괄 크롤 도중 앱을 종료했다 다시 켜면 이미 저장된 작품 표지가 음성 전체 화면에 나온다 ② 표지 조회 중(첫 곡 진입 직후) 사용자 지정 표지를 지정해도 "표지 없음"이 남지 않는다 ③ F11로 전체 화면에 먼저 들어간 뒤 미디어 오버레이를 열고 첫 ⛶/`F`가 바로 해제된다 ④ 마지막 곡이 자연 종료되면 미디어가 켠 모니터 전체 화면이 풀리고(F11로 켠 것은 유지, 일시정지는 유지) ⑤ `npm ci` 후 `node_modules/ffmpeg-static/ffmpeg.exe`가 있고 미디어 탭 영상·음악 섬네일이 나온다(없으면 "표지 없음"이 영구 캐시되지 않고 다시 시도됨) ⑥ 음악 재생 중 새로고침(메뉴 Reload 확인창 후 / `Ctrl+R`)하면 소리도 같이 끝나고 재생 바가 남지 않는다. 분리 창이 재생 중일 때 메인 창만 새로고침하면 재생은 유지된다.
5. 버전 번호 결정(1.2.4 또는 1.3.0), README 업데이트 내역 작성(**업데이트 후 "전체 메타데이터 새로고침" 1회 안내** 포함, §5.3), master 병합.
6. 계정·배포 보호(SECURITY.md §2-3): 2FA, 토큰 재발급, fine-grained `GH_TOKEN`, 가능하면 CI 릴리스. `libmpv-2.dll` 해시를 공식 배포본과 대조.

### 20.2 보안 후속 (코드로 해결 가능)
| 우선 | 작업 | 근거 |
| --- | --- | --- |
| 높음 | 렌더러를 `app://` 커스텀 프로토콜로 서빙 + Fuse `grantFileProtocolExtraPrivileges` off | SECURITY.md §3 |
| 중간 | ASAR 무결성 Fuse(설치본으로 `asarUnpack` 상호작용 확인 후) | SECURITY.md §3 |
| 중간 | 경계 검사에 `realpath` 적용(정션/심볼릭 링크 우회) | SECURITY.md §3 |
| 중간 | `ffmpeg-static` 설치 시 다운로드 통제(CI에서 `--ignore-scripts` + 해시 고정) | SECURITY.md §3 |
| 낮음 | 패키징 빌드에서 `toggleDevTools` 메뉴 제거 | SECURITY.md §3 |
| 낮음 | 검증 도입 전에 저장된 `media-folder`/`locale-emulator-path` 값 재검증(현재 `locale-emulator-path`는 사용 시 `.exe` 확인만) | §16 |
| 외부 | 코드 서명 인증서 확보 후 `win.signtoolOptions`/`publisherName` | SECURITY.md §2-4 |

### 20.3 기능 결함 · 확인 필요
1. 코드 연동 해제 시 code 키로 옮겨진 데이터는 되돌아오지 않음(§7.1) — 오타 연동 후 해제하면 데이터가 잘못된 코드에 남음. (같은 코드를 파일명으로 가진 항목이 있을 수 있어 자동으로 되돌리기 어려움 → UI에서 "데이터도 되돌리기" 선택지를 주는 방식 검토)
2. 기존 DB의 불완전한 DLsite/실패한 Steam 메타데이터를 업데이트 후 자동으로 다시 받게 할지(현재는 수동 "전체 메타데이터 새로고침" 필요, §5.3).
3. Steam 스토어 API의 요청 한도는 공개 문서가 없음 — 대량 전체 새로고침 시 실패(`network`)가 늘면 간격 조정 검토.
4. hover-tooltip 테스트의 `act(...)` 경고(통과는 함) 원인 조사.
5. Locale Emulator 인자 사용법·`cwd` 전달 여부 실기 검증.
6. 앱 밖(Windows 탐색기)에서 폴더를 옮기면 재키되지 않음 — 필요 시 "경로 다시 연결" 기능.

### 20.4 정리 작업
- `package.json` `description`을 현재 기능에 맞게 수정.
- Prettier: 작업 트리가 CRLF(git autocrlf)라 `npm run format:check`가 거의 모든 파일에서 실패함(Prettier 기본 `endOfLine: lf`). `.prettierrc.json`에 `endOfLine: auto` 추가 또는 `.gitattributes`로 LF 고정 결정 필요. 별개로 `librariesHandlers.ts`·`dlsiteParser.ts`·`FolderTreeTab.tsx`·`translations.ts`·`MediaPage.tsx`·`mediaPlayerStore.ts`는 줄 끝과 무관하게 HEAD부터 포맷이 맞지 않음.
- `/detail` 라우트(`DetailPage`) 제거 여부 결정, `src/pages/DlsiteSearch/` → `GameSearch/`로 이동.
- 코드 주석에 남은 `media://` 프로토콜 언급(제거된 프로토콜) 정리, 존재하지 않는 `docs/superpowers/...` 경로 인용 정리.
- 트레이 메뉴(Open/Exit)·메인 오류 메시지·선택창 필터명 다국어화.
- EQ 밴드 수 5 하드코딩 3곳을 `shared/`로 통합.

### 20.5 README "추후 개발 예정" (사용자 공개 로드맵)
지역 제한 게임 메타데이터 조회 개선 / 미디어 재생기와 Explorer 연동 강화 / 파일명 일괄 변경에 AI 탑재 검토 / Steam API 연동(실행·다운로드·조회, 시기 미정).

### 20.6 미디어 전체 화면 후속 (리뷰에서 보류한 작은 문제)
**표지 파이프라인**
- 인코딩 I/O 오류(디스크 가득 등)도 디코딩 오류처럼 다음 소스로 넘어가 영구 `.notfound`가 기록될 수 있음 → 디코딩 오류만 "손상"으로 취급.
- 내장 표지 추출의 일시 실패가 폴더 이미지 성공에 가려짐. (영상 `.notfound`가 작품 표지 세대마다 무효화되던 것은 최종 리뷰에서 수정 — §20.0)
- 버전 없는 썸네일 URL: `?v=<곡 세대>-<작품 세대>`를 붙이는 것은 `AudioArtworkView`(전체 화면 음성 화면)뿐이고, 도킹 바·큐·재생목록 행·MediaSession artwork는 `buildMediaThumbnailUrl(path)`(버전 없음)를 쓴다 → 표지가 바뀌어도 곡이 바뀔 때까지 브라우저 캐시의 옛 이미지가 남을 수 있음.
- 커밋이 예외로 끝나면 썸네일/표지 임시 파일이 `finally`에서 안 지워질 수 있음, `.notfound` 삭제는 곡 잠금 밖(아주 작은 경쟁), 부분 커밋 실패 뒤 옛/새 캐시 혼재 가능(재생성되어 무해).
- 손상된 `.large.webp`는 512px override로 폴백하지 않고 resolve로 빠짐. `overrideCoverInfo.ts`(손상/누락 폴백)·손상된 세대 파일 리셋, 핸들러 수준의 작품 표지 세대 bump(LINK/UNLINK/커스텀 표지/크롤/일괄) 테스트 없음. 캐시 초기화가 진행 중 해결과 겹치면 방금 만든 파일이 남을 수 있음(허용). `mediathumb://` 응답에 `Cache-Control` 없음.
- `workCoverLookup` 테스트 공백: 드라이브 루트/UNC/`D:Lib` vs `D:Library` 접두/혼합 구분자·대소문자.
- `useMediaCoverInfo`가 훅마다 IPC 리스너 1개(곡 N개면 N개) → 앱 단위 구독 1개로. 강조색 `MAX_LIGHTNESS` 0.70 하향 검토, `accentForeground` 임계 0.4(WCAG 교차점 약 0.18) 가독성 조정.

**재생 상태 · 미리보기 메인/애드온**
- `onStateUpdate` effect가 곡이 바뀔 때마다 재구독(짧은 공백). init 실패의 `loadedPath`는 실패한 파일. (늦은 `ended` 문제와 곡 변경 시 식별 정보 초기화의 훅 단위 테스트는 최종 리뷰에서 해결 — §11.12, `useMediaPlayback.test.ts`)
- 미리보기 워커: 초기 `playback-restart`를 내지 않는 파일은 요청마다 3초(실패 경로 메모이즈 필요), 미사용 `MpvPreviewFrameSchema` export, drain이 `end-file`을 버림, 이미 종료된 프로세스에 kill 유예.
- 애드온 스파이크/옵션: `preview-latency.cjs`의 랜덤 시드, `set_option` 반환값 무시, restart-id 가드, 4ms 간격 지터, getter throw 처리.

**전체 화면 · 자동 숨김**
- 숨은 뒤 첫 합성 `pointermove`는 걸러지지 않아 한 번 깜빡일 수 있음. 훅 테스트 공백(`removeEventListener`, disable→enable, wheel/pointerdown, 숨은 중 hold true), 이벤트마다 타이머 clear/set 반복.
- 분리 창 자막 PIP 버튼이 이미 PIP가 열려 있어도 "닫힘"으로 시작(메인이 재방송하면 보정), ☰ 레이블 불일치(`media.playlist` vs `media.showPlaylist`), `MediaSidebar`가 24px 그라데이션 패딩 위에서 멈춤(화면 확인 필요). `windowFullscreenHandlers`의 null/destroyed 조기 반환과 `useWindowFullscreen` 훅 자체 테스트 부족.

**음성 화면**
- 표지 한도를 viewport가 아닌 행 기준으로 측정(1080p에서 약 653px vs 720px, 스펙은 "약"), 레터박스 클릭이 확대를 접음, 동기 가사가 표지와 겹칠 수 있음, 좁은 레이아웃 임계가 실제로는 컨테이너 약 620px(안쪽 행 84%), 정보 조회 중 빈 테두리 버튼, `restoreAllMocks`를 `afterEach`로 옮길 것(테스트 스파이 누수).

**장면 미리보기 렌더러**
- 프레임당 130KB 추가 복사. (곡 전환 뒤 호버 상태 잔존 — 컨트롤러 `hovered`와 바의 `seekHover`를 곡 변경 시 초기화 — 과 프레임 길이 검사는 최종 리뷰에서 해결. 길이 검사는 **방어 심층**일 뿐: 메인이 240×135×4가 아닌 프레임을 이미 버리므로 IPC 경로로는 길이가 어긋난 프레임이 오지 않는다. 렌더러는 `useSeekPreview`의 `receive`에서 w×h×4가 아닌 프레임을 캐시 전에 버리고 `SeekPreviewCard`의 그리기를 try/catch로 감쌌다.)
- 비호스트 도킹 바가 낡은 duration/generation 유지(무해), `setSeekHover`가 이동마다 바 전체를 리렌더하고 드래그 중 이중 처리, `nextPreviewGeneration`은 테스트만 있고 프로덕션 미사용(실제는 `shouldAdoptLoadIdentity`), 드래그 중 duration이 바뀌면 옛 값 사용, 시크 비율이 thumb inset을 무시(끝에서 수 px 차이), 매우 짧은 분리 창에서 카드 위쪽 잘림(세로 클램프 없음).

---

## 21. 이번 재검증에서 정정한 내용 (구버전 문서 → 코드)

| 구버전 서술 | 실제 코드 |
| --- | --- |
| IPC 채널 약 100개(FEATURES) / 77개(ARCHITECTURE) | **106개**(2026-11-23 미디어 전체 화면 작업 뒤 112개) |
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
