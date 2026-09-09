# Ark Manager UI 개편 인수인계 — 여기부터 읽기

2026-09-09 / 조사 기준 `15cdc17` / 앱 버전 `1.1.1`.

## 현재 요청과 상태

사용자는 전체 UI를 차분하고 세련되게 정리하고, 다양한 조작에 부드럽고 짧은 애니메이션을 넣는 방향을 승인했다. HoverTooltip 확산, SettingsPage 라이브러리 애니메이션, Pretendard 수정의 실앱 육안 확인을 포함한다. 성능 개선 지점과 오류 가능성도 조사해 실행 계획에 포함하도록 요청했다.

**이 세션은 계획까지만 요청받았으므로 제품 소스 수정은 하지 않았다.** 구현은 다른 모델 또는 Claude가 담당한다. 다음 실행자가 사용자의 구현 지시를 받으면 아래 합의된 방향을 이용하며, 전체 브레인스토밍을 처음부터 반복할 필요는 없다. 세부 색상/간격은 설계의 시작값을 기준으로 실앱에서 조정한다.

## 문서 4개와 읽는 순서

1. 이 문서: 범위·실행 프롬프트·검증 baseline.
2. [설계](superpowers/specs/2026-09-09-ui-renewal-design.md): 시각 기준, 모션/Tooltip 계약, 기능 보존, 검증 기준.
3. [성능·안정성 계획](superpowers/plans/2026-09-09-performance-reliability-plan.md): 조사 근거, 우선 오류 수정, 측정 후 성능 개선.
4. [UI 실행 계획](superpowers/plans/2026-09-09-ui-renewal-plan.md): 파일별 작업, 인터페이스, 구현 예제, 체크박스, 완료 조건.

처음에는 설계와 실행할 task를 읽으면 된다. 기존 `.superpowers/sdd/progress.md` 전체는 매우 크므로 필요한 마지막 섹션과 관련 키워드 주변만 읽는다. 작업마다 전체 코드베이스를 다시 조사하지 않는다.

## 실행 단위와 순서

| 묶음 | 작업 | 완료 산출물 |
| --- | --- | --- |
| 1. 안전성·측정 | R0 lint, R1 별점/메모, R2 저장 비교, P0 baseline | 재현 테스트, 실제 검증 결과, 초기 성능 수치 |
| 2. 공통 UI | U1 토큰/모션, U2 Tooltip, U3 앱 틀 | light/dark 공통 컨트롤과 탐색 |
| 3. 목록 비용 | P1 파생 계산, P2 표지 캐시 | 이전과 같은 결과, 전후 측정 |
| 4. 라이브러리 화면 | U4 Gallery/List/Detail, U5 Explorer/기타, U6 Settings | 기능 보존한 화면별 변경 |
| 5. 미디어·저장 | P3 동기화, U7 Media, U8 Saves/작업 피드백 | 재생 수명·복원 정책 유지 |
| 6. 선택 조사·최종 확인 | D1–D4 조사, U9 실앱 검증 | 조사 결론, 화면 증거, 남은 항목 |

D1–D4는 측정·재현 후 필요할 때만 구현한다. UI 과제는 단순히 조사만 하고 끝내는 항목이 아니다. 각 task의 완료 조건을 충족해야 한다.

## 이번에 확인한 문제

- **초기 별점·메모 데이터 손실 가능성:** RatingMemoSection이 GET 완료 전 편집을 허용하고 미확정 다른 필드를 함께 저장한다. 코드 경로 확인, 실앱 미재현. R1에서 DOM 회귀 재현 후 수정한다.
- **저장 비교 오류 처리:** 읽지 못한 폴더를 빈 것으로 취급한다. 읽기 전용 함수 재현에서 없는 대상 폴더에 대해 16개 `removed` 결과를 정상 반환했다. 실제 복원 target 부재는 정상 사용 사례라 R2에서 명시적 save/restore mode로 구분한다.
- **lint 범위:** 현재 449개 error는 전부 `.superpowers/spikes` 실험 파일이다. `.worktrees` 복제 코드까지 검사한다. 앱 소스를 무차별 수정해서 해결할 문제가 아니다.
- **성능 후보:** 매 render 목록 파생 계산, 표지 base64 재요청, 동기화 대상과 무관한 미디어 UI 상태 변화의 전체 queue 방송. 비용 경로는 확인했지만 사용자 체감 개선 수치는 아직 없다.

나머지 낮은 확신 항목의 근거·진행 조건은 성능·안정성 계획의 D1–D4를 따른다. 새 보안 취약점이나 네이티브 엔진 결함이 확인됐다고 해석하지 않는다.

## 이번에 실행한 검증

