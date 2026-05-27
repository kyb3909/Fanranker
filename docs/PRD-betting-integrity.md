# PRD — Betting & Settlement Integrity

**Status:** Draft v2 (2026-05-28) — Phase 0 코드 조사 후 갱신
**Owner:** kyb3909
**Stakes:** 토큰 경제 + 사용자 신뢰. 한 번의 잘못된 정산이 영구 손상.

---

## 0. Token Model (Phase 0 조사 결과 — 확정)

PRD 작성 전 토큰 흐름을 코드로 검증. 핵심 발견:

**모델: "토큰 in / 점수 out"** (자유게임 모델)

| 단계 | RPC | 토큰 변동 | Log |
|---|---|---|---|
| 매일 자정 KST | `reset_user_daily_tokens` | `balance = 10` (고정 캡, 누적 없음) | `token_transactions: 'daily_reset'` |
| 베팅 | `spend_tokens` | `-stake` | `token_transactions: 'prediction_spent'` |
| 경기 취소 | `refund_tokens` | `+stake` | `token_transactions: 'refund'` |
| 관리자 조정 | `admin_adjust_tokens` | `+/-X` | `token_transactions: 'admin_adjustment'` |
| **적중 (WON)** | **없음** | **0 (변동 없음)** | **없음** |

**증거:**
- `settle_predictions_by_round` (`prod_schema.sql:3196`): `-- All correct → WON (NO ball refund — points only)`
- `settle_round` 반환값: `'total_payout', 0` 하드코딩 (line 3253)
- `user_tokens.token_balance` 를 UPDATE 하는 함수 4개 전수조사: `admin_adjust`, `refund`, `reset_daily`, `spend` — **승리 시 토큰 지급 RPC/트리거 없음**

**의미:**
- 이중지급 위험 = 0 (지급 자체 없음)
- `points_earned` 는 랭킹/통계용. 실제 토큰 가치 ≠ 1:1
- 무결성의 핵심은 (a) 환불 정확성, (b) 정산 결과 정확성(통계/랭킹 신뢰), (c) 사용자 분쟁 시 디버깅

이 모델 기반으로 본 PRD 가 작성됨. 만약 향후 "토큰 in / 토큰 out" 으로 모델 변경 시 Phase 3 의 idempotency 우선순위가 급상승함 (별도 PRD 필요).

---

## 1. Problem Statement

현재 베팅·정산 시스템은 핵심 부분이 견고하지만 **(a) 사고 발생 시 진단·복구 도구 부재**, **(b) 사용자에게 깨진 상태가 노출됨**, **(c) 회계 무결성 자동 검증 없음** 의 세 갭이 있다.

**과거 사고 이력:**

- 2026-02-15 ~ 02-20 — Vultr sync.sh 5일 중단. ERR trap 없어 무성 실패.
- 2026-05 이전 — `settle_ball_refund_bug` (migration 033): WON 슬립에도 `refund_tokens` 호출되어 이중 지급 가능했던 치명적 버그. 데이터 audit 없어서 어떤 슬립이 영향받았는지 사후 추적 불가.
- 2026-05-12 — 같은 경기 다른 round 중복 등록 → `status=in_progress` stuck. `fetch-results.sh` Phase 6 자동 정리 추가했지만 일부 케이스 누락 가능.
- 상시 — betman.co.kr 늦은 배당 등록 → `betman_games`에 odds NULL 상태 노출.

**핵심 위험:** 다음에 정산 버그가 나면 (1) 발견까지 며칠 걸릴 수 있고 (2) 어느 슬립이 잘못됐는지 모르고 (3) 되돌릴 도구가 없다.

---

## 2. Definitions — 4가지 무결성

