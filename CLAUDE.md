# Ark Manager

로컬 동인 소프트(DLsite/Steam/VNDB/Getchu 게임, ASMR·음악·영상 파일)를 식별 코드로 관리하는 Windows용 Electron 앱.

## 먼저 읽을 문서
- `docs/FEATURES.md` — 기능 동작·규칙·파일 위치·작업 시 지킬 규칙 (작업 전 필독)
- `ARCHITECTURE.md` — 설계 판단과 그 이유

## 핵심 규칙 요약
- 새 IPC: `shared/types/ipc.ts`(상수+Zod) → `electron/main/ipc/*Handlers.ts` → `electron/preload/index.ts` → `src/services/*`
- 파일 시스템 접근 핸들러는 `isPathWithinAnyLibrary`로 라이브러리 경계 검증
- DB 스키마 변경 시 `schema.ts`와 `database/client.ts` 둘 다 수정
- UI 문자열은 `src/i18n/translations.ts`에 ko/ja/en 모두 추가
- 검증: `npm run typecheck`, `npm run lint`, `npm test`
