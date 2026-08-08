# 베팅/정산/토큰 경제 도메인 감사 노트 (Phase 1)

작성: 2026-08-08. 근거는 전부 `상대경로:라인`. 읽기 전용 감사 — 코드 변경 없음.

---

## 1. 핵심 플로우

### 1-a. 경기 데이터 동기화 (VPS + Vercel 이중 구조)

betman.co.kr 은 한국 IP 전용 → 실제 스크래핑은 Vultr VPS(`/opt/betman/sync.sh`, `fetch-results.sh` — 저장소 외부) 전담. Vercel 은 수신 엔드포인트 + DB-only watchdog.

| 단계 | 주체 | 파일:라인 | 쓰는 테이블 |
|---|---|---|---|
| 회차 등록 (gmTs → round) | VPS → POST | `app/api/betman/round/route.ts:25-66` | betman_rounds (insert-if-absent) |
| 경기 upsert + 데일리 라운드 배정 | VPS → POST | `app/api/betman/games/route.ts:378-461` (upsert `onConflict: round_id,game_no` :422-425) | betman_games, betman_daily_rounds (upsert :445-452), `assign_daily_round` RPC :455-458, live_rooms :545-547 |
| 결과 수신 + 자동 정산 | VPS → POST | `app/api/betman/results/route.ts:28-268` | betman_games(:155-160), betman_predictions/prediction_slips(정산 경유), betman_daily_rounds(:222-228) |
| watchdog (30분) — staleness 감시, 라운드 생명주기 | Vercel cron | `app/api/cron/betman-sync/route.ts:31-163` (betman 직접 호출 없음 :22-24) | betman_games(과거 scheduled→in_progress :75-79), betman_rounds(close :100-105,117-124), betman_sync_state(resync 플래그 :130-149) |
| 수동 재동기화 요청 | 어드민 → POST | `app/api/betman/manual-sync/route.ts:33-83` | betman_sync_state (플래그만 — VPS 가 소비) |
| 라이브 점수 (매분) | Vercel cron + 브라우저 폴링 | `app/api/wisetoto/sync/route.ts:26-78` (25초 쿨다운 :66-69, optimistic lock :72-78) | betman_games 점수, betman_sync_state.last_score_sync_at |
| 로컬/VPS 스크립트 (Playwright) | 수동/cron | `scripts/betman-sync.ts:1-33`, `scripts/betman-fetch-results.ts:1-28` | (API 경유) |

특기: **GET `/api/betman/games` 가 조회이면서 상태를 변경**한다 — 과거 게임 만료·데일리 라운드 마감·live_rooms 동기화를 매 조회마다 수행 (`app/api/betman/games/route.ts:59-75`). s-maxage=30 캐시(:361)라 부하는 제한적이나, 읽기 경로에 쓰기 부수효과가 3곳(여기 + betman-sync cron:75-79 + settle route:83-90)에 중복돼 있다.

### 1-b. 예측 제출 (볼 차감 → 슬립 → 예측)

단일 진입점 `POST /api/betman/prediction` (클라이언트는 rewrite 된 `/api/sports/prediction` 호출 — `hooks/use-betting-slip.ts:256`).

| 단계 | 파일:라인 | 테이블/RPC |
|---|---|---|
| 1. idempotency_key 선조회 | `app/api/betman/prediction/route.ts:64-79` | prediction_slips (unique partial index: `supabase/migrations/00000000000001_prod_schema.sql:8604`) |
| 2. 검증 (같은 데일리 라운드 :103-117, 단일 종목 :135-138, 물리 경기 중복 :141-148, scheduled만 :151-160, match_time null 가드 :164-177, 팀 미정 :180-192, 전반전 S접두사 차단 :196-205, 킥오프 마감 :208-219, 데일리 윈도우 :224-234, 마켓-예측 타입 :237-264) | 〃 | betman_games, betman_daily_rounds |
| 3. **배당 0/null 검증을 차감 전에 수행** | :266-291 | (주석 :267-269 — 차감 후 검증하면 환불 누락) |
| 4. 볼 차감 | :362-371 | `spend_tokens` RPC → 반환 키 `remaining_balance` |
| 5. 슬립 insert | :406-416 | prediction_slips. 실패 시 `retryRefundTokens` 보상 :414 |
| 6. 예측 insert (locked_odds/line/handicap 스냅샷 :436-438) | :443-463 | betman_predictions. 실패 시 슬립 delete + 환불 :450-451 |
| 7. 부수효과 (활동 피드/팔로워 알림/픽 분포/퍼널) | :468-559 | prediction_activities, notifications, user_acquisition — 전부 try/catch 로 무해화 |

