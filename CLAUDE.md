When a repository's documentation and its existing code disagree, follow the conventions used in the existing code, and in your final reply point out each inconsistency you found between the documentation and the code.

# Ark Manager

로컬 동인 소프트(DLsite/Steam/VNDB/Getchu 게임, ASMR·음악·영상 파일)를 식별 코드로 관리하는 Windows용 Electron 앱.

## 먼저 읽을 문서

- `docs/FEATURES.md` — 기능 동작·규칙·파일 위치·작업 시 지킬 규칙 (작업 전 필독). 현재 브랜치 상태는 §1.1, 남은 작업은 §20
- `ARCHITECTURE.md` — 설계 판단과 그 이유
- `docs/SECURITY.md`(결과·잔여 위험) / `docs/SECURITY_FIXES.md`(항목별 원리 설명)

## 핵심 규칙 요약

- 새 IPC: `shared/types/ipc.ts`(상수+Zod) → `electron/main/ipc/*Handlers.ts` → `electron/preload/index.ts` → `src/services/*`
- 파일 시스템 접근 핸들러는 `isPathWithinAnyLibrary`로 라이브러리 경계 검증
- DB 스키마 변경 시 `schema.ts`와 `database/client.ts` 둘 다 수정
- UI 문자열은 `src/i18n/translations.ts`에 ko/ja/en 모두 추가
- 검증: `npm run typecheck`, `npm run lint`, `npm test`

## 보안 규칙 (자세한 내용: `docs/SECURITY.md`)

- 폴더/파일 이름·미디어·이미지는 전부 신뢰할 수 없는 입력. 외부 프로세스에 `shell: true` 금지, 문자열 보간 금지
- 메인 프로세스의 외부 요청은 `electron/main/net/safeFetch.ts`, 이미지 디코딩은 `rasterImage.ts`만 사용
- 새 `BrowserWindow`는 `secureWebPreferences()` 사용, 원격 URL 로드 금지 (CSP는 프로덕션 빌드에서 주입)
- 파일을 실행하는 동작은 `.exe` 한정 또는 네이티브 확인창, 새 비밀값은 `SECRET_KEYS`에 추가
- 의존성 변경 시 `npm run audit:prod`, 설치는 `npm ci`