| # | 무결성 | 정의 | 측정 방법 |
|---|---|---|---|
| 1 | **수집 무결성** | 모든 활성 경기에 결과 + 모든 마켓 배당이 채워짐 | `betman_games WHERE match_time < now() AND result IS NULL`의 시간 분포 |
| 2 | **상태 무결성** | 어떤 경기·슬립도 stuck 30분 이상 없음 | 각 상태별 체류 시간 모니터링 |
| 3 | **정산 무결성** | 정산은 정확히 1번. 모든 pending 슬립이 결과대로 처리됨. `is_correct` / `points_earned` 가 실제 경기 결과 + locked_odds 와 일치 | audit log 의 before/after diff 무결 검증 |
| 4 | **회계 무결성** | `SUM(token_transactions.amount)` = `SUM(user_tokens.token_balance) - initial`. 모든 토큰 변동이 ledger 에 기록 | `token_transactions` ↔ `user_tokens` 일일 일관성 검사 |

**회계 등식 (단순화됨, 모델 확정 후):**
```
For each user, for each day:
  SUM(token_transactions.amount where day) = balance_end_of_day − balance_start_of_day
```
모든 변동이 log 에 들어가므로 (spend/refund/admin/reset 모두 INSERT 함) 등식 위반 = ledger 버그 또는 직접 SQL 수정 의심.

---

## 3. Current State Assessment

### 3.1 잘 작동하는 부분 (건드리지 않음)

- **Row-level idempotency**: `settlePredictions` 의 모든 UPDATE는 `.eq("status", "pending")` 필터. 두 번 호출해도 두 번째는 0 rows affected — 안전.
- **`locked_odds` 저장**: 베팅 시점 배당이 prediction에 잠금. 정산 시 동일 배당 사용 — 사용자 분쟁 방지.
- **Refund 재시도 + DLQ**: `retryRefund` 3회 + 실패 시 `pending_refunds` 테이블에 기록 + Sentry fatal. `lib/betman/refund-tokens.ts:13`, `lib/betman/settle.ts:9`.
- **부분 취소 처리**: 슬립 중 일부만 cancelled 시 `total_odds` 재계산 + 적중률 재산정. `lib/betman/settle.ts:232`.
- **Stadium 기여 동기화 분리**: 정산 본체와 격리 — 기여 실패가 정산을 깨지 않음. `settle.ts:283`.

### 3.2 갭 (이 PRD가 메우는 부분)

| 갭 | 현재 | 목표 |
|---|---|---|
| **Audit trail** | 없음 — `settled_at` timestamp만 존재. 누가/언제/어떻게 정산했는지 모름 | 모든 정산 이벤트의 before/after JSONB 저장 |
| **회계 검증** | 없음 — 토큰 in/out이 매일 균형 맞는지 자동 확인 안 함 | 일일 cron reconciliation + 불일치 시 알럿 |
| **Odds 노출 게이트** | NULL odds 그대로 UI 노출 가능 | `odds_ready` 게이트 — 모든 마켓 채워질 때까지 베팅 차단 |
| **상태 추적** | `betman_games.status`는 있지만 전이 로그 없음 | `game_state_transitions` 로그 (actor + timestamp) |
| **수동 복구 도구** | 없음 — DB 직접 수정해야 함 | `/admin/settlements` 에 재정산 / 역연산 버튼 + audit log 기반 정확한 reversal |

---

## 4. Proposed Changes — 3-Phase Rollout

### Phase 1 — 관측 & 안전망 (위험 0, 동작 변경 0)

**목적:** 다음 사고 시 5분 안에 root cause 찾고 정확히 복구 가능.

**작업:**

1. **`settlement_audit_log` 테이블 신규**
   ```sql
   CREATE TABLE settlement_audit_log (
     id              BIGSERIAL PRIMARY KEY,
     event_type      TEXT NOT NULL, -- 'settle_prediction'|'settle_slip'|'refund'|'cancel'|'manual_reverse'
     game_id         UUID REFERENCES betman_games(id),
     slip_id         UUID,           -- nullable (게임 단위 이벤트)
     prediction_id   UUID,           -- nullable
     user_id         TEXT,           -- nullable (Clerk ID)
     before_state    JSONB NOT NULL, -- 변경 전 row snapshot
     after_state     JSONB NOT NULL, -- 변경 후 row snapshot
     amount          NUMERIC,        -- 토큰 변동량 (있으면)
     reason          TEXT,           -- 자유 텍스트
     actor           TEXT NOT NULL,  -- 'cron:settle' | 'cron:fetch-results' | 'admin:user_xxx'
     called_at       TIMESTAMPTZ DEFAULT NOW(),
     INDEX (game_id, called_at DESC),
     INDEX (slip_id, called_at DESC),
     INDEX (user_id, called_at DESC),
     INDEX (event_type, called_at DESC)
   );
   ```
   RLS: admin만 SELECT, 일반 사용자 차단.

