# DLibrary

DLsite에서 구매한 게임을 Steam 라이브러리처럼 관리하는 Windows용 Electron 앱.

## 개발

```bash
npm install
npm run dev
```

## 스크립트

- `npm run dev` — 개발 모드 실행 (HMR)
- `npm run build` — 프로덕션 빌드 + 패키징
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript 프로젝트 참조 빌드
- `npm run test` — Vitest
- `npm run db:generate` / `npm run db:migrate` — Drizzle 마이그레이션

## 설계 문서

- 초기 셋업 스펙: `docs/superpowers/specs/2026-07-23-initial-setup-design.md`
- 이 구현 계획: `docs/superpowers/plans/2026-07-23-initial-setup-plan.md`
