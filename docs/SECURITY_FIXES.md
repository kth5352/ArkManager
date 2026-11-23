# Ark Manager — 보안 수정 상세 설명 (문제 · 원인 · 원리 · 대처)

`docs/SECURITY.md`가 점검 결과 요약표라면, 이 문서는 항목마다 **무엇이 문제였는지 / 왜 생겼는지 / 어떤 원리로 막는지 / 코드에서 어떻게 막았는지**를 풀어 쓴 설명서입니다. 브랜치: `security/hardening`.

## 0. 먼저 알아야 할 위협 모델

이 앱이 다루는 데이터는 대부분 **출처를 알 수 없는 다운로드물**입니다.

| 입력 | 누가 만들 수 있나 | 앱이 읽는 곳 |
|---|---|---|
| 폴더·파일 이름 | 배포자(압축 파일 안의 이름) | 스캐너, 세이브 버전 감지, 이름변경, UI |
| 미디어·자막·가사·재생목록 파일 | 배포자 | libmpv, ffmpeg, 가사 파서 |
| 이미지(표지, 앨범아트) | 배포자 / 외부 사이트 | sharp(libvips) |
| 외부 사이트 응답(HTML/JSON/이미지 URL) | 해당 사이트, 중간자, 사이트가 탈취된 경우 | 크롤러 |
| 게임 `.exe` | 배포자 | 사용자가 실행 |

공격이 성립하려면 보통 두 가지가 겹칩니다. ① 이런 입력이 **해석기(셸, 파서, 디코더, 브라우저 엔진)**에 닿는 경로, ② 해석기가 장악됐을 때 **피해를 키우는 권한**(파일 삭제·실행, 네트워크, 자격 증명). 이번 수정은 ①을 줄이고(입력 검증·해석기 제거), ②를 줄이는(권한 분리·확인창·샌드박스) 두 갈래입니다.

다층 방어(defense in depth)라는 원칙도 적용했습니다. 한 겹이 뚫려도 다음 겹이 막도록, 예를 들어 렌더러 장악을 가정하더라도 **CSP → 네비게이션 차단 → IPC 발신자 검증 → 경로 검증 → 확인창** 순으로 계속 막습니다.

---

## 1. 외부 프로세스에 파일 이름을 끼워 넣던 코드 (`readExeFileVersion`)

**문제.** 세이브 스냅샷을 만들거나 버전 불일치를 검사할 때 게임 `.exe`의 파일 버전을 읽으려고 PowerShell을 실행했습니다. 이때 `.exe` 경로(= 다운로드한 폴더·파일 이름)를 **PowerShell 스크립트 문자열 안에 직접 끼워 넣고**, 그 전체를 `shell: true`(cmd.exe 경유)로 실행했습니다.

**원인.** 파일 이름은 신뢰할 수 없는 입력인데, 두 겹의 파서(cmd.exe → PowerShell)를 거치는 문자열에 합쳐졌습니다. 이스케이프는 ASCII 홑따옴표 `'` 하나만 처리했습니다. 이런 구조에서는 파서가 특별하게 취급하는 문자(따옴표 종류, `%`, `^`, 백틱 등)가 하나라도 빠지면 "데이터가 코드로 해석되는" 틈이 생깁니다. PowerShell은 일반 따옴표 외에 **타이포그래피 따옴표(`‘ ’`)도 따옴표로 취급**하는 등 문자 종류가 많아 완전한 이스케이프가 어렵습니다.

**솔직한 평가.** 제가 구 코드와 같은 구성으로 몇 가지 입력을 시험했을 때 **명령이 실제로 실행되는 것까지는 재현하지 못했습니다**(일반 입력은 그대로 무시되었고, 따옴표를 깨는 입력은 구문 오류로 끝났습니다). 그래서 "원격 코드 실행이 확인된 취약점"이 아니라 **"악용 가능성을 배제할 수 없고, 입력 이스케이프에 의존하는 위험한 구조"**로 분류하는 것이 정확합니다(앞서 대화에서 더 강하게 표현한 부분은 정정합니다). 이런 구조는 방어 가능성이 파서 구현의 세부 사항에 달려 있으므로 구조를 바꾸는 것이 맞습니다.

