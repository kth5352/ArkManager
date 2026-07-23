# DLibrary 초기 셋업 설계

## 배경

DLibrary는 DLsite에서 구매한 게임을 Steam 라이브러리처럼 관리하는 Windows용 Electron 데스크톱 앱이다. 현재 프로젝트 디렉터리는 비어 있으며, 이 문서는 최초 스캐폴딩 및 사용 라이브러리 선정을 다룬다.

## 범위

**포함**
- Electron main/preload/renderer 프로세스 구조
- Vite + TypeScript + Tailwind CSS 빌드 설정
- ESLint / Prettier 설정
- 상태관리(Zustand) / 서버 상태(React Query) 셋업
- UI 컴포넌트 라이브러리 설치 및 기본 컴포넌트 추가
- SQLite 접근 계층(드라이버/ORM) 설정
- 가상 스크롤 라이브러리 설치
- 라우팅/페이지 구조 스켈레톤
- 빈 Gallery / List / Detail / Settings 페이지 뼈대
- IPC 통신 골격 (타입 공유 포함)

**제외 (다음 단계에서 별도 브레인스토밍)**
- 실제 폴더 스캔 로직
- DLsite 메타데이터 크롤링
- 이미지 캐시 로직
- 실제 SQLite 스키마 설계 및 쿼리
- 즐겨찾기/메모/평점 등 Future 항목

## 라이브러리 선정

| 영역 | 선택 | 사유 |
|---|---|---|
| Electron 빌드 도구 | electron-vite | main/preload/renderer를 하나의 설정으로 통합 관리, HMR 지원, electron-builder와 궁합 좋음 |
| UI 컴포넌트 | shadcn/ui (Radix + Tailwind) | 코드가 프로젝트 내부에 위치해 자유롭게 커스터마이징 가능, Tailwind와 자연스럽게 결합, 다크모드 기본 지원 |
| 아이콘 | lucide-react | shadcn/ui와 표준적으로 짝을 이루는 아이콘 세트 |
| 가상 스크롤 | react-window | 고정 크기 그리드/리스트에 최적화된 최소 오버헤드 구현체. 게임 카드 썸네일은 균일한 크기이므로 동적 높이 측정 기능이 불필요해 react-window의 단순함이 유리 |
| 상태관리 | Zustand | 요구사항에 명시 |
| 서버 상태/캐싱 | React Query | 요구사항에 명시 |
| 라우팅 | TanStack Router | React Query와 동일 생태계, 타입 안전한 라우트 정의, 디테일 페이지를 URL로 관리 가능 |
| 폼 | react-hook-form + zod | 가벼운 리렌더링, zod로 타입과 검증 로직을 동시에 선언, IPC 데이터 타입과 스키마 공유 가능 |
| 애니메이션 | Framer Motion | Steam 스타일 카드 hover, 페이지 전환, 레이아웃 애니메이션을 선언적으로 구현 |
| DB 드라이버 | better-sqlite3 | Electron main 프로세스에서 널리 쓰이는 동기식 드라이버, IPC 핸들러에서 콜백 지옥 없이 사용 가능 |
| ORM | Drizzle ORM | TS-first 경량 ORM, 스키마에서 타입 자동 추론, Repository 패턴과 자연스럽게 결합, drizzle-kit으로 마이그레이션 관리 |
| 패키징 | electron-builder | electron-vite와 표준적으로 함께 쓰이는 배포 패키징 도구 |
| 이미지 처리 | Sharp | 요구사항에 명시 |
| 린트/포맷 | ESLint + Prettier | 요구사항에 명시 |

## 폴더 구조

```
DLibrary/
├── electron/
│   ├── main/
│   │   ├── index.ts
│   │   ├── ipc/            # IPC 핸들러 (library, game 등 도메인별)
│   │   ├── database/       # drizzle schema, client, repositories
│   │   ├── scanner/        # (다음 단계) 폴더 스캔 로직
│   │   ├── metadata/       # (다음 단계) DLsite 메타데이터 수집
│   │   └── cache/          # (다음 단계) 이미지 캐시
│   └── preload/
│       └── index.ts        # contextBridge로 노출할 API
├── src/                     # renderer
│   ├── components/
│   │   └── ui/             # shadcn 컴포넌트
│   ├── pages/
│   │   ├── Gallery/
│   │   ├── List/
│   │   ├── Detail/
│   │   └── Settings/
│   ├── hooks/
│   ├── services/           # IPC 호출 래퍼 (React Query와 연결)
│   ├── stores/             # Zustand
│   ├── router.tsx
│   └── main.tsx
├── shared/
│   └── types/              # main/renderer 공유 타입 (IPC 계약, zod schema)
├── electron.vite.config.ts
├── drizzle.config.ts
├── tailwind.config.ts
├── tsconfig.json / tsconfig.node.json
├── .eslintrc / prettier config
└── package.json
```

## 아키텍처 / 데이터 흐름

- `preload/index.ts`가 `contextBridge`를 통해 `window.api` 형태로 타입 안전한 함수를 renderer에 노출한다.
- `src/services/`는 `window.api` 호출을 감싸서 React Query 훅(`useQuery`/`useMutation`)으로 제공한다. 컴포넌트는 서비스 훅만 사용하고 IPC를 직접 호출하지 않는다.
- IPC 채널 이름과 payload 타입은 `shared/types`에 zod 스키마로 정의하여 main/preload/renderer가 동일한 계약을 참조한다.
- DB 접근은 `electron/main/database/`의 Repository 클래스를 통해서만 이루어지며, IPC 핸들러는 Repository를 호출하는 얇은 계층으로 유지한다.
- 페이지 전환은 TanStack Router가 담당하며, Gallery/List 전환 같은 뷰 모드 토글은 Zustand 스토어 값으로 관리한다(URL을 바꾸지 않는 뷰 상태).

## 개발 워크플로우

- `npm run dev`: electron-vite dev 서버 실행, HMR 적용된 Electron 창 표시
- `npm run build`: electron-vite build + electron-builder 패키징
- `npm run lint` / `npm run typecheck`: ESLint + `tsc --noEmit`
- `npm run db:generate` / `db:migrate`: drizzle-kit 스키마 마이그레이션 (다음 단계에서 실제 스키마 추가 시 사용)

## 이번 단계 완료 기준 (Definition of Done)

- `npm run dev` 실행 시 1초 내외로 Electron 창이 뜨고 Gallery/List/Detail/Settings 빈 페이지 간 라우팅 전환이 동작한다.
- shadcn/ui 기본 컴포넌트(Button, Dialog, Tabs, Tooltip 등)가 설치되어 있고 다크모드 토글이 가능하다.
- Zustand 스토어, React Query Provider, TanStack Router가 renderer에 연결되어 있다.
- better-sqlite3 + Drizzle 클라이언트 연결 코드가 존재하며, 실제 테이블 없이도 앱이 정상 기동한다.
- ESLint, Prettier, TypeScript strict 모드가 모두 에러 없이 통과한다.
- 실제 스캔/메타데이터/이미지 캐시/DB 스키마 로직은 포함하지 않는다 (다음 단계 스펙에서 다룸).

## 다음 단계

1. SQLite 스키마 설계 (libraries, games 테이블 등) 및 Repository 구현
2. 폴더 스캐너 구현 (확장자 필터링, RJ 번호 정규식 추출)
3. DLsite 메타데이터 수집기 구현
4. 이미지 캐시 로직 구현 (cache/RJ123456.webp)
5. 실제 Gallery/List/Detail UI에 데이터 연결
