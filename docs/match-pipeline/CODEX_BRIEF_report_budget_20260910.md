# 코덱스 작업 지시 — 리포트 파이프라인: 작성 전 사전 검사 + 입력 버전별 예산 + 보류/재개 (2026-09-10)

Claude 가 코드·원장을 조사하고 GPT 와 3차례 검토해 확정한 1단계 설계다. **범위 밖(§7)은 건드리지 않는다.**

## 0. 배경 — 지금 코드가 하는 것

`lib/soccerway/match-extras.ts`
- `generateMatchReport`: extract(사건 추출) → compose(작성, gpt-5.1) → 라틴 잔재 검사 → 숫자·소속·스코어 게이트 → verify(독립 LLM) 를 한 실행에 최대 3바퀴. 이름이 안 풀리면 verify 없이 compose 만 다시 부른다(`continue`). 최종 실패 사유만 `recordReportAttempt(..., "verify", …)` 한 줄.
- `getMatchExtras`(약 1013행): 24시간 창(`REPORT_HOLD_WINDOW_MS`) 안 verify 실패 **실행** 이 `REPORT_VERIFY_CAP`(3) 이상이면 `"held"` 를 남기고 멈춘다. 재개는 수동뿐이고, 관제 화면에 held 표시가 없다.
- 크론 `app/api/cron/match-reports/route.ts`: 15분, 회당 성공 3건, 90초 예산. 매치 페이지 `after()` 도 같은 함수를 부른다.
- 원장 `match_report_attempts(id, game_id, event_id, stage, reason, attempted_at)`.

문제(원장 실측, 2026-09-03~09):
- 사전에 없는 선수(Karl Hein·Adam Daghim·Nico Paz …)가 사건에 나오면 실행당 compose 를 최대 3번 부른 뒤 실패, 상한(3실행)까지 최대 9번 헛돈을 쓴다. 사람이 이름을 넣기 전엔 절대 안 풀린다.
- 검증기가 팀명 조각(TSG·VfB·AFC·SK·BC)을 선수명으로 오판(9/7 17회) — 이건 별도 항목(4번)이라 여기서 안 다룬다.
- 멈춘 뒤 사전을 채워도 자동으로 안 살아난다. 쌍 단위 기록이 없어 "3쌍이면 충분한가"를 잴 수 없다.

## 1. 원장 확장 — 마이그레이션 파일만 작성 (적용은 Claude/운영자)

`supabase/migrations/20260910_report_attempt_budget.sql`. `match_report_attempts` 에 컬럼 추가:

| 컬럼 | 타입 | 뜻 |
|---|---|---|
| `input_version` | text | §3 의 입력 버전 해시 |
| `compose_index` | int | 이 입력 버전에서 몇 번째 compose 시작인가 (1부터) |
| `compose_called` | bool | compose 를 실제로 불렀나 |
| `verify_called` | bool | verify 를 실제로 불렀나 |
| `verify_passed` | bool | verify 통과 여부 (null = 미호출) |
| `missing_names` | text[] | A 에서 걸린 사전 미등재 이름(영문 원명) |
| `reserved_until` | timestamptz | 예약 만료 (§5) |
| `resolved_at` | timestamptz | 예약이 결과로 닫힌 시각 |
| `draft` | jsonb | F 의 통과 원고 보존 (title, paragraphs) |

기존 행은 전부 null 로 둔다. 새 인덱스: `(game_id, input_version, compose_index)` unique — 같은 입력 버전에서 같은 번호의 compose 가 두 번 시작될 수 없다(§5 원자성의 근거).

`stage` 값 추가: `"reserve"`(compose 시작 예약), `"dictionary"`(A 보류), `"draft"`(F 원고 보존).

## 2. A·B — compose 전 사전 검사와 허용 목록

