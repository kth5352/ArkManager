# Ark Manager

DLsite / Steam 게임 라이브러리를 한 곳에서 관리하는 Windows용 데스크톱 앱입니다. 폴더를 라이브러리로 등록해두면 RJ/VJ/ST 코드가 붙은 파일을 자동으로 인식하고, 표지·제목·태그까지 크롤링해서 보여줍니다.

## 주요 기능

- **세 가지 서재 보기** — 표지 그리드(Gallery), 한 줄 목록(List), 컬럼별 상세 표(DetailList). 검색, 태그 포함/제외 필터, 파일 종류 필터, 중복 검사, 라이브러리별 표시/숨김, 정렬을 모든 화면에서 동일하게 제공
- **상세 사이드바** — 클릭 한 번으로 열리는 사이드바에서 평점/메모(자동 저장), 실행 설정(Locale Emulator 연동 포함), 세이브 데이터 관리, DLsite 코드 수동 연동/해제, 커스텀 표지 지정까지 한 번에
- **다중 선택 & 일괄 작업** — `{code}` `{circle}` `{title}` `{genres}` `{index}` 같은 토큰으로 패턴을 짜는 일괄 이름변경(실시간 미리보기), 일괄 이동/삭제
- **Explorer** — 탭 기반 폴더 탐색기, 현재 폴더 하위 전체를 훑는 재귀 검색
- **DLsite 검색** — 코드 또는 제목으로 검색해 상세 메타데이터를 바로 크롤링
- **즐겨찾기 / 최근 플레이** — 플레이타임과 마지막 실행일 추적
- **내장 미디어 플레이어** — 재생목록, 반복 모드, 별도 창으로 분리, 전역 단축키(탐색/볼륨/재생), 페이지 이동 중에도 재생 유지
- **세이브 데이터 백업/복원** — 스냅샷 생성/복원 전 diff 미리보기
- **다국어** — 한국어 / 日本語 / English, 다크·라이트 모드

## 기술 스택

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- React 19 + TypeScript (strict)
- Tailwind CSS v4 + shadcn/ui
- Zustand · TanStack Query · TanStack Router
- Drizzle ORM + better-sqlite3
- react-window (가상 스크롤) · Vitest

## 시작하기

### 요구 사항

- Node.js (버전은 `.nvmrc` 참고)
- Windows (better-sqlite3 네이티브 모듈 빌드를 위한 빌드 도구 필요)

### 개발 모드

```bash
npm install
npm run dev
```

### 프로덕션 빌드 (설치 파일 생성)

```bash
npm run build
```

`electron-vite build`로 렌더러/메인 프로세스를 빌드한 뒤 `electron-builder`로 Windows NSIS 설치 파일을 만듭니다. 결과물은 `dist/`에 생성됩니다 (`dist/win-unpacked/`에 압축 안 된 실행 파일, `dist/Ark Manager Setup {version}.exe`에 설치 파일).

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 모드 실행 (HMR) |
| `npm run build` | 프로덕션 빌드 + 패키징 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 프로젝트 참조 빌드 |
| `npm run test` | Vitest |
| `npm run format` | Prettier로 포맷 |
| `npm run format:check` | 포맷 검사만 |

## 프로젝트 구조

```
electron/
  main/       # 메인 프로세스 - IPC 핸들러, DB, 스캐너, DLsite/Steam 크롤러, 파일 작업, 미디어 프로토콜
  preload/    # 렌더러에 노출하는 안전한 API 브리지 (contextBridge)
src/
  pages/      # 화면 단위 - Gallery, List, DetailList, Explorer, DLsite 검색, 즐겨찾기, 최근 플레이, 미디어, 세이브, 설정
  components/ # 공용 UI 컴포넌트 (game/, media/, layout/, ui/)
  hooks/      # 커스텀 훅
  services/   # React Query 기반 IPC 래퍼
  stores/     # Zustand 스토어
  i18n/       # 다국어 번역
shared/       # 메인·렌더러 공용 타입 및 IPC 스키마 (Zod)
```

## 데이터베이스

앱 자체 SQLite(`better-sqlite3`)를 사용하며, 스키마는 `electron/main/database/client.ts`에서 `CREATE TABLE IF NOT EXISTS` + 컬럼 백필 방식으로 직접 관리합니다. `npm run db:generate`/`npm run db:migrate`는 `drizzle-kit` 스키마 정의 참고용으로만 존재하며, 런타임 마이그레이션 파이프라인으로는 쓰이지 않습니다.

## 신뢰 경계

렌더러가 접근할 수 있는 모든 파일 시스템 작업(미디어 재생, 썸네일, 이름변경/이동/삭제, 실행 파일 지정 등)은 등록된 라이브러리 경로 아래로만 허용되도록 메인 프로세스에서 검증합니다.

## 참고 링크
https://claude.ai/code/artifact/07c8251d-9a05-4ec0-a715-0af2c2f79067