| 항목 | 결과 |
| --- | --- |
| `npm run typecheck` | 통과 |
| `npm test -- --reporter=dot` | 116 test files, 840 tests 통과 |
| `npm run lint` | 실패: 449 errors, 2 warnings |
| lint 결과 파일별 집계 | errors 전부 로컬 실험 스크립트, warnings 본 소스/별도 worktree button 각 1개 |
| 저장 비교 읽기 전용 재현 | 없는 우측 폴더를 오류로 처리하지 않는 동작 확인 |
| 앱 실행/시각 검사/성능 프로파일/native 패키징 | 미실행 |

이후 실행자는 실제 새 검사 결과를 남긴다. 이번 baseline을 그대로 자신의 검증 결과로 복사하지 않는다. Node의 package type warning 때문에 package.json의 type을 임의 변경하지 않는다.

## 토큰을 아끼는 실행 규칙

- 기본은 한 모델이 한 묶음씩 순차 구현한다. 사용자가 병렬 에이전트를 원할 때만 파일 소유권을 나눠 진행한다.
- 각 task 시작 시 설계의 공통 계약과 해당 task를 읽고, 코드 검색/읽기를 묶어서 수행한다.
- CSS 값 변경마다 전체 테스트를 돌리지 않는다. 상태 로직 변경은 실패 재현→최소 수정→관련 검사, 묶음 끝에서 전체 검사한다.
- 브랜치/커밋 정책은 실제 환경을 확인한다. 이번 문서는 자동 push/release/native dependency 재설치 권한을 부여하지 않는다.
- 성능 개선은 측정된 비용부터 한다. 메모이제이션·캐시를 넣었다는 사실 자체를 개선 증거로 쓰지 않는다.
- 어떤 스킬을 사용할 수 없더라도 사용자의 요청과 이 문서의 기능/검증 계약을 따른다. 기술적으로 필요한 결정이 아니면 반복적으로 디자인 승인을 요청하지 않는다.

## 다음 모델 또는 Claude에 붙여 넣을 프롬프트

```text
현재 프로젝트 Ark Manager의 UI 개편을 구현해줘.
docs/2026-09-09-ui-renewal-handoff.md부터 읽고,
연결된 design과 UI/performance-reliability plan에 따라 진행해줘.

디자인 방향은 승인됐어: 차분한 배경, 표지 중심, 은은한 포인트 색,
짧고 일관된 동작 애니메이션, 모든 기존 기능 보존.
HoverTooltip 확산, SettingsPage 애니메이션,
Pretendard 실제 앱 육안 검증까지 포함해줘.

우선 R0/R1/R2/P0로 오류 재현·수정과 baseline을 준비하고,
U1~U3 공통 기반을 만든 뒤 문서의 순서대로 전체 구현을 이어가줘.
P1/P2/P3은 전후 성능을 측정하고, D1~D4는 조사 결과가 있을 때만 고쳐줘.
새 계획을 처음부터 다시 만들지 말고 기존 파일·합의·진행 상태를 확인해.
토큰 절약을 위해 순차 직접 실행하고, task 단위로 검사·기록해줘.
파일/세이브/재생 동작을 보존하고 실패 테스트나 시각 검증을 꾸며내지 마.
실앱 검증을 할 도구가 없으면 그 부분만 미완료로 분명하게 기록해줘.
이 요청은 구현까지 포함하지만 push/release는 하지 마.
```

한 세션에서 묶음 하나만 맡기려면 마지막에 `이번 세션은 묶음 1까지만 구현하고 체크 결과를 남겨줘`처럼 범위를 지정한다. 다음 세션은 ledger와 마지막 결과를 읽고 이어간다.

## 진행 기록 형식

각 task 종료 시 `.superpowers/sdd/progress.md`의 새 ui-renewal 섹션에 아래 형태로 추가한다.

```text
Task: U1 (예시 형식, 완료 기록 아님)
Status: not-started / implementing / code-verified / visually-verified / blocked
Changed files: 실제 변경 목록
Commit or diff: 실제 값
Checks: 실행한 명령, exit code, 결과
Visual evidence: 실제 이미지 경로 또는 not-run + 이유
Performance evidence: 실제 수치 또는 not-applicable/not-run
Remaining: 남은 검사/문제 및 재현 절차
Next: 바로 이어서 할 task
```

## 다른 checkout으로 옮길 때

`docs/superpowers/`와 `.superpowers/`는 현재 gitignore 대상이다. 이 진입 문서만 Git으로 옮기면 연결된 3개 상세 문서가 누락될 수 있다. 같은 workspace의 모델 전환에서는 그대로 읽을 수 있다. 다른 checkout/컴퓨터에는 위 **4개 문서를 함께 복사**하거나, 이 세 개 상세 문서만 경로를 지정해 force-add한다. ignored 폴더 전체를 stage하지 않는다.