**트랜잭션 경계: 없음.** 4→5→6 은 별개 커밋이고, 실패 시 보상(compensating) 방식이다. 5·6 실패는 `lib/betman/refund-tokens.ts:13-46`(3회 재시도 → pending_refunds 큐 + Sentry fatal)로 커버되지만, **4와 5 사이에서 프로세스가 죽으면(타임아웃/크래시) 차감만 남고 보상 코드 자체가 실행되지 않는다** — pending_refunds 기록도 없다. token_transactions 원장으로 사후 추적만 가능.

idempotency 도 check-then-insert (:64-79 조회 → :406 insert) 라 동시 중복요청 레이스가 있으나, unique index(prod_schema.sql:8604)가 최종 방어 → 23505 를 409 로 안내 (:452-462).

### 1-c. 정산 (결과 유입 → 정산 → 안전망)

공통 코어는 `settlePredictions` (`lib/betman/settle.ts:148-459`) 하나. 진입점 4개 + DB함수 1개:

| 진입점 | 트리거 | 파일:라인 | actor |
|---|---|---|---|
| 결과 수신 자동 정산 | VPS POST | `app/api/betman/results/route.ts:175-238` | `cron:settle` (기본값) |
| 수동/스크립트 정산 | CRON_SECRET POST | `app/api/betman/settle/route.ts:32-198` | 〃 |
| 어드민 정산 콘솔 | requireAdminApi POST | `app/api/predictions/settle/route.ts:116-190` | 〃 |
| **안전망 스윕 (15분)** | Vercel cron | `app/api/cron/settle-pending/route.ts:18-41` → `lib/betman/settle-sweep.ts:53-110` | `cron:settle-sweep` |
| 48h 만료 처리 | `/api/betman/expire-pending` (VPS cron) | `app/api/betman/expire-pending/route.ts:12-33` → **SQL 함수** `expire_stale_pending_predictions` (prod_schema.sql:1518-1576) | — |

`settlePredictions` 내부 순서: 예측 정산(`.eq("status","pending")` 조건부 update — 멱등, settle.ts:190-233) → 슬립 정산(이미 non-pending 이면 skip :246,305; 부분취소 시 total_odds 재계산 :307-321; won/lost 는 `.eq("status","pending")` 조건부 :329-334,373-378) → 알림 batch :422-430 → audit batch :434-443 → 유저 통계 :445-449 → 스타디움 기여 동기화 :451-456. **적중 시 토큰 지급 없음** — points_earned 점수만 (settle.ts:365 주석 "점수만" 모델). 환불은 전액취소 슬립만 (`retryRefund` settle.ts:29-76).

결과 덮어쓰기 가드: `lib/betman/result-guard.ts:48-78` — settled 픽이 있는 경기의 result 변경/취소↔확정 전환/상태 후퇴 차단. results 라우트 :129-144 에서 적용.

---

## 2. 돈 RPC 전수

### 호출 지점