**원리.** 코드 인젝션을 막는 확실한 방법은 이스케이프를 더 잘하는 것이 아니라 **데이터와 코드의 경로를 분리**하는 것입니다. 데이터는 파서를 거치지 않는 통로(환경변수, 인자 배열, 파일)로 보내고, 코드(스크립트)는 상수로 고정합니다.

**대처** (`electron/main/save/readExeFileVersion.ts`).
- `shell: true` 제거 → cmd.exe가 아예 관여하지 않음. `execFile`로 `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`를 절대경로로 실행(PATH 탐색·가짜 powershell.exe 방지).
- 경로는 환경변수 `ARK_EXE_PATH`로 전달하고 스크립트는 `$env:ARK_EXE_PATH`를 **값으로만 읽음**. PowerShell은 변수 내용을 다시 해석하지 않으므로 따옴표·`$()`·백틱이 들어 있어도 문자 그대로.
- `PSModulePath`를 비워 사용자 쓰기 가능 경로의 모듈이 자동 로드되지 않게 함. `windowsHide`, 10초 타임아웃, 출력 크기 제한.
- 검증: 단위 테스트(경로가 argv/스크립트에 나타나지 않고 환경변수로만 전달되며 `shell` 옵션이 없음) + 이름에 `$()`·`'`·`&`가 든 실제 exe로 실행해 버전 값이 정상 반환되고 부작용이 없음을 확인.

---

## 2. 알려진 취약점이 있는 구버전 소프트웨어

**문제.** Electron 43.2.0은 이후 공개된 취약점이 여러 개 있는 버전이었고(샌드박스 상속 누락, `file://`/HTTP 핸들러의 교차 출처 읽기, 샌드박스 프리로드 코드 캐시 오염 등, 대부분 43.4.1~43.8.1 미만에 해당), 프로덕션 의존성에도 5건(`sharp`의 libheif/librsvg, `zod`의 메모리 고갈, `undici`의 다수, `seroval`, `js-yaml`)이 있었습니다.

**원인.** 의존성이 `^` 범위로 고정돼 설치 당시 버전에 머물렀고, 점검 체계가 없었습니다. 특히 Electron은 번들된 Chromium과 함께 보안 패치가 잦아 뒤처질수록 위험이 누적됩니다. `sharp`는 신뢰할 수 없는 이미지를 직접 디코딩하므로 라이브러리 취약점이 곧 공격면입니다.

**원리.** 공개된 취약점은 공격자도 알고 있으므로, 패치된 버전으로 올리는 것이 가장 비용 대비 효과가 큰 방어입니다.

**대처.** Electron 43.8.7, sharp 0.35.5, zod 4.6.7로 상향. 직접 올릴 수 없는 하위 의존성은 `package.json`의 `overrides`로 고정(`undici ^7.30.2`/`^6.29.1`, `seroval ^1.7.7`, `js-yaml ^4.3.2`, 개발 도구 `nanoid`/`source-map-js`/`fast-uri`/`@xmldom/xmldom`). 결과: `npm audit --omit=dev` **0건**. `.npmrc`에 `audit-level=high`, `npm run audit:prod` 스크립트 추가. 남은 개발 전용 취약점은 `docs/SECURITY.md` 참고.

---

## 3. 렌더러(웹 화면) 방어선 부재

**문제.** 화면을 그리는 렌더러가 장악됐을 때(예: 어딘가의 XSS, 공급망으로 주입된 스크립트) 막아 주는 장치가 없었습니다. ① CSP 없음 ② `window.open`·페이지 이동·`<webview>` 제한 없음 ③ 권한 요청(카메라, 알림 등) 기본 허용 ④ `ipcMain` 핸들러가 호출한 프레임이 누구인지 확인하지 않음 ⑤ `webPreferences`를 Electron 기본값에만 의존.

**원인.** 렌더러는 신뢰할 수 있는 앱 코드만 로드한다고 가정하고 개발됐습니다. 하지만 렌더러에는 `window.api`(파일 이동·삭제·실행 등 강력한 IPC)가 노출돼 있어서, 렌더러 장악 = 메인 프로세스 기능 장악입니다. 가정이 깨졌을 때 피해를 제한하는 층이 없었습니다.