2. **`settlePredictions` 에 audit hook 추가**

   `lib/betman/settle.ts` 안에서 모든 UPDATE 전후로 `settlement_audit_log` INSERT.
   기존 트랜잭션 안에 같이 들어가게 (실패하면 audit 도 롤백). 코드 변경 30~50줄.

3. **`accounting_daily` 테이블 + cron**
   ```sql
   CREATE TABLE accounting_daily (
     date              DATE PRIMARY KEY,
     spend_total       BIGINT NOT NULL DEFAULT 0,  -- token_transactions 'prediction_spent' 합 (음수)
     refund_total      BIGINT NOT NULL DEFAULT 0,  -- token_transactions 'refund' 합
     admin_adjust_total BIGINT NOT NULL DEFAULT 0, -- token_transactions 'admin_adjustment' 합
     daily_reset_total BIGINT NOT NULL DEFAULT 0,  -- token_transactions 'daily_reset' 합
     log_net_delta     BIGINT NOT NULL,            -- 위 합계
     balance_net_delta BIGINT NOT NULL,            -- SUM(user_tokens.balance_today - balance_yesterday)
     balanced          BOOLEAN NOT NULL,           -- abs(log_net_delta - balance_net_delta) < 1
     discrepancy       BIGINT,                     -- 불일치 토큰 수
     pending_refunds_count INTEGER NOT NULL,       -- 처리 안 된 refund 수
     computed_at       TIMESTAMPTZ DEFAULT NOW()
   );
   ```

   매일 03:00 KST cron `/api/cron/daily-accounting`:
   - 전날 `token_transactions` 항목별 집계
   - 전날 `user_tokens` 잔고 변동 직접 계산 (스냅샷 비교 — `daily_token_snapshots` 추가 필요. 아래 4번 참조)
   - 등식: `log_net_delta == balance_net_delta` (모든 변동이 ledger 에 기록되므로 일치해야 함)
   - 불일치 > 1 토큰 → Sentry fatal + 어드민 대시보드 알럿
   - `pending_refunds_count > 0` → 어드민 알럿 (이미 대시보드에 표시되지만 일일 리포트에도 누적 추세 표시)

4. **`daily_token_snapshots` 테이블** (회계 등식 좌·우변 비교에 필요)
   ```sql
   CREATE TABLE daily_token_snapshots (
     date           DATE NOT NULL,
     user_id        TEXT NOT NULL,
     balance_at_end INTEGER NOT NULL,
     PRIMARY KEY (date, user_id),
     INDEX (date)
   );
   ```
   매일 자정 직전 (23:59 KST) cron: 모든 `user_tokens` 스냅샷 저장. accounting cron 이 어제·오늘 스냅샷 차이를 계산할 때 사용.

   ⚠️ 데이터량: 10만 유저 × 365일 = 36.5M rows/년. 부담스러우면 weekly snapshot + daily 는 transactions 만 신뢰. **추천: 주간 스냅샷 + 일일 트랜잭션 합산**.

4. **`/admin/system` 에 audit log 뷰어 추가** (별도 페이지 `/admin/audit`)
   - 게임 ID / 슬립 ID / 사용자 ID 로 검색
   - 시계열로 이벤트 표시 (before/after diff JSONB pretty-print)

**롤백:** 새 테이블 + audit INSERT만 추가 — 기존 정산 로직 동작 0 변경. 문제 시 `DROP TABLE` + audit hook 코드 제거로 즉시 원복.

**예상 시간:** 1-2일.

---

### Phase 2 — UI 게이트 & 상태 머신 (사용자 노출 차단)

**목적:** 사용자가 깨진 데이터를 절대 보지 못함.

**작업:**