| RPC | 호출 파일:라인 | 반환 키 |
|---|---|---|
| `spend_tokens` | `app/api/betman/prediction/route.ts:363`, `app/api/tokens/spend/route.ts:79`, `app/api/payments/purchase/route.ts:115` | TABLE(`success`, `remaining_balance`, `error_message`) |
| `refund_tokens` | `lib/betman/settle.ts:39` (정산 취소환불), `lib/betman/refund-tokens.ts:21` (제출 보상환불), `app/api/admin/refunds/route.ts:115` (어드민 재시도), SQL 내부 `expire_stale_pending_predictions` (prod_schema.sql:1569) | TABLE(`success`, `new_balance`) |
| `spend_gold` | `app/api/predictions/purchase/route.ts:107` | jsonb `{success, spent, remaining}` |
| `reward_gold` | `app/api/predictions/purchase/route.ts:154` (구매실패 환불), `lib/predictions/retry-seller-reward.ts` (판매자 90% 정산, purchase/route.ts:207-214 경유) | ❓ (retry-seller-reward 본문 미열람) |
| `reset_user_daily_tokens` | `app/api/cron/daily-token-reset/route.ts:46` (50명 배치 :42-50) | void |
| `ensure_daily_token_reset` | `app/api/tokens/balance/route.ts:26` (lazy on-access), `spend_tokens` 내부 PERFORM (prod_schema.sql:3392) | integer(잔액) |
| `admin_adjust_tokens` / `admin_adjust_gold` | `app/api/admin/users/[userId]/adjust-economy/route.ts` (❓ 본문 미열람 — grep 으로 존재 확인) | ❓ |

### 정의 위치 (마이그레이션)

| RPC | 정의 | 비고 |
|---|---|---|
| `spend_tokens` | `supabase/migrations/00000000000001_prod_schema.sql:3369-3424` | SECURITY DEFINER, `FOR UPDATE` 행 잠금 :3394-3398, 내부에서 daily reset 선실행 :3392, token_transactions 기록 :3414-3420 |
| `refund_tokens` | 〃 :2808-2849 | SECURITY DEFINER, 원자적 `+` update, 음수 거부 :2815 |
| `spend_gold` | 〃 :3332-3363 | `FOR UPDATE` :3343, gold_transactions 기록 :3358-3359 |
| `reset_user_daily_tokens` / `ensure_daily_token_reset` | `supabase/migrations/20260630_token_reset_align_to_slate_2300kst.sql:14-98` (최신 정의) | 회차 경계 = `(KST+1h)::date` = 23:00 KST, 회차당 1회 가드 :37-40 |
| `expire_stale_pending_predictions` | prod_schema.sql:1518-1576 | 아래 §5-1 참조 |
| 권한 회수 | `supabase/migrations/20260530_revoke_money_rpc_from_client.sql:17-24`, **`20260718_revoke_economy_rpc_grants.sql:21-49`** (pg_proc 순회로 PUBLIC/anon/authenticated 전부 회수 — 20260530 의 REVOKE-from-anon no-op 함정 보완) | prod_schema 의 GRANT to anon(:11287-11349)은 이후 마이그레이션으로 무효화됨 — **함수 재정의 시 REVOKE 재첨부 필수** |

---

## 3. 사용 테이블 — 읽는 곳 / 쓰는 곳 (대표 지점)

| 테이블 | 읽기 | 쓰기 |
|---|---|---|
| betman_rounds | results:48-53, betman-sync cron:86-90 | round:POST(생성), betman-sync cron(close :100-105,119-123), settle:169-173(settled) |
| betman_games | games GET:101-153, prediction:83-96, settle:93-99, sweep:77-85, predictions/settle:46-54 | games POST upsert:422, results:155-160, 만료 전환 3곳(games GET:61-65 / betman-sync:75-79 / settle:84-90 / results:206-212) |
| betman_daily_rounds | prediction:120-124, prediction GET:703-707 | games POST upsert:445-452, settled 전환(settle:150-155, results:222-228), closed 전환(games GET:66-70) |
| betman_predictions | 정산 각 진입점, prediction GET:719-728, stats(`lib/betman/stats.ts:25-30`), games GET:305-310 | prediction:443-447(insert), settle.ts:190-233(정산 update), expire SQL:1527-1539 |
| prediction_slips | prediction:65-69, GET status=all:601-607, stats.ts:53-59 | prediction:406-410(insert), settle.ts:260-265/317-321/329-334/373-378, expire SQL:1562-1568 |
| user_tokens | daily-token-reset cron:23, tokens/spend:63-67 | RPC 내부만 (spend/refund/reset — prod_schema.sql:3406, 2820, 20260630:44-49) |
| token_transactions | tokens/spend idempotency:54-59 | RPC 내부만 (:3414, :2833, 20260630:52-57) |
| user_gold / gold_transactions | gold/reward:61-79(횟수제한+idempotency) | `spend_gold`/`reward_gold` RPC 내부 (:3354-3359) |
| pending_refunds | admin/refunds GET:37-44, ops-monitor:213-215 | settle.ts:63-70, refund-tokens.ts:31-38, predictions/purchase:173-181(**currency='gold'** 명시), admin/refunds PATCH:123-156 |
| settlement_audit_log | (어드민 조회 — RLS admin only, `20260528_create_settlement_audit_log.sql:120-123`) | settle.ts:434-443 batch insert 단일 지점 |
| betman_sync_state | games GET:314-319, betman-sync:44-49, wisetoto:54-59 | betman-sync:144-149, manual-sync:77, wisetoto:72-78 |