**원리.**
- **CSP(Content-Security-Policy)**: 브라우저 엔진이 "이 문서가 어떤 출처의 스크립트·연결·이미지를 쓸 수 있는가"를 강제하는 허용 목록. 정책이 `script-src 'self'`면 외부에서 온 스크립트·인라인 스크립트가 실행되지 않습니다.
- **네비게이션·창 열기 차단**: 렌더러가 원격 페이지로 이동하면 그 페이지에 `window.api`가 노출되는 "권한 상승" 경로가 됩니다. 앱 자신의 페이지가 아니면 이동·팝업을 막습니다.
- **권한 거부 기본값**: 쓰지 않는 권한은 요청 자체를 거부(최소 권한 원칙).
- **IPC 발신자 검증**: Electron IPC는 어느 프레임에서 왔든 같은 채널로 도착합니다. 메시지가 "앱의 최상위 프레임"에서 왔는지 메인이 확인하면, 다른 프레임·다른 페이지의 호출을 차단할 수 있습니다.
- **명시적 `webPreferences`**: 기본값이 훗날 바뀌거나 누군가 실수로 약화시켜도 보안 설정이 유지되도록 코드에 못 박기.

**대처.**
- `electron/main/security.ts` 신설.
  - `secureWebPreferences()`: `contextIsolation`, `sandbox`, `nodeIntegration:false`, `webSecurity`, `webviewTag:false` 등을 명시. 메인·플레이어·자막 PIP 3개 창 모두 사용.
  - `installWebContentsLockdown()`: 모든 WebContents에 `window.open` 거부, `will-navigate`/`will-redirect`는 `isTrustedAppUrl`(패키징 시 정확히 `out/renderer/index.html`, 개발 시 dev 서버 출처)이 아니면 차단, `<webview>` 차단.
  - `installPermissionLockdown()`: `clipboard-sanitized-write`(복사 메뉴용)만 허용, 나머지 권한·장치 권한 거부.
  - `installTrustedIpcGuard()`: `ipcMain.handle`/`on`을 감싸 모든 채널에서 발신 프레임이 최상위이며 신뢰 URL인지 검사. 위반 시 호출 거부(동기 IPC는 `null` 반환해 멈춤 방지). 이 가드는 핸들러 등록보다 먼저 설치됩니다.
- `electron.vite.config.ts`: **프로덕션 빌드에만** CSP 메타 태그 주입(`default-src 'none'; script-src 'self'; connect-src 'self' thumb: mediathumb:; img-src 'self' data: blob: thumb: mediathumb:; object-src/frame-src/worker-src 'none'; base-uri/form-action 'none'`). 개발 서버는 HMR을 위해 인라인 스크립트가 필요해 제외. 빌드 산출물에서 정책이 삽입되고 인라인 스크립트가 없음을 확인.
- 테스트: `isTrustedAppUrl`이 임의 `file://`, UNC, `http(s)`, `data:`, `javascript:`, 다른 포트를 거부함을 검증.
- ⚠ 한계: 렌더러가 여전히 `file://`로 로드되는 점은 §13 후속 작업 참고. 실제 앱 실행으로 CSP 위반이 없는지 확인이 필요합니다.

---

## 4. 외부 URL 요청 제한 없음 (SSRF · 자원 고갈)

**문제.** 크롤러가 받아 온 **표지 이미지 URL**(외부 HTML/JSON이 주는 값)과 사용자가 설정한 외부 메타데이터 API로 `fetch`를 보냈는데, 대상 검증·용량 제한·리다이렉트 통제가 없었습니다.

**원인.** URL의 출처(제3자 사이트)를 신뢰했습니다. 사이트가 탈취되거나 중간자 공격을 받으면 `http://192.168.0.1/…`, `http://localhost:…`, 클라우드 메타데이터(`169.254.169.254`) 같은 내부 주소를 가리킬 수 있고(SSRF), 수 GB 응답으로 메모리를 소진시키거나, 리다이렉트로 검증된 호스트에서 내부 호스트로 우회시킬 수 있습니다.

**원리.** 신뢰할 수 없는 URL은 ① 스킴·포트 제한 ② 호스트가 가리키는 **IP 주소 검사**(이름이 아니라 해석 결과) ③ **리다이렉트를 자동으로 따르지 않고 매 홉 재검증** ④ **응답 크기 상한**을 모두 통과해야 요청합니다. 교차 출처 리다이렉트에서는 `Authorization`/`Cookie`를 제거해 자격 증명 유출을 막습니다.