1. **`betman_games.odds_ready` 컬럼 추가**
   ```sql
   ALTER TABLE betman_games ADD COLUMN odds_ready BOOLEAN NOT NULL DEFAULT FALSE;
   ```
   - Vultr `sync.sh` 가 odds 채울 때 모든 필수 마켓 NULL 아닌지 확인 후 TRUE 세팅
   - `/api/betman/games` GET 응답에서 `odds_ready=false` 인 경기 필터링 또는 "배당 등록 중" 라벨
   - 베팅 UI 는 `odds_ready=false` 경기에서 베팅 버튼 비활성화

2. **`betman_game_state_transitions` 테이블**
   ```sql
   CREATE TABLE betman_game_state_transitions (
     id              BIGSERIAL PRIMARY KEY,
     game_id         UUID REFERENCES betman_games(id),
     from_status     TEXT,
     to_status       TEXT NOT NULL,
     transitioned_at TIMESTAMPTZ DEFAULT NOW(),
     actor           TEXT NOT NULL,
     reason          TEXT,
     INDEX (game_id, transitioned_at DESC)
   );
   ```
   `betman_games.status` UPDATE 시 자동 INSERT (DB 트리거).

3. **상태 stuck 감지**
   - `/api/admin/data-integrity` 에 stuck 룰 추가:
     - `in_progress` 상태로 4시간 이상 → "결과 수집 실패 가능성"
     - `scheduled` 상태인데 match_time이 6시간 이상 지남 → "경기 종료 후 상태 미갱신"
   - 어드민 대시보드에 표시

**롤백:** `odds_ready` 컬럼은 DEFAULT FALSE 라 추가 직후 모든 경기 차단됨 → 마이그레이션과 동시에 백필 쿼리 실행 (이미 odds 채워진 경기 → TRUE). 트리거는 DROP TRIGGER 로 즉시 원복.

**예상 시간:** 3-5일.

---

### Phase 3 — 수동 복구 도구 (idempotency 는 deprioritized)

**목적:** 잘못된 정산을 정확히 되돌리기. 사용자 분쟁 해결.

**모델 확정 후 우선순위 조정:**
- ❌ ~~`settle_round_v2` idempotency~~ — 토큰 지급이 없으므로 이중지급 위험 0. 현재 row-level `.eq("status", "pending")` 필터로 충분.
- ✅ **`reverse_settlement` RPC + UI** — 잘못 정산된 슬립의 `is_correct` / `points_earned` / `status` 를 audit log 기반으로 정확히 되돌림. 통계 재계산 트리거.
- ✅ **Wisetoto 교차 검증** — 결과 불일치 사전 감지. betman 데이터 신뢰성 검증.

**작업:**

1. **`reverse_settlement(p_audit_log_id, p_reason)` RPC** (관리자 전용)
   - audit log 의 `after_state` → `before_state` 로 정확한 역연산
   - `prediction.status`, `is_correct`, `points_earned` 복구
   - `slip.status` 복구 (cascade 가능)
   - 환불이 있었던 경우 `spend_tokens` 으로 토큰 회수 (해당 일 daily_reset 안에서)
   - 새로운 audit log 항목 `'manual_reverse'` 로 기록 (actor='admin:user_xxx')
   - 통계 재계산 트리거 (`recalc_user_sport_stats`)

2. **`/admin/settlements` UI 확장**
   - 슬립 검색 → audit log 표시 → "이 정산 잘못됨" → reverse 한 클릭
   - reverse 직전 dryrun 미리보기 (어떤 행이 어떻게 바뀌는지)
   - 확정 시 audit log 기록 후 commit

3. **Wisetoto 교차 검증 cron**
   - `/api/cron/wisetoto-cross-check` 매시간
   - wisetoto 와 betman 의 `result` / `home_score` / `away_score` 비교
   - 불일치 발견 시 해당 게임 정산 자동 보류 (`game.status = 'verification_needed'` 신규 상태) + 어드민 알럿
   - 어드민이 어느 쪽 신뢰할지 결정

4. **(향후 옵션) `settle_round_v2` idempotency**
   - 만약 토큰 지급 모델로 전환 시 추가. 현재는 불필요.

**롤백:** RPC + UI 추가만 — 기존 동작 0 변경. wisetoto 교차 검증은 default off, opt-in.

**예상 시간:** 5-8일.

---