---

## 4. 일별 윈도우 규칙 (08:00 / 23:00 KST)

구현은 `lib/betman/daily-round.ts` 에 집중, 소비처 3곳.

| 규칙 | 구현 | 소비 |
|---|---|---|
| 슬레이트 = (당일 08:00 초과 ~ 익일 08:00 이하] — 시작 exclusive/끝 inclusive | `getDailyWindow` `daily-round.ts:50-61` | games GET `.gt/.lte` `app/api/betman/games/route.ts:120-122` (경계 근거 주석 :114-119), prediction 제출 가드 `prediction/route.ts:224-234` (`<=` start / `>` end) |
| 23:00 KST 에 표시 회차 flip (`KST+1h` 날짜) | `getTodayDailyId` :38-44 | games GET, prediction GET:702 |
| 경기→회차 배정 (08:00 cutoff, `KST−8h` 날짜) | `computeDailyId` :19-26 | games POST:436 |
| 경기별 마감 = min(킥오프, 회차 23:00) | `getGameBetDeadline` :85-87 + games GET:195-196 | 서버 마감검증은 **킥오프만** (prediction:208-219) — 23:00 캡은 표시용 bet_close_at 에만 반영. 23:00~킥오프 사이 제출은 윈도우 가드(:224-234)가 새 슬레이트 기준으로 걸러냄 |
| 볼 리셋 경계 = 동일 23:00 KST (`(KST+1h)::date`) | `20260630_token_reset_align_to_slate_2300kst.sql:22,69` | cron `0 14 * * *` (`vercel.json:4-6`) + lazy(`tokens/balance:26`) 이중 경로, 회차당 1회 가드로 이중충전 방지 |

---

## 5. 특이사항 / 냄새

### 5-1. 정산 로직 이원화 — `expire_stale_pending_predictions` (중요)
슬립 won/lost/cancelled 판정 로직이 **TS(`lib/betman/settle.ts:235-419`)와 SQL(prod_schema.sql:1542-1572) 두 곳에 독립 구현**되어 있다. SQL 쪽은 (1) 부분취소 시 total_odds 재계산 없음(TS 는 :307-321 에서 수행 — 취소 경기 배당이 그대로 곱해진 채 won 확정될 수 있음), (2) settlement_audit_log 미기록, (3) 정산 알림 미발송, (4) 유저 통계/스타디움 동기화 미실행, (5) refund 실패 시 pending_refunds 큐잉 없음(PERFORM 반환 무시 :1569). 48h 만료 케이스에만 발동하지만 같은 상태머신의 두 번째 구현이라 드리프트 위험이 실재.

### 5-2. 환불 재시도 헬퍼 중복
`lib/betman/settle.ts:29-76`(retryRefund — audit row 포함)과 `lib/betman/refund-tokens.ts:13-46`(retryRefundTokens)이 동일한 3회 재시도→pending_refunds→Sentry 패턴의 복제본. source 문자열만 다름(`settlement_refund_failed` vs `refund_retry_exhausted`). 또 `app/api/predictions/purchase/route.ts:150-198` 에 골드용 3회 재시도가 세 번째 인라인 복제로 존재.