**대처** (`electron/main/net/safeFetch.ts`).
- https만, 포트 443만, URL 내 자격 증명 금지.
- 호스트가 IP면 직접 검사, 이름이면 DNS 결과 **모든 주소**를 검사: 사설망(10/8, 172.16/12, 192.168/16), 루프백, 링크로컬(169.254), CGNAT, 멀티캐스트, 예약 대역, IPv6(`::1`, `fc00::/7`, `fe80::/10`, IPv4-매핑 포함) 거부. `localhost`·`*.local`·`*.internal`·단일 라벨 이름 거부.
- `redirect: 'manual'`로 최대 3홉, 매 홉 `assertSafeUrl` 재검증.
- 응답은 `Content-Length` 선검사 + 스트림 바이트 카운터로 상한 초과 시 에러. 타임아웃 15초.
- 적용 범위: DLsite·Steam·Getchu·VNDB 크롤러와 검색, 표지 다운로드(15MB), DLsite JSON 폴백, 외부 프로바이더. 외부 프로바이더만 사용자가 직접 입력한 주소라 `allowPrivateNetwork`(NAS 등 LAN 서버 허용)와 개발용 `http://localhost`를 허용하되, https 및 리다이렉트 재검증은 유지.
- 테스트 9개(사설 IP 판별, DNS가 사설 IP로 풀리는 이름, 리다이렉트 우회, 헤더 제거, 용량 초과) + 기존 표지 테스트는 로컬 테스트 서버를 쓰므로 테스트 전용 옵션으로 조정, 기본값에서 loopback이 거부되는 테스트 추가.
- 알려진 한계: DNS 리바인딩의 시간차(검사 후 `fetch`가 다시 해석) 가능성은 이론상 남음. 크롤 도메인이 고정이라 위험은 낮음.

---

## 5. 이미지 디코더 공격면 (SVG · HEIF · 압축폭탄)

**문제.** 표지·사용자 이미지·ffmpeg가 뽑은 썸네일을 `sharp(buffer)`로 바로 처리했습니다. sharp(libvips)는 SVG(librsvg)와 HEIF/AVIF(libheif) 등 많은 형식을 자동 감지해 파싱하며, 해당 라이브러리에서 메모리 안전성 취약점이 보고됐습니다(감사에서 확인된 권고 2건).

**원인.** "이미지"를 한 덩어리로 보고 형식을 제한하지 않았습니다. 입력 형식이 많을수록 파서 코드가 늘고, 신뢰할 수 없는 입력에 노출되는 코드량이 곧 공격면입니다.

**원리.** **허용 목록**으로 입력을 좁힙니다. 앱이 실제로 필요한 형식(jpeg/png/webp/gif)만 받으면 나머지 파서는 호출되지 않습니다. 추가로 픽셀 수·바이트 수 상한으로 압축폭탄(작은 파일이 거대한 비트맵으로 풀리는 것)을 막습니다.

**대처** (`electron/main/net/rasterImage.ts`). `openRasterImage()`가 ① 0바이트·30MB 초과 거부 ② `metadata()`로 형식 판별 후 jpeg/png/webp/gif만 통과 ③ `limitInputPixels: 5천만`, `failOn: 'error'`로 열기. 표지 다운로드(`cacheCoverImage`)와 모든 사용자/미디어 표지 저장(`saveCustomCoverImage`)이 이 함수를 거칩니다. 테스트: SVG·빈 입력·깨진 입력 거부, 8000×8000 PNG 거부, 정상 3종 통과.

---

## 6. 파일을 "열기"만 해도 실행되는 경로 (`shell.openPath`)

**문제.** Explorer에서 파일을 더블클릭하면 `shell.openPath`가 Windows 기본 연결 프로그램으로 엽니다. `.exe`, `.lnk`, `.bat`, `.js`, `.hta`, `.msi` 등은 **열기 = 실행**입니다. 라이브러리 안의 파일은 다운로드물이라 위험하고, 렌더러가 장악되면 이 IPC로 무확인 실행이 가능했습니다.

**원인.** "라이브러리 안의 경로인가"만 검사하고, 파일 **종류**와 **사용자의 의도**는 확인하지 않았습니다.

**원리.** 위험 동작에는 **렌더러가 대신 누를 수 없는 확인**을 둡니다. 확인창을 메인 프로세스의 네이티브 대화상자로 띄우면, 렌더러 코드가 장악돼도 사용자의 클릭을 위조할 수 없습니다. 폴더 열기·일반 문서는 마찰 없이 유지합니다.

