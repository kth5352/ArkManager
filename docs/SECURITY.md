# Ark Manager — 보안 점검 및 조치 기록

작성: 2026-11-05 / 대상: v1.2.3 → `security/hardening` 브랜치
범위: 메인/프리로드/렌더러 코드, IPC, 파일·프로세스 접근, 네트워크, 의존성·빌드·배포 공급망.
방법: 소스 전체 grep + 핵심 경로 정독 + `npm audit` + 단위 테스트(자동화 가능한 것은 회귀 테스트로 고정).

> 이 앱의 가장 큰 특징은 **출처를 알 수 없는 다운로드 파일을 다룬다**는 점입니다. 폴더·파일 이름, 미디어/자막/재생목록 파일, 이미지는 모두 공격자가 만들 수 있다고 가정하고 설계했습니다. 또 라이브러리 안의 게임 `.exe`는 사용자가 실행하는 순간 사용자 권한으로 돌아갑니다. 앱이 막을 수 없는 영역이므로 **모르는 게임은 Windows Sandbox/VM에서 먼저 실행**하는 것을 권장합니다.

---

## 1. 발견 사항과 조치 요약

| # | 심각도 | 발견 | 조치 | 상태 |
|---|---|---|---|---|
| 1 | **높음 (악용 미확정)** | `readExeFileVersion`이 `shell: true`(cmd.exe)로 PowerShell을 띄우면서, **다운로드한 파일/폴더 이름**을 스크립트 문자열에 직접 끼워 넣음. 이스케이프는 ASCII `'` 하나만 처리해 두 단계 파서(cmd.exe, PowerShell)에 대한 방어로는 불완전한 구조. **실제 임의 명령 실행까지는 재현하지 못했음**(시도한 입력은 모두 실행되지 않고 무시되거나 구문 오류로 끝남) | 구조 자체를 제거: 셸 없이 절대경로 `powershell.exe` 직접 실행, 경로는 환경변수(`ARK_EXE_PATH`)로만 전달하고 스크립트는 값을 데이터로만 읽음. 회귀 테스트 추가 | ✅ 수정 |
| 2 | 높음 | Electron 43.2.0에 공개된 취약점 다수(샌드박스 상속, `file://` 교차 출처 읽기, 프리로드 캐시 오염 등, 43.8.1 미만 해당) | Electron **43.8.7**로 상향 | ✅ 수정 |
| 3 | 높음 | 프로덕션 의존성 취약점 5건(sharp/libheif·librsvg, zod 메모리 고갈, undici 다수, seroval, js-yaml) | sharp 0.35.5, zod 4.6.7, `overrides`로 undici/seroval/js-yaml 상향 → `npm audit --omit=dev` **0건** | ✅ 수정 |
| 4 | 높음 | 렌더러 방어선 부재: CSP 없음, `window.open`/페이지 이동/`<webview>` 차단 없음, 권한 요청 무방비, IPC 발신자 검증 없음, `webPreferences` 기본값 의존 | `electron/main/security.ts` 신설: 명시적 `sandbox/contextIsolation/nodeIntegration:false`, 신뢰 URL 외 이동·팝업·webview 차단, 클립보드 쓰기 외 모든 권한 거부, **모든 `ipcMain.handle/on`이 앱 자신의 최상위 프레임에서 온 호출인지 검증**, 프로덕션 빌드에 CSP(`default-src 'none'`, 스크립트·connect는 자기 자신만) 주입 | ✅ 수정 |
| 5 | 높음 | 외부 URL(크롤링한 HTML/외부 API가 주는 표지 URL) 요청에 제한 없음 → LAN/localhost/클라우드 메타데이터(SSRF), 무제한 용량, 리다이렉트 무검증 | `electron/main/net/safeFetch.ts`: https만, 사설/루프백/링크로컬/내부 호스트명·DNS 결과 차단, 리다이렉트 3회·매 홉 재검증(교차 출처 시 Authorization/Cookie 제거), 응답 크기 상한. 모든 크롤러·표지 다운로드·외부 프로바이더에 적용(외부 프로바이더만 사용자가 지정한 LAN 서버 허용) | ✅ 수정 |
| 6 | 중간 | 이미지 디코더 공격면: sharp가 SVG(librsvg)·HEIF(libheif) 등을 그대로 파싱 | `rasterImage.ts`: jpeg/png/webp/gif만 허용, 픽셀(5천만)·용량(30MB) 상한, 압축폭탄 거부 | ✅ 수정 |
| 7 | 중간 | `shell.openPath`가 라이브러리 안의 `.exe/.lnk/.bat/.js/.hta…`도 그대로 실행 | 폴더·일반 문서는 그대로, 실행 가능 형식/확장자 없음은 **메인 프로세스 네이티브 확인창**(렌더러가 대신 누를 수 없음). `.exe.` / `:stream` 위장 이름도 처리 | ✅ 수정 |
| 8 | 중간 | 라이브러리 등록이 어떤 경로든 허용(`C:\`, 사용자 폴더, 앱 데이터 폴더 포함) → 이후 모든 "라이브러리 안" 검사가 무력화 | 존재하는 폴더만, 앱 데이터 폴더/그 상위·하위, Windows·Program Files·ProgramData 금지. **폴더 선택창이 아닌 입력·드롭 경로는 네이티브 확인창** | ✅ 수정 |
| 9 | 중간 | 실행 설정이 `.exe` 여부를 검사하지 않음(`.bat/.lnk` 등) | 설정 시·실행 시 모두 `.exe`만 허용 | ✅ 수정 |
| 10 | 중간 | libmpv: 악성 재생목록/EDL/ASX가 외부 URL·다른 파일을 따라감, ytdl/스크립트 훅 | `access-references/load-unsafe-playlists/ytdl/load-scripts/config/audio-file-auto/osc/기본 키바인딩` 모두 off. `MPV_LOAD`는 렌더러 문자열이 아니라 **검증된 절대경로**만 전달 | ✅ 수정 (**애드온 재빌드 필요**) |
| 11 | 낮음 | 외부 메타데이터 API 키가 SQLite에 평문 | Electron `safeStorage`(Windows DPAPI)로 암호화 저장, 기존 평문 값은 시작 시 자동 이전 | ✅ 수정 |
| 12 | 낮음 | `ELECTRON_RUN_AS_NODE` 등 패키징 앱 변조 경로 | Electron Fuses: `runAsNode`, `NODE_OPTIONS`, `--inspect` off, cookie 암호화 on, app.asar에서만 로드 | ✅ 설정 (패키징 검증 필요) |
| 13 | 낮음 | 제3자 바이너리(`libmpv-2.dll`) 변조 감지 수단 없음 | SHA-256 기록(`CHECKSUMS.sha256`) + `npm run verify:binaries`를 `build`/`release`에 연결 | ✅ 추가 |
| 14 | 정보 | 개발 도구 취약점 21 moderate + 1 high(`brace-expansion` 다중 메이저) | 런타임/패키지에 포함되지 않음. `vite 7.3.7`, `nanoid`, `source-map-js`, `fast-uri`, `@xmldom/xmldom`은 상향. 나머지는 상위 패키지 업데이트 대기 | ⚠️ 잔여(개발 전용) |

### 점검했으나 문제가 없던 항목
- 렌더러에 `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `window.open`, `<a href>`, `<iframe>`, `<webview>` 없음. 크롤링한 제목·태그·릴리스 노트는 모두 텍스트로만 렌더링(릴리스 노트는 cheerio로 태그 제거).
- `child_process`는 ffmpeg(`execFile` + 인자 배열)와 실행 파일 `spawn`(셸 없음)만 사용. SQL은 Drizzle 파라미터 바인딩(동적 DDL은 상수 테이블/컬럼명).
- IPC 입력은 전부 Zod `parse`. 파일 조작(이름변경/이동/삭제/썸네일/실행/shell)은 모두 라이브러리 경계 검증(`path.resolve` 후 비교). 세이브 폴더·커스텀 표지·미디어 썸네일은 "방금 선택창에서 고른 경로"만 허용하는 패턴 사용.
- 저장소 이력(708 커밋)에 토큰/키/비밀번호 형태의 문자열 없음, `.env`/인증서 파일 없음. 모든 npm 패키지가 `registry.npmjs.org`에서 `integrity` 포함으로 잠겨 있음.

---

## 2. 반드시 직접 해 주셔야 하는 것

1. **의존성 재설치와 애드온 재빌드** (이 환경에서는 `--ignore-scripts`로 설치했습니다)
   ```
   npm ci
   npm run build:mpv-addon && npm run rebuild:mpv-addon   # postinstall이 자동 실행
   ```
2. **실제 앱 실행 점검** (이 세션에서는 GUI를 띄우지 못했습니다. 자동 테스트 1009개·타입체크·린트·빌드는 통과)
   - `npm run dev` 후 콘솔(F12)에 CSP 위반 메시지가 없는지: 갤러리 표지, Explorer 아이콘, 미디어 썸네일, 폰트, 테마 전환
   - 설정 → 라이브러리: 폴더 선택창으로 추가(무확인) / 경로 직접 입력(확인창 뜸) / `C:\` 거부
   - Explorer에서 `.exe` 더블클릭 → 확인창, `.txt` → 바로 열림
   - 미디어 재생(영상·음성·EQ), 하드웨어 미디어 키, 분리 창, 자막 PIP
   - 클립보드 복사(우클릭 → RJ 번호 복사)
   - `npm run build` 로 설치 파일을 만들어 설치본에서도 위 항목과 자동 업데이트 확인(Fuses 포함)
3. **계정·배포 경로 보호** — CDN 탈취 피해 이력이 있으므로 특히:
   - GitHub 계정 2단계 인증(가능하면 보안 키/패스키), 사용 중인 GitHub 토큰·npm 토큰·브라우저 저장 비밀번호는 **다른 깨끗한 기기에서 전부 재발급**
   - `npm run release`가 쓰는 `GH_TOKEN`은 이 저장소 `contents:write`만 가진 fine-grained 토큰으로 제한, 환경변수에 상주시키지 말 것
   - 가능하면 릴리스 발행을 로컬 PC가 아닌 격리된 CI(보호된 브랜치 + 승인)로 이동
4. **코드 서명** — 현재 설치 파일은 서명되어 있지 않아 자동 업데이트의 무결성은 "GitHub 릴리스가 진짜다"라는 신뢰에만 의존합니다(`latest.yml`의 해시도 같은 릴리스에서 오기 때문). 계정이 뚫리면 악성 업데이트가 그대로 배포됩니다. 인증서를 구하면 `electron-builder`의 `win.signtoolOptions`/`publisherName`을 설정해 업데이트 서명 검증을 켜세요(이 항목은 인증서가 있어야 해서 코드로 해결할 수 없습니다).
5. **`libmpv-2.dll` 출처 확인** — `CHECKSUMS.sha256`의 해시는 "현재 저장소에 있던 파일" 기준입니다. 처음 받았던 공식 배포본과 해시가 같은지 한 번 대조해 주세요.

---

## 3. 잔여 위험과 후속 권장 작업 (코드로 더 줄일 수 있는 것)

| 우선순위 | 항목 | 설명 |
|---|---|---|
| 높음 | 렌더러를 `file://` 대신 커스텀 `app://` 프로토콜로 서빙 + Fuse `grantFileProtocolExtraPrivileges` off | 지금은 렌더러가 `file://`이라 렌더러가 장악되면 다른 `file://` 리소스를 읽을 여지가 있음(CSP `connect-src`로 일부 완화). 라우팅·dev 서버·프로토콜 등록을 건드리는 변경이라 별도 작업 + 설치본 테스트 필요 |
| 중간 | ASAR 무결성 Fuse(`enableEmbeddedAsarIntegrityValidation`) | 설치본에서 `app.asar` 변조를 감지. `asarUnpack`과의 상호작용을 설치본으로 확인한 뒤 활성화 |
| 중간 | 심볼릭 링크/정션 경유 경계 우회 | `isPathWithinAnyLibrary`는 `resolve`만 쓰고 `realpath`는 쓰지 않음. 라이브러리 안의 정션이 밖을 가리키면 이름변경/삭제 대상이 될 수 있음(아카이브 해제만으로 정션이 생기는 경우는 드묾) |
| 중간 | `ffmpeg-static` 설치 시 바이너리 다운로드 | 패키지의 `postinstall`이 GitHub에서 ffmpeg를 받음. CI에서 `npm ci --ignore-scripts` 후 필요한 것만 명시적으로 rebuild + 결과 해시 고정 권장 |
| 낮음 | 프로덕션에서 DevTools 메뉴 노출 | "콘솔에 붙여넣으세요" 류 사회공학에 노출. 필요 시 패키징 빌드에서 `toggleDevTools` 제거 |
| 낮음 | `SHELL_SHOW_ITEM_IN_FOLDER` 등은 경로 존재 확인 없이 호출 | 라이브러리 경계 검증은 있음. 영향 미미 |
| 낮음 | Explorer 얕은 스캔은 라이브러리 밖 폴더도 나열 | 파일 탐색기 기능의 일부(읽기 전용 목록). 변경 작업은 모두 라이브러리 안으로 제한됨 |
| 정보 | 외부 접속 호스트 추가 | Steam 크롤이 스토어 API(`api.steampowered.com`)로 바뀌어 외부 접속 호스트가 하나 늘었음. `safeFetch` 경유이며 쿠키/자격 증명은 보내지 않음 |
| 정보 | DNS 리바인딩 | `safeFetch`는 요청 직전 DNS를 검사하지만 Node `fetch`가 따로 재해석하므로 이론상 TOCTOU가 남음. 크롤 대상 도메인이 고정이라 실질 위험은 낮음 |

### 3.1 2026-11-23 재검증에서 추가로 확인한 잔여 위험

> **2026-11-23 조치 완료**: 아래 표의 높음·중간·낮음 4개 항목(설정값 검증 2건, libmpv 절대경로 로드, `detectGameVersion` 경계)과 lint는 같은 날 수정했습니다. 구현은 `ipc/pickedPaths.ts`·`settingsHandlers.ts`(`assertSettingWriteAllowed`), `mpv_addon.cc`(`LoadLibmpvNextToAddon`), `saveHandlers.ts`(`detectVersionWithinLibraries`)에 있고, 각각 회귀 테스트가 있습니다(libmpv는 빌드 후 수동 확인). 아래 표는 발견 당시 기록입니다.

| 우선순위 | 항목 | 설명 |
|---|---|---|
| 높음 | `SETTINGS_SET`이 값을 검증하지 않음 → `locale-emulator-path` | 렌더러가 임의 문자열을 저장할 수 있고, `launchGame`은 LE 모드에서 이 경로를 존재 확인만 하고 `spawn`함. 장악된 렌더러가 LE 모드 실행 설정이 있는 게임을 실행시키면 **임의 파일 실행**(실행 설정의 `.exe`·라이브러리 검사를 우회). 수정: 이 키는 `LAUNCH_PICK_LOCALE_EMULATOR_PATH`가 방금 반환한 경로만 저장(또는 파일명 `LEProc.exe` + 존재 확인) |
| 중간 | `SETTINGS_SET` → `media-folder` | 미디어 신뢰 루트(`computeMediaAllowedRoots`)라서 `C:\` 등으로 바꾸면 그 아래 파일을 mpv/ffmpeg로 열거나 MP3/FLAC/M4A에 표지를 삽입(쓰기)할 수 있게 됨. ASMR 재생(`usePlayAsmrFolder`)이 이 값을 프로그램적으로 설정하므로, 라이브러리 하위 또는 picker 경로만 허용하는 방식으로 제한 |
| 낮음 | `libmpv-2.dll` 상대 이름 로드 | `LoadLibraryA("libmpv-2.dll")` + PATH 앞에 애드온 폴더 추가 방식. Windows 검색 순서상 현재 작업 폴더가 PATH보다 먼저라 DLL 심기 여지가 있음 → 전체 경로 + `LoadLibraryExW` 권장(애드온 재빌드 필요) |
| 낮음 | `detectGameVersion(identifier.path)` | 세이브 스냅샷/버전 비교 시 렌더러가 보낸 경로로 폴더의 exe를 나열하고 버전을 읽음(읽기 전용, 셸 없음). 라이브러리 경계 검증 추가 권장 |
| 낮음 | 재귀 스캔도 경계 검사 없음 | 얕은 스캔과 같이 읽기 전용 목록. 의도된 동작 |
| 정보 | lint 실패 | `scripts/verify-native-binaries.mjs`가 ESLint Node globals 설정 밖이라 `npm run lint`가 오류 5건으로 실패(§15의 "ESLint 오류 0"은 이 스크립트 추가 전 결과) |

### 3.2 2026-11-23 미디어 전체 화면 작업에서 추가된 표면

새 코드가 만든 입력 경로와 그 방어입니다(상세 원리는 SECURITY_FIXES.md §16). 새로 열린 위험은 없고, 아래는 모두 기존 규칙을 그대로 적용한 결과입니다.

| 표면 | 방어 | 잔여 |
|---|---|---|
| `media:get-cover-info`(경로 → 표지 유무·강조색·비율·버전) | Zod 검증 + 미디어 신뢰 경계(`mediaTrustBoundary`). 경계 밖이면 던지지 않고 **신뢰되지만 표지 없는 트랙과 같은 모양**(`hasCover:false`)으로 응답 → 파일 존재 여부를 알아내는 신호가 되지 않음 | 없음 |
| `mediathumb://cover/<경로>`(2048px) | `thumbnail` 호스트와 같은 경계 검사(밖이면 404), 알 수 없는 호스트 404, 경로는 pathname만 해석(`?v=` 쿼리 무시), 이미지는 `rasterImage.ts`로만 디코딩해 webp로 재인코딩. CSP는 기존 `mediathumb:` 허용 그대로 | 응답에 `Cache-Control` 없음(성능 문제일 뿐) |
| `mpv:preview-frame`(장면 미리보기) | 요청 스키마 `{seconds, generation, requestId}`가 `.strict()`라 **`path` 필드를 끼워 넣으면 거부**. 경로는 IPC에 없고 메인이 `getCurrentLoadedPath()`(이미 경계 검증·resolve된 현재 재생 파일)에서만 얻으며, 현재 파일이 영상이고 세대가 일치할 때만 처리 → 렌더러가 미리보기로 다른 파일을 열 수 없음. 응답은 240×135×4 바이트가 아니면 폐기 | 미리보기 mpv도 본 mpv와 같은 보안 옵션(참조·ytdl·스크립트 off)에 더해 `ao=null`·일시정지·`aid=no`로 소리/출력 없이 동작. 신뢰할 수 없는 영상을 디코딩하는 프로세스가 하나 더 생기지만 별도 utilityProcess라 크래시가 격리됨(60초 안 3회 비정상 종료면 이번 실행 동안 비활성) |
| `window:set-fullscreen` | Zod(`{fullscreen: boolean, reason}`), 호출한 창(`BrowserWindow.fromWebContents`)에만 작용, 경로·파일 접근 없음 | 렌더러가 장악되면 전체 화면 토글은 가능(영향 미미) |
| 애드온 `init` 5번째 인자 | `{preview: true}`의 `preview` 키 하나만 읽고 임의 mpv 옵션 통로 없음 | 없음 |

---

## 4. 이후 작업 시 지킬 보안 규칙

- 외부 프로세스: **`shell: true` 금지**, 사용자/파일 유래 문자열을 명령줄·스크립트 텍스트에 끼우지 말 것(환경변수나 인자 배열로 전달).
- 네트워크: 메인 프로세스의 모든 외부 요청은 `safeFetch`, 받은 이미지는 `openRasterImage`를 통과시킬 것. 렌더러에서 네트워크 요청 금지(CSP).
- 파일 접근 IPC는 라이브러리 경계(+필요 시 "방금 선택창에서 고른 경로") 검증, 파일을 *실행*하는 동작은 `.exe` 한정이거나 네이티브 확인창.
- 새 `BrowserWindow`는 반드시 `secureWebPreferences()`를 사용, 원격 URL 로드 금지.
- 새 비밀값 설정은 `settingsRepository`의 `SECRET_KEYS`에 추가(DPAPI 암호화).
- 의존성 추가/갱신 시 `npm run audit:prod`, 설치는 `npm ci`.
- `libmpv-2.dll`을 바꾸면 `CHECKSUMS.sha256`을 검증 후 갱신.
