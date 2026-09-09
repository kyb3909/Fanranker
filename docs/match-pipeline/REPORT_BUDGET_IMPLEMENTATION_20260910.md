# 리포트 작성 예산 구현 검토 메모

기준: `CODEX_BRIEF_report_budget_20260910.md`. 운영 DB 적용·배포는 하지 않았다.

## 변경

- `lib/soccerway/match-extras.ts`: 추출 결과 재사용, 사건 선수 사전 검사, 실명 허용 목록, 입력 버전 계산, 작성 직전 예약, 호출별 결과 기록, 검증 원고 우선 저장/재저장.
- `lib/soccerway/report-budget.ts`: 본문 정규화·필수 사건 선수 집합·입력 해시.
- `lib/soccerway/report-work.ts`: 보존 입력, 예약 RPC, 사전 보류 원장, 원고 읽기, 7일 재검사 대상.
- `app/api/cron/match-reports/route.ts`: 기존 대상에 보존 입력이 있는 재시도 대상·검증 원고 추가. 기존 15분 스케줄·성공 3건·90초 제한 유지.
- `app/admin/_dashboard/report-budget-card.tsx`, `app/api/admin/match-reports/route.ts`: 보류 목록, 사유를 남기는 예산 3회 추가, 원문 수동 재수집. 읽기는 staff, 변경은 admin 권한.

## 마이그레이션 검토 사항

`supabase/migrations/20260910_report_attempt_budget.sql`은 파일만 작성했다.

- 요청한 원장 컬럼과 `(game_id, input_version, compose_index)` 유니크 인덱스를 추가한다. 기존 원장 행은 새 컬럼이 모두 null이다.
- 별도 JSONB 보존 위치로 `match_report_work.context`를 사용한다. 기사·원문 문단·추출 사건·근거·라인업·스탯·확정 스코어를 보존한다. 같은 표의 만료 잠금으로 추출부터 작성까지 동일 경기의 동시 실행을 막는다.
- `claim_match_report`, `reserve_report_compose`, `finish_report_compose`, `resume_match_report` RPC와 관제 조회용 `match_report_work_status` 뷰를 추가한다. RPC와 내부 데이터는 service_role만 사용할 수 있다.
- 예약 계산과 삽입은 한 트랜잭션이다. 작성 6회 및 수동 재개당 추가 3회를 SQL에서 계산한다. 만료된 예약도 사용량에 포함한다. 만료되거나 교체된 작업자는 결과를 덮어쓸 수 없다.
- 베트맨 형제 행은 생성 시각·ID 순으로 정한 대표 행의 예산을 공유한다. 저장 여부와 원고 조회는 연결된 LFA 행까지 확인한다.

## 운영 동작

- 사건 추출은 최초 한 번 필요하다. 추출이 보존된 이후 사전 누락 보류 재검사는 작성·검증·재추출 호출이 없다. 사건 밖 `note`·`chance` 선수만 미등재인 경우에는 보류하지 않는다.
- 사전은 재검사 때 DB에서 새로 읽는다. 일부 이름만 채워졌다면 부족한 목록만 갱신한다. 전부 채워지거나 스코어·규칙 버전이 바뀌면 새 입력 버전으로 진행한다.
- 공급자가 실제 종료 시각을 별도 제공하지 않는 현재 저장 형태에 맞춰, **리포트 경로가 최초로 확정 종료 결과를 확인한 시각**을 7일 창의 기준으로 보존한다. 재시도나 점수 정정으로 이 시각을 뒤로 미루지 않는다.
- 관리자가 누르는 재개는 같은 버전에 예산 3회를 추가하고 같은 예약·검증 경로로 실행한다. 자동 7일 창이 지난 보류도 명시적인 수동 재개로 처리할 수 있다. 이 요청은 `manual_resume`으로 DB에 남아 다음 크론이 이어받는다. 중간에 빈 응답이나 타임아웃이 나도 남은 예산을 잃지 않으며, 검증 원고 확보 또는 예산 소진 시 수동 요청을 닫는다.
- 원문 다시 받기는 캐시를 우회한다. 정규화한 본문이 같으면 추출과 예산을 유지한다. 바뀌면 다음 실행에서 새 원문을 추출한다. 자동 재수집은 추가하지 않았다.
- 검증된 원고는 예약 결과와 같은 트랜잭션에 보존한다. 저장 실패 시 다음 실행은 해석·작성·검증 전에 보존 원고부터 저장한다. 검증 원고 저장 재시도에는 7일 제한을 적용하지 않는다.
- `PROMPT_VERSION`, `VERIFY_RULE_VERSION`은 `match-extras.ts`에 있다. 대응하는 프롬프트/검증 규칙을 바꿀 때 해당 버전도 올린다. 자동 3회 축소는 없다.
- 2주 뒤에는 원장의 `game_id + input_version + compose_index`와 `verify_passed`로 4~6회 구제 여부를 확인한다. 비용 검토용 모델·토큰 사용량은 `context.usageByAttempt[원장 id].compose/verify`에 보존한다. 사용량 응답이나 기록이 없으면 비용은 **미확인**이며 0원으로 취급하지 않는다. 이 메타데이터는 입력 해시에 포함하지 않는다.

## 검증

```powershell
pnpm.cmd exec vitest run __tests__/lib/soccerway __tests__/lib/match/report-persistence.test.ts __tests__/api/admin-match-reports.test.ts
pnpm.cmd exec tsc --noEmit --incremental false
node scripts/test-report-budget.mjs
```

SQL 검사는 로컬 메모리 PostgreSQL(PGlite)에서만 실행했다. 운영 연결이나 환경 변수를 읽지 않는다. 기존 `scripts/test-lfa-snapshots.mjs`와 같은 로컬 PGlite 설치를 사용한다. 설치가 없는 환경에서는 다음 명령으로 테스트 도구만 준비한다.

```powershell
npm.cmd install --prefix output/lfa-snapshot-test --no-package-lock --no-audit --no-fund @electric-sql/pglite
```

SQL 검증은 구문·유니크 제약·게임 잠금·만료 시 예산 유지·수동 추가 예산·검증 원고 보존·역할 권한을 확인한다. PGlite는 단일 연결이므로 실제 Supabase의 다중 세션 부하 시험을 대신하지 않는다. 새 스키마를 운영에 적용하지 않았으므로 운영 관제 버튼 및 실제 LLM 생성의 종단 간 시험은 수행하지 않았다.

팀명 조각 오판 검증기, 리그/인기 구단 목록, 기사 백오프, 회당 LLM 예산, 크론 스케줄은 수정하지 않았다.