### 5-3. 멱등성/중복 실행 방지 — 대체로 양호
- 정산: 모든 상태 전이가 `.eq("status","pending")` 조건부 update (settle.ts:200,223,264,333,377) → 동시 실행돼도 한쪽만 성공. 환불도 슬립 cancelled 전이 성공 시에만 발동(:267-283) → 이중 환불 방지.
- 결과 재수신: result-guard 가 settled 픽 있는 경기 변경 차단 (`results/route.ts:129-144`).
- 제출: idempotency_key + unique partial index (§1-b).
- 토큰 리셋: 회차당 1회 DB 가드 (20260630:37-40).

### 5-4. 에러 삼킴 — 의도적 무해화가 대부분, 예외 2곳
- 정산 부수효과(알림/audit/스타디움)는 실패해도 정산 유지 + Sentry (settle.ts:421-456) — 설계된 삼킴.
- `fetchAllGmTs` 는 catch 후 빈 배열 (`lib/betman/game-fetcher.ts:92-94`) — Vercel 해외 IP 특성상 의도적이나 로그 0.
- games GET 의 `sync_live_room_status` RPC 실패 무시 (`games/route.ts:72-74`) — "RPC 없으면 무시" 주석뿐 Sentry 없음.
- daily-token-reset cron 은 실패 유저를 errorCount 숫자로만 집계 (`daily-token-reset/route.ts:52-58`) — 어떤 유저가 실패했는지 소실. (lazy reset 이 보정하므로 실피해는 제한적.)

### 5-5. 기타
- **rate-limit 사각**: 미들웨어 STRICT 목록(`lib/middleware/rate-limit-guard.ts:4-12`)에 `/api/betman/prediction`(및 rewrite 원본 `/api/sports/prediction`)이 없음 — 돈 차감 라우트인데 STANDARD 만 적용. `/api/tokens/spend` 등은 STRICT + 라우트 내 `checkRateLimit` 이중인데 prediction 은 어느 쪽도 없음.
- 안전망의 안전망: settle-pending(15분, `vercel.json:16-18`)이 못 잡은 미정산은 ops-monitor(30분)가 감지·알림 (`app/api/cron/ops-monitor/route.ts:185-197`), pending_refunds 적체도 감시(:213-215). 관측 체계는 촘촘함.
- `app/api/predictions/settle/route.ts:12,113-114` 주석이 인코딩 깨짐(mojibake) — 기능 무관, 파일 저장 인코딩 사고 흔적.
- `spend_gold` 반환 키는 `remaining` (prod_schema.sql:3361), `spend_tokens` 는 `remaining_balance` (:3369) — 비대칭이지만 호출부는 모두 올바르게 매핑 (predictions/purchase:117, prediction:369).
- prediction GET status=all 의 profit 계산(`prediction/route.ts:642-646`)이 슬립의 **현재** total_odds × stake 로 재계산 — 부분취소로 total_odds 가 조정된 경우(settle.ts:317-321 이 DB 갱신) 일관되나, 정산 시점 payout(audit 의 :326)과 반올림 방식이 다름(`Math.round(stake*odds)` vs `Math.round(...*100)/100`). 소수 스테이크에서 ±1 표시 차 가능.

### ❓ 미확인
- `lib/predictions/retry-seller-reward.ts` 본문, `app/api/admin/users/[userId]/adjust-economy/route.ts` 본문 (RPC 사용은 grep 으로만 확인)
- VPS 스크립트 실체(`/opt/betman/sync.sh`, `fetch-results.sh`) — 저장소 외부, 언급만
- `assign_daily_round` · `sync_live_room_status` RPC 정의 (prod_schema 내 존재 여부 미열람)
- 프로덕션 DB 의 실제 GRANT 상태 (마이그레이션 적용 여부는 코드로만 추정)