## 5. Schema Changes Summary

| 마이그레이션 | 파일명 | 내용 |
|---|---|---|
| Phase 1.1 | `20260528_create_settlement_audit_log.sql` | `settlement_audit_log` 테이블 + RLS + 인덱스 |
| Phase 1.2 | `20260528b_create_accounting_daily.sql` | `accounting_daily` 테이블 + 일일 계산 RPC |
| Phase 2.1 | `20260530_add_odds_ready.sql` | `betman_games.odds_ready` + 백필 |
| Phase 2.2 | `20260530b_state_transitions.sql` | `betman_game_state_transitions` + 트리거 |
| Phase 3.1 | `20260606_settle_round_v2.sql` | v2 RPC + idempotency |
| Phase 3.2 | `20260606b_reverse_settlement.sql` | 역연산 RPC |

각 마이그레이션은 **독립적으로 적용/롤백 가능**. Phase 1 만 적용해도 가치 있음 (audit trail 확보).

---

## 6. Testing Strategy

**Phase 1:**
- Unit: `settlement_audit_log` INSERT 가 모든 settle 경로에서 실행되는지
- Integration: 정산 → audit log 조회 → before/after diff 확인
- Accounting cron: 가짜 데이터로 stake/payout/refund 계산 후 등식 검증
- 회귀: 기존 887개 테스트 모두 통과 (audit 추가가 기존 동작 안 깸)

**Phase 2:**
- E2E: `odds_ready=false` 경기는 베팅 UI 에서 차단되는지 (Playwright)
- 백필 검증: 마이그레이션 직후 모든 활성 경기 `odds_ready` 상태 점검

**Phase 3:**
- Idempotency: 같은 idempotency_key 로 v2 RPC 100회 호출 → 정확히 1번만 변경
- Reverse: 정산 → reverse → 토큰 잔고가 정산 전과 동일
- 정답성: 100건 무작위 슬립 정산 후 회계 등식 자동 검증

---

## 7. Monitoring / Alerts

| 메트릭 | 임계값 | 액션 |
|---|---|---|
| Daily accounting `discrepancy` | > 10 토큰 | Sentry fatal + 어드민 알럿 |
| Stuck `in_progress` 게임 | > 4시간 | 어드민 대시보드 알럿 |
| Stuck `scheduled` (match_time 지남) | > 6시간 | 어드민 알럿 |
| `pending_refunds` 미처리 | > 1건 | 기존 알럿 유지 |
| Audit log INSERT 실패 | 1건이라도 | Sentry fatal (정산 자체는 성공이지만 추적 끊김 — 즉시 조사 필요) |

---

## 8. Open Questions (Phase 0 후 갱신)

1. ~~**Payout 토큰 어디서 지급?**~~ → **해결**: 지급 없음. "토큰 in / 점수 out" 모델 확정 (Section 0).

2. ~~**`accounting_daily` 가 user_tokens 변동을 어떻게 합산?**~~ → **해결**: `token_transactions` ledger 존재 (모든 변동 기록). 잔고 비교용으로 `daily_token_snapshots` (또는 weekly + transaction 합산) 추가 (Section 4 Phase 1.4).

3. **마이그레이션 적용 순서** — Supabase MCP `apply_migration` 으로 즉시 적용 vs PR merge 후 production 배포로 적용? **추천: 후자가 안전.** 단, RLS 추가만 있는 마이그레이션은 MCP 즉시 적용 가능.

4. **Backfill 정책** — Phase 1 audit log 는 이전 정산은 기록 안 함 (소급 적용 X). Phase 2 `odds_ready` 백필 정책: 활성 경기 (`status IN ('scheduled', 'in_progress')`) 만 백필, 과거 종료된 경기는 무시.

5. **`daily_token_snapshots` vs 주간 스냅샷** — 데이터량 부담 (~36M rows/년). **추천: weekly snapshot + daily 는 transaction log 만 신뢰.** 회계 검증은 주 1회 정밀, 일일은 transaction 변동만 체크.

