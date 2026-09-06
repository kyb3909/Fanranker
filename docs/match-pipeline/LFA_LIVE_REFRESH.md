# LFA 실황 갱신 — 1단계

2026-09-07. 로컬 구현/회귀 검증 단계. 이 문서 작성 시 운영 DB 적용·배포·실경기 검증은 하지 않았다.

## 저장 계약

- `/api/cron/lfa-live`: 3분 간격, 킥오프부터 +4시간까지 매치센터 대상 리그. 이전 매치데이도 조회한다.
- `/api/cron/lfa-warm`: 15분 예열 유지. 상세는 +4시간 이후 보충하며, 이전 매치데이의 빈 상세 재시도 창(+6시간)도 포함한다.
- `createLfaRefreshSession`: 실행마다 목록/상세를 직접 취득한다. 날짜 목록은 날짜별 Promise, 상세는 LFA ID별 Promise로 중복 제거한다. 두 수집 모두 기존 정규화와 매칭기를 사용한다.
- 원본 요청 시작 시각을 저장한다. 같은 원본을 재사용한 시각을 최신 수집 시각으로 바꾸지 않는다. 목록·상세 각각의 시각도 보관한다.
- 상세 저장은 `write_lfa_match_snapshot`만 사용한다. LFA ID별 트랜잭션 잠금 아래 형제 행과 기존 LFA ID 복사본을 비교한다. 새 쓰기는 정렬 대표 game ID에 모으고 기존 복사본은 삭제하지 않는다.
- 오래된/동일 시각, 종료→비종료, 상세 출처 역행, 목록만 있는 불완전 응답의 덮어쓰기는 거절한다. 거절 시 DB가 선택한 기존 payload를 반환한다.
- 새 종료 점수 정정, VAR에 따른 점수 감소·이벤트 삭제는 허용한다. 점수 최대값이나 이벤트 개수로 최신성을 판단하지 않는다.
- 날짜 캐시도 조건부 원자 upsert를 사용한다. 이미 존재하는 일정을 일시적인 빈 목록으로 지우지 않는다.
- DB 에러는 페이지에서 기존 저장분으로 폴백하되, 크론에서는 실패로 드러낸다. 새 크론은 부분 실패나 처리 예산 초과 시 503과 경기별 결과를 반환한다.
- 24경기/동시 6개/90초 시작 제한. 오래된 저장분부터 선택하고 미처리는 `deferred`로 노출한다. 장기 실패가 슬롯을 차지하는 상황은 운영 관측 대상이다.

라인업 구매/보존, 확정 라인업 기반 불판, MOM, Soccerway 리포트, Betman 정산 정책은 이번 단계에서 변경하지 않는다.

## 적용 순서

1. 대상이 `gongnori.fan / ekysrlhdrapmsnrkytif`인지 확인한다. 다른 로그인 계정의 기본 프로젝트를 신뢰하지 않는다.
2. `supabase/migrations/20260907_lfa_atomic_snapshots.sql`만 적용한다. 관계없는 미적용 마이그레이션을 일괄 push하지 않는다.
3. 두 RPC와 두 보호 트리거/권한을 확인한 뒤 앱을 배포한다. **DB 적용 전 앱만 배포하면 저장 RPC가 없어 크론이 실패한다.**
4. 이전 버전 요청이 빠져나간 뒤 새 cron과 페이지 갱신을 함께 확인한다. 구버전 직접 upsert는 같은 행의 시각/종료 보호 트리거로 방어하지만, 형제 공통 잠금과 구성 원본 시각 비교는 새 RPC 경로의 계약이다.
5. 최소 여러 회차의 실제 경기에서 공급자 취득 로그, `match_details_cache`의 payload와 원본 시각, `cron_run_log`를 대조한다. 200만으로 정상 판정하지 않는다.

실제 공급자 변경이 없어도 취득 시각은 전진할 수 있다. 반대로 VAR로 이벤트 수가 줄어드는 것도 정상이다. 경기 분이 무조건 증가하거나 타임라인 길이가 비감소해야 한다는 검증 기준은 사용하지 않는다.

실황이 저장된 이후 화면 표시 지연, FT→MOM 및 리포트 연결은 실경기 검증 항목이며 로컬 테스트만으로 완료 판정하지 않는다. LFA 사용량은 `lfa_usage_log`로 실제 호출 수/크레딧을 측정한다.

## 되돌리기

앱을 이전 버전으로 되돌리면 기존 15분 상세 예열 경로가 복구된다. 새 SQL의 RPC/보호 트리거는 남겨도 기존 앱과 호환되므로 운영 중 제거할 필요가 없다. 상세/라인업/리포트 데이터는 삭제하지 않는다.

SQL 자체를 제거해야 한다면 앱 롤백 후 `guard_match_details_snapshot`, `guard_lfa_day_snapshot` 트리거부터 제거하고 두 쓰기 RPC와 `guard_lfa_snapshot_update()` 함수를 제거한다. 이는 저장 보호 해제이므로 별도 판단이 필요하다.

## 로컬 검증

```powershell
pnpm exec vitest run __tests__/lib/lfa/match-refresh.test.ts __tests__/lib/lfa/persist.test.ts __tests__/api/lfa-live.test.ts __tests__/api/lfa-warm.test.ts
pnpm exec tsc --noEmit
pnpm test
```

SQL은 운영 연결 없이 PGlite의 PostgreSQL 엔진으로 실행한다. 앱 package.json/lockfile은 바꾸지 않는다.

```powershell
npm install --prefix output/lfa-snapshot-test --no-package-lock --no-audit --no-fund @electric-sql/pglite
node scripts/test-lfa-snapshots.mjs
```

SQL 테스트는 대표 행/형제 복사본/역순 응답/동일 시각/FT 보호/VAR 정정/혼합 출처/불완전 응답/구버전 쓰기/날짜 캐시/ID 충돌/권한을 검증한다. **PGlite는 단일 연결이므로 실제 PostgreSQL 다중 연결 경쟁 테스트를 대신하지 않는다.**

로컬 결과: 전체 212개 파일 / 2,245개 테스트 통과, SQL 14개 시나리오 통과. 타입 검사와 변경 TypeScript 파일 ESLint 통과. 운영 DB·실경기 검증 결과로 해석하지 않는다.

다음 단계: 숫자 게이트, MOM 오류 격리·종료 근거, Soccerway 매핑 처리량과 합성 ID 문제를 각각 별도 변경으로 다룬다.