**대처** (`electron/main/shell/openPathPolicy.ts`, `ipc/shellHandlers.ts`). 폴더이거나 위험하지 않은 확장자면 그대로 열기, 위험 확장자 목록(실행 파일·스크립트·바로가기·설치 파일·디스크 이미지·매크로 문서 등)이거나 **확장자가 없으면** 네이티브 경고창(기본 버튼은 "취소"). `evil.exe.`(끝의 점/공백은 Windows가 무시)와 `file.txt:evil.exe`(대체 데이터 스트림) 같은 위장도 처리. 경로의 NUL 바이트 거부. 한국어/일본어/영어 문구. 테스트 포함.

---

## 7. 라이브러리 등록이 신뢰 경계를 무너뜨림

**문제.** 라이브러리 경로는 "이 안은 앱이 마음대로 이름변경·이동·삭제·실행해도 되는 구역"이라는 **신뢰의 뿌리**입니다. 그런데 `libraries:add`는 렌더러가 보낸 아무 문자열이나 등록했습니다(`C:\`, 사용자 폴더, 앱 자신의 데이터 폴더 포함).

**원인.** 다른 모든 IPC가 "라이브러리 안인가?"로 안전을 판단하는데, 정작 라이브러리 목록 자체는 검증하지 않았습니다. 라이브러리를 `C:\`로 등록하면 그 뒤의 모든 경로 검사가 무의미해집니다. 앱 데이터 폴더(DB, 세이브 백업)가 라이브러리에 포함되면 그 파일들도 이름변경·삭제 대상이 됩니다.

**원리.** 신뢰의 뿌리는 **가장 엄격하게** 보호합니다. ① 허용하면 안 되는 위치를 코드로 금지 ② 사용자의 직접 행동이 필요한 변경은 네이티브 확인으로 보증.

**대처** (`electron/main/libraries/libraryPathPolicy.ts`, `ipc/librariesHandlers.ts`).
- 존재하는 폴더만. 앱 데이터 폴더와 그 상위(`C:\`, `C:\Users`, 사용자 프로필, AppData 등)·하위, `Windows`, `Program Files(x86)`, `ProgramData`(상·하위 포함) 금지. 다른 드라이브 전체(`D:\`)는 허용.
- 방금 **네이티브 폴더 선택창**에서 고른 경로와 같으면 그대로 등록, 직접 입력하거나 드래그한 경로면 네이티브 확인창.
- 테스트: 거부/허용 경로 케이스.

---

## 8. 실행 설정이 아무 형식이나 실행

**문제.** 게임 실행 설정은 "라이브러리 안의 경로"이면 되었고 형식은 보지 않았습니다. `.bat`, `.lnk` 등도 설정될 수 있었습니다.

**원인/원리.** 실행(`spawn`)은 가장 위험한 동작이므로 **허용 목록**(Windows 실행 파일만)으로 좁힙니다. 설정 시점과 실행 시점 **둘 다** 검사해 DB가 손상·변조된 경우도 막습니다(TOCTOU 방어).

**대처** (`ipc/launchHandlers.ts`). `.exe`가 아니거나 NUL을 포함하면 설정/실행 거부(실행 시에는 "실행 설정 없음" 오류와 동일하게 처리). 테스트: `.bat/.cmd/.lnk/.js/.exe.bat`/확장자 없음 거부.

---

## 9. libmpv가 파일이 시키는 대로 따라감

**문제.** mpv는 재생목록(`.m3u`), EDL, ASX, "ref" 파일 등이 가리키는 다른 파일·URL을 자동으로 열고, 설정에 따라 youtube-dl 훅과 Lua/JS 스크립트를 로드합니다. 악성 미디어가 외부 URL에 접속(IP 노출·SSRF)하게 하거나 의도치 않은 파일을 읽게 만들 수 있습니다. 또 `MPV_LOAD`는 검증한 경로가 아니라 **렌더러가 보낸 원본 문자열**을 mpv에 넘겼습니다(`edl://…`, `lavfi://…` 같은 mpv 의사 프로토콜 문자열이 검증을 우회할 여지).

**원인.** 재생기는 "재생"만 하면 되는데 기본 설정은 편의 기능이 많은 범용 플레이어용입니다.

**원리.** 최소 기능 원칙: 필요 없는 확장 기능은 끕니다. 그리고 **검증한 값을 그대로 사용**합니다(검증과 사용 사이에 값이 달라지지 않게).

**대처.** `mpv_addon.cc`에서 `access-references`, `load-unsafe-playlists`, `ytdl`, `load-scripts`, `config`, `audio-file-auto`, `input-default-bindings`, `input-vo-keyboard`, `osc`를 `no`로 설정(초기화 전). `ipc/mpvHandlers.ts`는 `path.resolve`한 절대경로만 mpv에 전달. ⚠ 네이티브 애드온이라 **재빌드해야 반영**됩니다(`npm run build:mpv-addon`).

---

## 10. 비밀값(API 키) 평문 저장

**문제.** 외부 메타데이터 API 키가 SQLite(`ark-manager.db`)에 평문으로 저장됐습니다.

**원인/원리.** DB 파일은 백업·동기화·복사되기 쉽고 다른 프로그램이 읽을 수 있습니다. OS가 사용자 계정에 묶어 관리하는 키로 **저장 시 암호화**하면, 파일만 유출된 경우 키가 노출되지 않습니다(Windows DPAPI = Electron `safeStorage`). 같은 사용자 계정으로 실행되는 악성코드에는 소용이 없다는 한계는 있습니다.

**대처** (`database/secretStore.ts`, `settingsRepository.ts`). `SECRET_KEYS`에 속한 설정은 읽고 쓸 때 자동으로 `enc:v1:<base64>`로 변환. 암호화 불가 환경에서는 기존과 같이 평문 저장(기능 유지). 시작 시 기존 평문 값을 자동 이전(`migrateSecretSettings`). 복호화 실패 시 빈 문자열 반환. 테스트 4개.

---

## 11. 패키징된 앱의 변조 경로 (Electron Fuses)

**문제.** Electron 실행 파일에는 `ELECTRON_RUN_AS_NODE`나 `NODE_OPTIONS`, `--inspect` 같은 진입점이 기본으로 살아 있어, 설치된 앱 실행 파일이 임의 JavaScript 실행기로 악용(LOLBin)되거나 디버거가 붙을 수 있습니다.

**원리.** Fuses는 빌드 시 실행 파일에 기록하는 스위치로, 런타임에 우회할 수 없습니다.

**대처** (`package.json` → `build.electronFuses`). `runAsNode:false`, `enableNodeOptionsEnvironmentVariable:false`, `enableNodeCliInspectArguments:false`, `enableCookieEncryption:true`, `onlyLoadAppFromAsar:true`. ⚠ 설치본으로 동작 확인 필요(특히 mpv 유틸리티 프로세스와 자동 업데이트).

---

## 12. 제3자 바이너리 변조 감지 (`libmpv-2.dll`)

**문제.** 저장소가 소스 없이 포함하는 DLL이 교체돼도 알 방법이 없었습니다. 이 DLL은 설치본에 그대로 들어가 사용자 PC에서 실행되므로 공급망 공격의 전형적인 표적입니다.

**원리.** 해시는 파일 내용의 지문입니다. 알려진 올바른 해시를 별도로 기록해 두고 빌드·배포 때마다 비교하면 사후 교체를 즉시 알 수 있습니다.

**대처.** `electron/native/mpv-addon/CHECKSUMS.sha256`(현재 파일의 SHA-256) + `scripts/verify-native-binaries.mjs`. `npm run build`/`release`가 먼저 이 검사를 실행하고 불일치하면 중단(해시를 바꿔 불일치가 나는 것까지 확인). ⚠ 기록한 해시는 "현재 저장소의 파일" 기준이므로, 최초 다운로드한 공식 배포본과 대조는 직접 해야 합니다.

---

## 13. 점검했으나 문제가 없던 곳 (근거)

- `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `window.open`, `<a href>`, `<iframe>`은 렌더러 코드에 없음 → 크롤링한 제목·태그가 스크립트로 해석될 경로 없음. 업데이트 릴리스 노트는 cheerio로 태그를 제거한 텍스트로만 표시.
- 다른 `child_process` 사용은 ffmpeg(`execFile` + 인자 배열)와 실행 파일 `spawn`(셸 없음).
- SQL은 Drizzle 바인딩(동적 DDL은 상수 이름만).
- 모든 IPC가 Zod `parse`, 파일 조작은 라이브러리 경계(`path.resolve` 후 비교)를 확인. 세이브 폴더·커스텀 표지·미디어 썸네일은 "방금 선택창에서 고른 경로"만 허용.
- 저장소 전체 이력에 토큰/키 형태의 문자열 없음, 모든 npm 패키지가 공식 레지스트리 + 무결성 해시로 잠김.

---

## 13.1 미디어 전체 화면 작업에서 추가된 입력 경로 (2026-11-23)

**문제가 될 수 있던 점.** 새 기능이 렌더러가 보낼 수 있는 값을 늘렸습니다: 표지 정보 조회, 큰 표지 프로토콜 호스트, 장면 미리보기 요청, 창 전체 화면 요청. 각각이 "파일 경로를 받아 읽는다"거나 "렌더러가 지정한 파일을 mpv로 연다"로 번지면 라이브러리 경계가 무너집니다.

**원리와 대처.**
- `media:get-cover-info`와 `mediathumb://cover`는 기존 썸네일과 같은 미디어 신뢰 경계를 씁니다. 경계 밖 요청은 예외 대신 "표지 없음"과 같은 모양으로 응답해, 응답 차이로 "이 경로에 파일이 있는가"를 알아내지 못하게 했습니다(프로토콜은 404).
- `mpv:preview-frame`은 **경로를 아예 받지 않습니다.** 스키마가 `.strict()`라 `path`를 끼워 넣으면 무시되지 않고 거부됩니다. 메인이 이미 경계 검증을 마친 "지금 재생 중인 파일"만 미리보기 mpv에 넘기므로, 렌더러가 조작할 수 있는 것은 시각(유한한 0 이상 숫자)과 세대 번호뿐입니다. 미리보기 mpv는 애드온 `init`의 허용 목록 옵션(`{preview: true}`)으로만 켜지며 본 mpv의 보안 옵션을 그대로 가지고, `ao=null`/일시정지라 소리를 내지 않습니다.
- `window:set-fullscreen`은 불리언과 이유 문자열만 받고 호출한 창에만 작용합니다.
- 검증: `shared/types/ipc.test.ts`(`.strict()`가 `path`/`filePath`를 거부, 음수·NaN·±Infinity 거부), `mpvPreviewHandlers.test.ts`, `mpvPreviewManager.test.ts`(요청에 실린 경로가 무시되고 메인의 현재 경로가 쓰임), `mediaThumbnailHandlers.test.ts`(경계 밖 응답이 "표지 없음"과 동일), 프로토콜 테스트(경계 밖 404).

---

## 14. 이번에 하지 않은 것 (후속 작업)

`docs/SECURITY.md` §3 표와 같습니다: 렌더러 `app://` 프로토콜 전환 + `grantFileProtocolExtraPrivileges` off, ASAR 무결성 Fuse, 심볼릭 링크/정션 경유 경계 우회(`realpath` 검증), `ffmpeg-static` 설치 시 다운로드 통제, 프로덕션 DevTools 메뉴 제거, 코드 서명, 개발 전용 취약점 정리. 각각의 해결 방법은 대화로 따로 안내했습니다.

## 15. 검증 현황

- 자동: 단위 테스트 1009개 통과(141개 파일), `tsc --build` 통과, ESLint 오류 0, `electron-vite build` 성공, 빌드된 `index.html`에 CSP 삽입 확인, `npm audit --omit=dev` 0건.
  - **2026-11-23 재실행**: 테스트 1009/1009·타입체크는 통과. 하지만 `npm run lint`는 **오류 5건으로 실패**합니다. 원인은 마지막 커밋(`aa51de8`)에 추가된 `scripts/verify-native-binaries.mjs`에서 `console`/`process`가 no-undef로 잡히는 것입니다(ESLint 설정에 `.mjs`용 Node globals 없음). 위의 "ESLint 오류 0"은 이 스크립트를 추가하기 전 결과입니다.
- 재검증에서 새로 확인한 잔여 위험(`SETTINGS_SET` 값 무검증 등)은 `docs/SECURITY.md` §3.1을 참고하세요.
- 수동 필요: 실제 앱 실행(CSP·표지·미디어 재생·단축키·분리 창), mpv 애드온 재빌드 후 재생, 설치본(Fuses, 자동 업데이트). 체크리스트는 `docs/SECURITY.md` §2.