6. **통계 정확성 무결성** — `recalc_user_sport_stats` 가 정산 후 호출되지만 실패 시 silent skip (`EXCEPTION WHEN OTHERS THEN NULL`). 이게 깨지면 사용자 랭킹 잘못됨. Phase 1 audit log 에 통계 재계산 결과도 기록할지? **추천: 별도 `stats_recalc_log` 테이블로 분리** (settlement 무결성과 별개 작업).

7. **`points_earned` 값 변경 정책** — odds 가 사후에 정정되면 (드물지만 가능) 이미 정산된 슬립의 `points_earned` 어떻게? 강제 재정산 vs 기존 값 유지? **추천: locked_odds 사용했으므로 기존 값 유지가 원칙. 단, locked_odds 자체가 잘못된 경우만 reverse_settlement 사용.**

---

## 9. Success Criteria

Phase 1 완료 후:
- [ ] 모든 정산 이벤트가 audit log 에 기록됨 (1주일 관측, 누락 0건)
- [ ] 매일 회계 등식 자동 검증 cron 운영
- [ ] 임의 슬립 ID 로 5초 안에 정산 history 조회 가능

Phase 2 완료 후:
- [ ] NULL odds 경기는 사용자 UI 에 노출 0건 (audit 도구로 검증)
- [ ] stuck 게임 (4시간 초과) 발생 시 알럿 도착

Phase 3 완료 후:
- [ ] 잘못된 정산 발견 시 어드민이 audit log 한 줄 클릭으로 1분 안에 reverse 가능
- [ ] idempotency 검증 — 같은 키 N회 호출 → 정확히 1번 변경

---

## 10. Recommendation

**지금은 Phase 1 만 시작.** 이유:

1. Phase 1 은 기존 동작 변경 0. 새 테이블 + INSERT 한 줄 추가만. 회귀 위험 거의 없음.
2. Phase 1 만으로도 "다음 사고 시 root cause 5분 안에" 라는 큰 가치.
3. Phase 2/3 작업 시에도 audit log 가 변경의 안전성 검증 도구가 됨.
4. Phase 1 이 운영되는 1-2주 동안 실제 데이터 패턴을 보고 Phase 2 디자인 다듬을 수 있음.

Phase 2/3 는 Phase 1 학습 후 결정.

---

## 11. Phase 0 Findings — 코드 검증 요약

원 PRD 작성 후 토큰 흐름을 직접 코드 검증 (`prod_schema.sql` + `lib/betman/settle.ts`):

**원래 가정한 위험 vs 실제:**

| 원래 우려 | 실제 코드 | 결론 |
|---|---|---|
| 이중지급 위험 | 승자 토큰 지급 RPC 자체가 없음 | ✅ 불가능 |
| 정산 RPC idempotency | `UPDATE ... WHERE status = 'pending'` 필터로 row-level idempotent | ✅ 이미 안전 |
| 환불 실패 시 사용자 손해 | `retryRefund` 3회 + `pending_refunds` DLQ + Sentry fatal | ✅ 이미 적절히 처리 |
| 토큰 ledger 부재 | `token_transactions` 테이블이 모든 변동 기록 | ✅ 있음 |
| 부분 취소 처리 | `total_odds` 재계산 + 적중률 재산정 | ✅ 적절히 처리 |

**진짜 갭 (이 PRD 가 메우는 것):**

| 갭 | 영향 |
|---|---|
| 정산 audit log 없음 | 사고 시 root cause 추적 불가 (예: migration 033 의 settle_ball_refund_bug 같은 사고 재발 시 영향 슬립 식별 불가) |
| `token_transactions` ↔ `user_tokens` 일관성 자동 검증 없음 | 직접 SQL 수정 등으로 ledger 가 깨지면 모름 |
| 통계 재계산 silent skip | 사용자 랭킹/통계 망가져도 알럿 없음 |
| NULL odds 노출 | 사용자가 베팅 후 "결과 영원히 안 나옴" 경험 가능 |
| stuck row 자동 감지 | 4시간+ stuck 게임 알럿 없음 (현재 3시간 sync stale 알럿만 존재) |

**핵심 메시지:** 코드는 견고하다. 우리가 메워야 할 것은 **관측·복구 도구** + **사용자 노출 게이트**. 코어 정산 로직 변경은 우선순위 낮음.