- extract 결과의 **사건 선수**(득점·어시스트·교체·카드) 이름을 사전(`editor.resolve` 와 같은 사전)으로 푼다. 하나라도 안 풀리면 **compose 를 부르지 않고** `stage="dictionary"`, `missing_names=[...]` 로 기록하고 반환한다. LLM 호출 0.
- 사건 밖 선수(본문에만 나오는 활약상)는 검사 대상이 아니다.
- compose 프롬프트에 "실명 사용 허용 목록"(사전에서 풀린 이름들)을 전달한다. 지시: 목록 밖 선수는 **부가 묘사를 생략**한다. 주체가 문맥상 명확할 때만 대명사. 이름을 새로 지어내지 않는다. (GPT: "'한 선수' 같은 익명화로 누가 무엇을 했는지 모호해지면 사실성도 나빠진다")
- 추출 결과와 근거 문장은 원장 `draft` 또는 별도 jsonb 에 보존해 재시도 때 재사용한다(재추출 금지 — 입력 해시 안정성, §3).

## 3. C — 입력 버전

`input_version = sha256(정규화 기사 본문 + 확정 스코어 + PROMPT_VERSION + VERIFY_RULE_VERSION + 정렬한 필요 선수 표기 집합)`.
- 기사 본문 정규화: 공백 접기, 광고·수집 시각·저작권 꼬리 제거. 문단 배열을 그대로 잇는다.
- 필요 선수 표기 집합 = A 에서 검사한 사건 선수의 **사전 표기**(한글) 정렬 목록. 사전에 없는 이름은 영문 원명으로 넣는다 → 채워지면 해시가 바뀐다.
- `PROMPT_VERSION`·`VERIFY_RULE_VERSION` 상수를 `match-extras.ts` 에 두고, 프롬프트나 게이트를 고칠 때 올린다(이번 검증기 버그 수리 같은 규칙 변경이 재개 신호가 되게).
- 전체 사전 해시는 쓰지 않는다.

## 4. D — 예산

- 단위: **compose 시작 1회 = 1**. verify 까지 간 쌍만 세지 않는다(사전 문제로 compose 만 도는 비용이 빠지므로).
- 입력 버전당 상한 **6**. `REPORT_VERIFY_CAP`(3실행/24h) 은 이 규칙으로 **대체**한다.
- 자동으로 3으로 줄이지 않는다. 2주 뒤 두 지표로 판단: 구제율(같은 입력에서 3회 실패 뒤 4~6회에 성공한 비율), 구제 비용(4~6회 비용 ÷ 구제 리포트 수). 이 지표를 낼 수 있게 `compose_index` 와 `verify_passed` 를 정확히 남긴다.
- 상한 도달 → `stage="held"` + 사유. 이후 §6 재개 조건 전엔 compose 없음.

## 5. G — 예약 원자성

- compose 를 부르기 **전에** `stage="reserve"` 행을 넣는다. `(game_id, input_version, compose_index)` unique 로 같은 번호는 한 번만 잡힌다. `compose_index` 는 "이 입력 버전의 기존 행 수 + 1" 을 **같은 트랜잭션 안에서** 계산해 넣는다(RPC 하나로: 예산 확인 + 예약 삽입, `FOR UPDATE` 또는 unique 충돌로 재시도). 충돌하면 그 실행은 이 경기를 건너뛴다(동일 경기 동시 실행 방지).
- `reserved_until = now() + 5분`. 만료 규칙: 결과 없이 만료된 예약은 **환급하지 않는다**(요청 결과가 불명확한 타임아웃을 '미사용'으로 돌리면 예산이 새는 쪽으로 틀린다). 대신 관제에 "미결 예약" 으로 보이게 한다.
- 결과가 나오면 같은 행을 갱신한다: `compose_called`·`verify_called`·`verify_passed`·`reason`·`resolved_at`.

## 6. E — 자동 재개 (DB 만 읽는다)

- 크론 매 회차, `held`/`dictionary` 상태 경기(24시간이 지났어도, 종료 후 7일까지)를 DB 만으로 재검사한다: 현재 계산한 `input_version` 이 마지막 실행의 것과 다르면 재개(예산 새로 6). 같으면 건너뛴다(LLM 0, 외부 호출 0).
- 입력 버전이 바뀌는 계기 = 사전에 부족한 이름이 채워짐 · 확정 스코어 변경 · 프롬프트/규칙 버전 상승. **기사 자동 재수집은 2단계**(이번엔 하지 않는다). 대신 관제의 "원문 다시 받기" 수동 버튼이 기사 캐시를 갱신한다.
- `dictionary` 보류는 부족한 이름이 **전부** 채워졌을 때만 재개한다. 셋 중 하나만 채워졌으면 사전 검사만 다시 하고 compose 는 부르지 않는다.

## 7. F — 원고 보존

- verify 통과 원고를 `stage="draft"`, `draft=jsonb` 로 먼저 남기고 store 를 시도한다. store 실패면 다음 회차에 `draft` 행이 있는지 먼저 보고 **저장만** 재시도한다(compose·verify 재호출 금지). `match_reports` 는 `game_id` PK upsert 라 중복 저장은 막힌다 — 형제 id 로 이미 저장돼 있으면 성공으로 본다.

## 8. H — 관제 (최소)

`/admin` 리포트 카드에 보류 목록: 경기, 상태(`held`/`dictionary`/미결 예약), 사유, `missing_names`, 경과 시간, 이 입력 버전에서 쓴 예산. 버튼 둘:
- **재개**: 검증을 우회하지 않는다. 사유를 입력받아 `stage="resume"` 행을 남기고 **추가 예산 3** 을 준다.
- **원문 다시 받기**: 기사 캐시를 갱신한다(입력 버전이 바뀌면 자동 재개가 잡는다).
"재료가 다 있는데 리포트 없음" 같은 종합 진단 카드는 이번 범위 밖.

## 9. 테스트 (Vitest, 기존 시험 유지)

- A: 사건 선수 하나가 사전에 없으면 compose 호출 0, `dictionary` 행 + `missing_names`. 사건 밖 선수는 검사하지 않는다.
- B: 허용 목록이 프롬프트에 들어간다(문자열 포함 검사).
- C: 같은 기사·스코어·규칙에 광고 꼬리·공백만 달라도 해시가 같다. 부족한 이름이 채워지면 해시가 바뀐다. 규칙 버전 상승도 바뀐다.
- D: 같은 입력 버전에서 7번째 compose 는 시작되지 않고 `held`. 사전 문제로 compose 만 돌아도 예산이 준다.
- G: 같은 `(game, version, index)` 예약이 두 번 들어가지 않는다. 만료 예약은 환급되지 않는다.
- E: `held` 경기가 입력 버전 변경 없이는 재개되지 않고, 변경되면 예산 6으로 재개. 24시간이 지난 보류도 검사 대상.
- F: store 실패 뒤 다음 회차는 compose 없이 저장만 재시도.
- 기존 `__tests__/lib/match/report-persistence.test.ts`·`__tests__/lib/soccerway/match-extras-target.test.ts` 통과.

## 10. 범위 밖 (하지 말 것)

- 검증기의 팀명 조각(TSG·VfB·AFC) 오판 수정 — 별도 항목(4번).
- 기사 자동 재수집(2단계), 기사 없음 재조회 백오프(2단계), 회당 LLM 예산(2단계).
- 마이그레이션 **적용**, 운영 DB 쓰기, 크론 스케줄 변경, `lib/match/leagues.ts`·`report-clubs.ts` 목록 변경.

## 11. 참고 실측 (2026-09-10 새벽, Claude)

- 최근 30일 리포트 60건: verify 실패 뒤 성공 13건은 전부 9/7 규칙 수정·사전 보충 직후(마지막 실패→성공 13~37분). 같은 입력에서 4번째 이후 성공 근거 없음.
- 9/7 상한 배포 이후 `held` 도달 0건.
- 7일 verify 퇴짜 59건 중 사전 미등재·팀명 조각이 최다. 리포트 LLM 비용 7일 $3.31(전체 63%).
