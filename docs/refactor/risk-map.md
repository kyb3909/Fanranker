# 위험 지도 — 리팩토링 전에 알아야 할 것

작성일: 2026-07-28
기준 커밋: `70d43b9a`
범위: **코드를 고치지 않고**, 고치기 전에 확정해야 할 사실만 기록한다.
자매 문서: 테스트 갭은 `docs/refactor/test-gaps.md`, 리팩토링 후보는 `docs/refactor/candidates.md`.

이 문서의 핵심 산출물은 마지막 절 **"테스트 없이 손대면 안 되는 파일 목록"** 이다.

## 읽는 법

- 파일:라인은 위 커밋 기준. 라인이 밀리면 심볼명으로 다시 찾을 것.
- **"미확인"** = 코드를 읽어서 확인하지 못한 것. 추측으로 채우지 않았다.
- 이 문서는 **정적 코드 읽기**로만 작성했다. 프로덕션 DB 상태(마이그레이션 적용 여부), 실제 Vultr VPS 파일, 런타임 헤더 동작은 조회하지 않았다. 해당 항목은 전부 "미확인"으로 표기했다.
- 위험도 기준:
  - **상** = 조용히 깨진다(에러 없이 잘못된 결과) 또는 돈/권한이 걸려 있는데 테스트가 없다
  - **중** = 시끄럽게 깨진다(500/빈 화면) 또는 방어선이 하나뿐이다
  - **하** = 깨져도 기능 일부만 죽고 복구가 쉽다

---

# 1. 돈 경로 — 볼/골드 차감·지급·환불·정산

## 1.0 전체 그림: 트랜잭션 경계가 어디에도 없다

**돈이 움직이는 모든 흐름이 "RPC 1개 = 트랜잭션 1개" 단위로만 원자적이고, 그 위의 다단계 흐름은 전부 비원자적이다.**

DB 함수는 제대로 만들어져 있다:

- `spend_tokens` — `supabase/migrations/00000000000001_prod_schema.sql:3369`
  `SELECT ... FOR UPDATE` 로 `user_tokens` 행 잠금 후 차감 + `token_transactions` 기록까지 한 트랜잭션 (`:3405-3425`)
- `spend_gold` — `supabase/migrations/00000000000001_prod_schema.sql:3332`
  `user_gold` 행 `FOR UPDATE` 후 차감 + `gold_transactions` 기록 (`:3341-3361`)
- `refund_tokens` — `supabase/migrations/00000000000001_prod_schema.sql:2808`

**문제는 API 레이어다.** 애플리케이션 코드에는 `BEGIN`/`COMMIT`이 단 한 군데도 없다. 차감 RPC가 성공한 뒤 이어지는 INSERT가 실패하면, 되돌리는 방법은 **보상 트랜잭션(재시도 환불)** 뿐이고 그 환불도 실패할 수 있다. 실패 시 최종 안전망은 `pending_refunds` 테이블 + Sentry fatal + 어드민 수동 처리다.

이건 알고 만든 설계(`lib/betman/refund-tokens.ts`, `lib/predictions/retry-seller-reward.ts`가 그 증거)지만, **리팩토링 시 이 보상 경로를 하나라도 끊으면 손실이 조용히 발생한다.**

---

## 1.1 `app/api/betman/prediction/route.ts` — 볼 차감 후 3단계 비원자 흐름

**위험도: 상**

### 흐름

| 단계 | 라인 | 실패 시 |
|---|---|---|
| 배당 검증 | `:265-290` | 400 반환 (차감 전 — 의도적, 주석 `:265-268`이 명시) |
| `spend_tokens` 차감 | `:361-370` | 500 반환, 차감 안 됨 |
| `prediction_slips` INSERT | `:405-409` | `:413` `retryRefundTokens` 3회 → 실패 시 `pending_refunds` |
| `betman_predictions` INSERT | `:442-446` | `:449` 슬립 삭제 + `:450` 환불 3회 |
| `prediction_activities` upsert | `:477-486` | `:487` catch로 무시 (돈 아님, OK) |
| 팔로워 알림 | `:493-504` | `:506` catch로 무시 (OK) |

### 깨지면 사용자에게 보이는 증상

- **환불 3회가 전부 실패**: 볼은 빠졌는데 슬립이 없다. 사용자 화면에는 "베팅 슬립 생성 중 오류" 토스트만 뜨고 잔액은 줄어 있다. 새로고침하면 예측 내역이 비어 있다. 복구는 `pending_refunds` → `/admin/refunds` 수동 처리(최대 며칠).
- **`:449` 슬립 삭제가 실패하고 `:450` 환불만 성공**: 고아 슬립(예측 0개)이 남는다. `lib/betman/settle.ts:236`의 `affectedSlipIds`에 안 잡히므로 영원히 `pending` 상태로 남고, `/my-predictions`에 "정산 대기" 로 계속 표시된다.

### 조용히 틀리는 경로 — `total_odds = 0` 슬립

`:274-278`:
```ts
home: parseFloat(String(game.home_win_odds)) || 0,
```
`String(null)` → `"null"` → `parseFloat` → `NaN` → `|| 0` → **0**.

`:265-290`의 배당 검증이 `predictions` 배열에 담긴 **선택된 마켓**만 검사하므로(`:280` `oddsMap[pred.prediction]`), 그 검증은 통과한다. 그런데 `:386-389`에서 `totalOdds`를 누적할 때는 같은 `oddsByPrediction` 맵을 쓰므로 검증된 값만 곱해진다 — **현재 로직상으로는 0 붕괴가 발생하지 않는다.**

단, `:265-290`의 검증 루프와 `:386-389`의 누적 루프가 **동일한 `oddsByPrediction` 맵에 의존한다는 사실이 유일한 방어선**이다. 이 둘을 분리하거나 검증을 다른 함수로 추출하는 순간 0 붕괴가 열린다. 리팩토링 시 두 블록은 반드시 같이 움직여야 한다.

### 테스트

**부분적 — 실질 없음.** `__tests__/api/betman-prediction.test.ts` 는 route.ts 의 zod 스키마를 **테스트 파일 안에 복사해서** 검증한다. 실제 핸들러를 import 하지 않는다. 차감→INSERT→환불 흐름은 **테스트 없음**.

---

## 1.2 `lib/betman/settle.ts` — 정산 로직

**위험도: 상**

`app/api/betman/settle/route.ts:136`, `lib/betman/settle-sweep.ts:95`, (그리고 `app/api/betman/results/route.ts` — 미확인) 세 경로가 공유하는 **단일 정산 함수**다. 여기가 틀리면 모든 정산 경로가 같이 틀린다.

### 알아야 할 계약

- **"점수만" 경제 모델**: 슬립 적중 시 `payout`을 계산하지만(`:326`) **토큰을 지급하지 않는다** (`:365` 주석, `:367` `amount: null`). 토큰이 실제로 움직이는 유일한 정산 경로는 **경기 취소 환불**(`:283-291`)뿐이다.
  → 리팩토링 중 "적중했는데 왜 볼이 안 들어오지?" 를 버그로 오인해 지급 코드를 추가하면 **경제 규칙 위반**이다. `feedback`/메모의 "코인 경제 규칙: 적중=점수만" 참조.
- **멱등성은 `.eq("status", "pending")` 조건부 UPDATE로만 보장된다** — `:200`, `:223`, `:264`, `:333`, `:377`. 이 `.eq()` 를 하나라도 떼면 재실행 시 **중복 환불**이 발생한다. `settle-pending` cron이 15분마다 돌므로 즉시 터진다.
- **`getPointsEarned` (`:121-135`) 의 nullable 처리**:
  - `:78-93` `GameData` 인터페이스가 odds 를 `string` (non-nullable) 로 선언하지만, 실제 스키마는 `numeric(5,2)` **nullable** (`supabase/migrations/00000000000001_prod_schema.sql:4644-4650`). 타입이 거짓말을 한다.
  - `:126-132` `parseFloat(null) || 0` → **0**.
  - 방어선은 `:122` `if (pred.locked_odds && pred.locked_odds > 0) return pred.locked_odds` 하나뿐. `locked_odds` 는 `prod_schema.sql:4714`에서 nullable이고, `locked_odds` 컬럼 도입 이전 예측 행에는 NULL일 수 있다(**해당 행의 실존 여부는 미확인**).
  - **증상**: 적중했는데 `points_earned = 0` 으로 정산 확정. 에러도 로그도 없다. `/my-predictions`에 "적중"으로 표시되지만 통계 배당이 0.

### 깨지면 보이는 증상 (요약)

| 무엇을 건드리면 | 증상 |
|---|---|
| `.eq("status","pending")` 제거 | 취소 경기 환불이 15분마다 반복 지급 → 볼 무한 증식 |
| `retryRefund` (`:29-76`) 의 `pending_refunds` INSERT 제거 | 환불 실패가 흔적 없이 사라짐. Sentry만 남고 복구 불가 |
| `:236` `affectedSlipIds` 계산 변경 | 슬립이 정산 안 되고 영구 `pending` → 사용자 마이페이지에 "정산 대기" 고착 |
| `:246` `if (slipPreds.some(p => p.status === "pending")) continue` 제거 | 일부 경기만 끝난 슬립을 조기 확정 → **오정산** |
| `:308-321` 부분취소 `adjustedTotalOdds` 재계산 변경 | 취소 경기 포함 슬립의 배당이 틀림 |

### 테스트

**있음 — `__tests__/lib/betman/settle.test.ts`** (16 케이스). 실제 `settlePredictions` 를 import 한다(자매 문서 `test-gaps.md` 기준 유효 테스트).
커버: 적중/미적중/취소/혼합/`locked_odds` 우선순위(`:216`)/`locked_odds` NULL 시 game odds 폴백(`:249`)/SUM 홀짝(`:370-428`).
**미커버**: odds 자체가 NULL 인 경우(= `getPointsEarned` 0 반환 경로), 환불 재시도 3회 실패 → `pending_refunds` 경로, 부분취소 `adjustedTotalOdds` 재계산, 알림/audit INSERT 실패.

---

## 1.3 `app/api/predictions/purchase/route.ts` — 골드 구매 (5단계 비원자)

**위험도: 상**

가장 단계가 많은 돈 흐름이고, **양쪽 당사자(구매자·판매자)의 돈이 다른 시점에 움직인다.**

| 단계 | 라인 | 실패 시 보상 |
|---|---|---|
| 중복구매 체크 | `:90-95` | — |
| `spend_gold` 500골드 차감 | `:106-120` | — |
| `prediction_purchases` INSERT | `:137-146` | `:153-167` 인라인 3회 `reward_gold` 환불 → 실패 시 `:169` Sentry fatal, **`pending_refunds` 기록 없음** |
| 판매자 450골드 정산 | `:190-197` `retrySellerReward` | `lib/predictions/retry-seller-reward.ts` 내부에서 `pending_seller_rewards` 큐 |
| 판매자 알림 | `:200-220` | catch 무시 (OK) |

### 구체적 위험

1. **구매자 환불 실패는 큐에 안 들어간다** (`:168-181`). 토큰 환불(`lib/betman/refund-tokens.ts:31`)은 `pending_refunds` 에 기록하는데, 여기는 Sentry 메시지만 남기고 끝난다. **어드민 화면(`/admin/refunds`)에서 보이지 않는다.** 사용자는 500골드를 잃고 구매도 못 한 상태로 남으며, 아무도 이걸 목록으로 찾을 수 없다.
   → 증상: "골드는 빠졌는데 분석글이 안 열려요" 문의. 대조할 데이터가 Sentry 뿐.
2. **중복구매 체크(`:90-95`)와 차감(`:106`) 사이에 원자성이 없다.** 같은 사용자가 동시에 두 번 요청하면 둘 다 체크를 통과하고 **1000골드가 빠진다**. `prediction_purchases` 에 unique 제약이 있으면 두 번째 INSERT가 실패하고 환불 경로를 타지만, `(buyer_id, activity_id)` unique 제약의 존재 여부는 **미확인**. 제약이 없으면 중복 행 2개 + 판매자에게 900골드 지급.
   완화: `:21` `checkRateLimit(request, "STRICT")` 가 있지만 rate limit 은 동시성 방어가 아니다.
3. **`:130`, `:226` `spendResult.remaining`**: `spend_gold` 실패 경로(`prod_schema.sql:3346`)는 `{success:false, error_message}` 만 반환하므로 `:130`의 `gold_balance` 는 **항상 `undefined`**. 클라이언트가 잔액 표시에 쓰면 "NaN 골드" 가 보인다(실제 UI 반영 여부는 미확인).

### 테스트

**부분적.** `__tests__/api/predictions-purchase.test.ts` 존재. 단, RPC 반환 키(`remaining`) 검증은 grep 결과 0건 — 5단계 흐름과 환불 경로는 **커버 안 됨**.

---

## 1.4 `app/api/admin/refunds/route.ts` PATCH — TOCTOU 이중 환불

**위험도: 중**

```
:86   if (refund.status !== "pending") return 400      ← 읽기
:94   supabase.rpc("refund_tokens", ...)               ← 지급
:115  .update({ status: "resolved" }).eq("id", refundId)  ← .eq("status","pending") 없음
```

상태 확인과 상태 변경 사이에 조건부 UPDATE 가 없다. 어드민이 "재시도" 버튼을 빠르게 두 번 누르거나 탭 두 개에서 처리하면 **두 요청 모두 `:86` 을 통과하고 `refund_tokens` 가 두 번 실행**된다.

**증상**: 사용자에게 환불 볼이 두 배 지급된다. `pending_refunds` 는 `resolved` 1건으로만 남아 사후 추적이 안 된다.

**고치는 법(참고, 이 문서 범위 밖)**: `:115` UPDATE 에 `.eq("status","pending")` 추가 + 반환 행 수 확인 후에만 RPC 호출, 또는 RPC 를 UPDATE 뒤로 이동.

**테스트**: **없음.**

---

## 1.5 `app/api/gold/reward/route.ts` — self-service 지급의 멱등성

**위험도: 중**

사용자가 직접 호출해 자기 계정에 골드를 넣는 유일한 라우트다. 방어는 3중:
- `:8-12` 타입 화이트리스트 + 타입별 `maxAmount`/`maxPerUser`
- `:61-69` `gold_transactions` count 기반 횟수 제한
- `:72-83` `description` 문자열 일치 기반 멱등성

**약점 두 가지**:
1. **멱등 키가 `description` 문자열이다** (`:76`). 클라이언트가 보내는 자유 문자열(`z.string().max(100)`, `:16`)이므로, description 을 조금만 바꾸면 멱등 체크를 우회한다. 방어는 `maxPerUser` 카운트 뿐.
2. **count 체크(`:61`)와 `reward_gold`(`:86`) 사이에 원자성이 없다.** 동시 요청 N개가 전부 count 를 통과하면 `maxPerUser` 를 초과해 지급된다. `mini_game_reward` 는 `maxAmount: 500, maxPerUser: 50` 이므로 이론상 상한이 25,000골드다.

**증상**: 골드 잔액이 설명 안 되게 늘어난 계정이 생긴다. 즉시 눈에 띄지 않는다(골드 UI는 현재 숨김 상태 — 메모 `project_gold_economy_hidden.md`).

**테스트**: **없음.**

---

## 1.6 `app/api/admin/users/[userId]/adjust-economy/route.ts` — 어드민 잔액 조정

**위험도: 중**

`:64` `const newBalance = (current?.token_balance ?? 0) + amount`, `:101` 골드 동일.
**RPC 를 쓰지 않고 read-modify-write 를 애플리케이션에서 한다.** 행 잠금이 없으므로, 조정 중 사용자가 베팅하면 그 차감이 덮어써진다(lost update).

**증상**: 어드민이 +100볼 지급했는데 사용자 잔액이 그만큼 안 늘거나, 사용자의 베팅 차감이 사라진다. 드물고 재현이 어렵다.

`:79`, `:116` `Math.max(0, amount)` — 레코드가 없을 때 음수 조정을 0으로 흡수한다. 의도는 맞지만 어드민에게는 "조정했다"고 응답한다.

**테스트**: **없음.** (`__tests__/api/admin-role-change.test.ts` 는 role 변경만, 그것도 복사본 로직.)

---

## 1.7 `app/api/cron/daily-token-reset/route.ts` — 전체 사용자 리셋

**위험도: 중**

`:23` `supabase.from("user_tokens").select("user_id")` — **페이지네이션 없음**. PostgREST 기본 상한(보통 1000행)에 걸리면 **1000명 이후 사용자는 볼이 리셋되지 않는다**. 조용히 실패한다(`:53` 에서 개별 실패만 카운트, 애초에 목록에 없는 사용자는 카운트조차 안 됨).

**증상**: 특정 사용자만 "오늘 볼이 안 채워졌어요". 재현 불가(사용자 목록 순서에 따라 다름). 현재 사용자 수가 1000명 미만이면 아직 안 터진다 — **실제 `user_tokens` 행 수는 미확인**.

리셋 경계 로직 자체는 DB 함수(`reset_user_daily_tokens`)에 있고 `supabase/migrations/20260630_token_reset_align_to_slate_2300kst.sql:14` 에서 23:00 KST 슬레이트 경계로 재정의됐다. 이 함수를 재정의할 때는 **`20260718_revoke_economy_rpc_grants.sql` 의 REVOKE 를 다시 붙여야 한다**(§2.4 참조).

**테스트**: **없음.**

---

## 1.8 돈 경로 요약표

| 파일 | 트랜잭션 경계 | 보상 경로 | 큐 기록 | 테스트 | 위험도 |
|---|---|---|---|---|---|
| `app/api/betman/prediction/route.ts:361-462` | 없음 | `retryRefundTokens` ×3 | `pending_refunds` ✅ | 스키마 복사본만 | 상 |
| `lib/betman/settle.ts` | 없음 (조건부 UPDATE 멱등) | `retryRefund` ×3 | `pending_refunds` ✅ | 16 케이스 ✅ (nullable/환불 미커버) | 상 |
| `app/api/predictions/purchase/route.ts:106-197` | 없음 | 인라인 ×3 + `retrySellerReward` | 구매자 ❌ / 판매자 ✅ | 부분 | 상 |
| `app/api/payments/purchase/route.ts:114-148` | 없음 | `retryRefundTokens` ×3 | `pending_refunds` ✅ | 있음(부분) | 중 |
| `app/api/tokens/spend/route.ts:78-105` | RPC 1개로 완결 | 불필요 | — | 있음(부분) | 하 |
| `app/api/admin/refunds/route.ts:86-118` | 없음 (TOCTOU) | 없음 | — | 없음 | 중 |
| `app/api/gold/reward/route.ts:61-91` | 없음 | 없음 | — | 없음 | 중 |
| `app/api/admin/users/[userId]/adjust-economy/route.ts:64,101` | 없음 (RMW) | 없음 | — | 없음 | 중 |
| `app/api/cron/daily-token-reset/route.ts:23` | — | — | — | 없음 | 중 |
| `app/api/flair/donate/route.ts:44` | RPC 1개로 완결 (`donate_flair_score_to_team`) | 불필요 | — | 없음 | 하 |

---

# 2. 인증·권한

## 2.1 `lib/supabase/server.ts` — service role 에 `server-only` 가드가 없다

**위험도: 상**

`lib/supabase/server.ts:1-18` — 파일 상단에 `import "server-only"` 도, `"use server"` 도 없다. `createServiceRoleClient()` (`:54`) 는 `SUPABASE_SERVICE_ROLE_KEY` 를 읽는다(`:60`, `:72`).

**현재 위반은 0건이다** (확인함: `components/`, `hooks/`, `"use client"` 파일에서 `createServiceRoleClient` / `SUPABASE_SERVICE_ROLE_KEY` import 0건).
문제는 **안전망도 0** 이라는 점이다. 서버 컴포넌트에 `"use client"` 한 줄을 추가하는 리팩토링이 빌드 에러 없이 통과한다.

노출 시 최악: service role 키는 RLS 를 전부 우회한다. 브라우저 번들에 들어가면 **전체 DB read/write 가 공개**된다.

특히 위험한 파일 — service role 을 import 하는 **서버 컴포넌트**들 (`"use client"` 로 바뀌면 즉시 노출):
`app/worldcup/page.tsx`, `app/worldcup/games/page.tsx`, `app/worldcup/leaderboard/page.tsx`, `app/worldcup/register/page.tsx`, `app/worldcup/result/page.tsx`, `app/transfer/page.tsx`, `app/snack/page.tsx`, `app/games/draft/epl/room/[id]/page.tsx` (+`play`,`result`), `app/admin/**/page.tsx` 13개, `app/admin/event/actions.ts:4`.

**추가 지점**: `lib/middleware/onboarding-guard.ts:48` 은 `createServiceRoleClient()` 를 거치지 않고 `process.env.SUPABASE_SERVICE_ROLE_KEY` 를 직접 읽어 클라이언트를 만든다(`:53`). 미들웨어에서 service role 키를 직접 다루는 유일한 지점이다.

**테스트**: **없음.** (ESLint 규칙도 없음 — 확인함.)

---

## 2.2 `app/admin/layout.tsx:13` — `/admin` 전체의 유일한 role 게이트

**위험도: 상**

```
lib/middleware/admin-guard.ts:16-25  → userId 유무만 확인. role 검사 없음.
app/admin/layout.tsx:12-16           → requireAdmin() 실패 시 redirect('/')
```

**미들웨어는 "로그인했나" 만 본다.** 일반 로그인 유저는 `adminGuard` 를 그냥 통과한다. `/admin` 페이지들의 role 강제는 **레이아웃 한 파일**에만 있다.

그리고 그 페이지들은 `createServiceRoleClient()` 로 직접 데이터를 읽으므로 RLS 방어도 없다 (`app/admin/users/page.tsx`, `app/admin/tokens/page.tsx`, `app/admin/system/page.tsx` 등).

**깨지면 보이는 증상**: 아무 로그인 유저나 `/admin/users` 를 열면 전체 회원 목록·토큰 잔액·역할이 보인다. **에러가 안 나므로 아무도 모른다.** 라우트 그룹 재배치(`app/(admin)/admin/...`), 레이아웃 분할, 페이지를 `app/admin` 밖으로 이동 — 전부 이 게이트를 무력화한다.

반면 **`/api/admin/*` 39개 라우트는 안전하다**: `admin-guard.ts:14` 가 `/api` 를 아예 스킵하므로 원래부터 미들웨어 보호가 없었고, 대신 39개 전부 자체 in-route 체크를 갖고 있다(확인함 — 미검사 라우트 0건). 31개는 `requireAdminApi()` (`lib/admin/require-admin-api.ts:14`), 5개는 `requireAdmin()` + try/catch, 3개는 인라인 ad-hoc 체크:
- `app/api/admin/metaverse/chat-rooms/[id]/route.ts:13-26`
- `app/api/admin/users/certify-expert/route.ts:23-41`
- `app/api/admin/users/certify-journalist/route.ts:23-41`

이 3개는 표준 헬퍼를 안 쓰므로 헬퍼가 개선돼도 따라오지 않는다(드리프트 위험, 위험도 중).

**테스트**: **없음.** `requireAdminApi()` / `requireAdmin()` / `adminGuard` 전부 단위 테스트 파일 자체가 없다. `tests/e2e/journeys/admin/admin-pages.spec.ts` 가 스모크 수준으로 존재.

---

## 2.3 `middleware.ts` — 가드 순서 의존성

**위험도: 중**

```
middleware.ts:17-18   rateLimitGuard(req)
middleware.ts:21-22   await adminGuard(auth, req)
middleware.ts:25-26   await onboardingGuard(auth, req)
```

체인 패턴이 `if (result) return result` 인데, **`onboardingGuard` 는 "통과"할 때도 non-null 을 반환한다**:

`lib/middleware/onboarding-guard.ts:72-79` — 온보딩 완료 확인 시 `NextResponse.next()` 에 `onboarding_done` 쿠키를 실어 반환한다. 이건 리다이렉트가 아니라 정상 통과인데, 호출부 입장에서는 구분이 안 되고 **체인이 종료된다**.

지금은 마지막이라 문제가 없다. **`onboardingGuard` 를 2번으로 올리면 그 순간 `adminGuard` 가 스킵된다** (쿠키 없는 완료 유저의 첫 요청에서). 남는 방어선은 §2.2의 `app/admin/layout.tsx:13` 뿐.

### 별도 발견 — DB 에러 시 온보딩이 24시간 뚫린다

`lib/middleware/onboarding-guard.ts:57-79`:
- `.single()` 은 에러를 **throw 하지 않고** `{ data: null, error }` 를 반환한다 → `:80` 의 catch 로 안 간다.
- Supabase 타임아웃 등으로 `profileError.code !== "PGRST116"` 이면:
  - `:63` `isNewUser` = false (코드가 PGRST116 아님)
  - `:64` `isOnboardingIncomplete` = falsy (`profile` 이 null)
  - → `:66` 조건 미충족 → **`:72-79` 로 떨어져 `onboarding_done` 쿠키를 24시간 심는다**

**증상**: DB 가 잠깐 느려진 순간에 접속한 **온보딩 미완료 유저가 24시간 동안 온보딩을 건너뛴다.** 프로필 없이 사이트를 쓰게 되고, 프로필을 전제하는 기능(`spend_tokens` 는 `prod_schema.sql:3388` 에서 profiles 존재를 확인함)에서 "사용자를 찾을 수 없습니다" 로 실패한다.

`:80-83` 의 catch 경로(진짜 예외)는 반대로 `/sign-up` 리다이렉트 = fail-closed 다. 즉 **같은 파일 안에서 실패 방향이 상반된다.**

**테스트**: **부분적 — 실질 없음.** `__tests__/lib/middleware/onboarding-guard.test.ts` 는 `isOnboardingExcluded` 순수 함수를 **테스트 파일 안에 복사해서** 검증한다. 가드 함수 자체를 import 하지 않는다. `__tests__/lib/middleware/rate-limit-guard.test.ts` 도 동일 패턴. `adminGuard` 는 테스트 파일 없음.

---

## 2.4 경제 RPC 의 EXECUTE 권한 — 함수 재정의 시 재부착 필수

**위험도: 상**

`supabase/migrations/20260718_revoke_economy_rpc_grants.sql:23-47` 이 `pg_proc` 를 순회하며 15개 경제 RPC 에서 `public, anon, authenticated` 의 EXECUTE 를 회수한다.

배경(마이그레이션 주석 `:4-8`): 이 함수들은 전부 `SECURITY DEFINER` 이고 `p_user_id` 를 **인자로만** 받는다. 내부 인증 검사가 없다. 브라우저가 공개 publishable key 로 `/rest/v1/rpc/spend_tokens` 를 직접 때리면 **자기 계정에 볼/골드 무한 충전이 가능하다.**

**함정**: `CREATE OR REPLACE FUNCTION` 은 기존 권한을 유지하지만, **시그니처가 바뀌면 새 함수가 생기고 기본 권한(PUBLIC EXECUTE)으로 시작한다.** `reset_user_daily_tokens` 가 이미 3번 재정의됐다(`prod_schema.sql:2898`, `20260630_fix_double_daily_token_reset.sql:16`, `20260630_token_reset_align_to_slate_2300kst.sql:14`).

**증상**: 없다. 조용히 뚫린다. 발견은 잔액 이상이 눈에 띌 때.

대상 함수 15개 (`20260718_revoke_economy_rpc_grants.sql:26-34`):
`spend_tokens`, `refund_tokens`, `spend_gold`, `reward_gold`, `admin_adjust_tokens`, `admin_adjust_gold`, `escrow_hold_gold`, `escrow_release_gold`, `escrow_refund_gold`, `import_betman_round`, `metaverse_award_flair_karma`, `metaverse_purchase_avatar`, `metaverse_spend_activity_points`, `purchase_sticker`, `purchase_noun_title`

**프로덕션 DB 의 현재 권한 상태는 미확인** (DB 조회 안 함).

**테스트**: **없음.** (권한은 SQL 레벨이라 vitest 로 잡을 수 없다 — CI 에서 `has_function_privilege` 쿼리를 돌리는 게 유일한 방법.)

---

## 2.5 `app/api/wisetoto/sync/route.ts:32-47` — 헤더만으로 통과하는 쓰기 엔드포인트

**위험도: 중**

`verifyCronSecret` **또는** Origin/Referer 화이트리스트(`:35` `ALLOWED_ORIGINS`, `:46-47`)로 통과한다. HTTP 헤더는 위조 가능하므로 `curl -H "Origin: https://gongnori.fan"` 하나로 인증 없이 호출된다. 이 라우트는 `createServiceRoleClient()` (`:51`) 로 `betman_games.{home_score,away_score,status}` 를 쓴다(`:114-125`).

코드 주석(`:29-31`)이 이를 인지하고 "25초 쿨다운 걸린 멱등 동기화라 잔여 위험 낮음" 으로 수용했다. **수용된 위험이므로 함부로 "고치지 말 것" 이 아니라, 리팩토링 중 쿨다운(`:54-78`)을 제거하면 수용 근거가 사라진다**는 점을 기억할 것.

`vercel.json:23-26` 에 매분 등록돼 있다.

**테스트**: **없음.**

---

## 2.6 `lib/metaverse/auth.ts:26-32` — `NODE_ENV` 하나에 걸린 게스트 신원

**위험도: 중**

`resolveMetaverseUser()` 는 `NODE_ENV !== "development"` 일 때만 게스트 헤더(`METAVERSE_GUEST_HEADER`) 경로를 차단한다. 프로덕션은 안전하지만, `NODE_ENV` 가 잘못 설정된 환경(프리뷰/스테이징)에서는 **헤더 하나로 임의 `userId` 를 주장**할 수 있고, 그 값이 그대로 경제 RPC 의 `p_user_id` 로 흘러간다:
- `app/api/metaverse/chat-rooms/route.ts:51`
- `app/api/metaverse/avatar/purchase/route.ts:31`
- `app/api/metaverse/avatar/equip/route.ts:33`

이건 **요청 본문/헤더에서 신원을 파생하는 유일한 경제 경로**다. 나머지 `p_user_id` 전달 15건은 전부 Clerk `currentUser()`/`auth()` 파생이며, 본문에서 `user_id` 를 받는 3개 라우트는 전부 admin 게이트 뒤에 있다(확인함).

**테스트**: `__tests__/lib/metaverse/auth.test.ts` 존재. **커버 범위 미확인.**

---

## 2.7 cron 인증

**위험도: 하** (현재 상태 양호 — 회귀 방지 목적으로만 기록)

`app/api/cron/*` **14개 전부** `verifyCronSecret` 을 호출한다(미검증 0건, 확인함). 구현(`lib/cron-auth.ts:11`)도 `timingSafeEqual`(`:28`) + 미설정 시 500(`:13-19`) 로 견고하고, `__tests__/lib/cron-auth.test.ts` 가 **실제 함수를 import 해서** 검증하는 드문 좋은 테스트다.

관측 공백 하나: `lib/cron/log-run.ts:20` 의 `withCronLog` 는 `verifyCronSecret(req) === null` 일 때만 로그를 남긴다. **무단 호출 시도는 `cron_run_log` 에 안 남는다.**

**테스트**: `verifyCronSecret` 자체 ✅ / **개별 라우트가 실제로 호출하는지는 테스트 없음** (라우트 단위 테스트 부재 → 리팩토링 중 한 라우트에서 가드를 빼도 아무 테스트가 안 깨진다).

---

# 3. 외부 계약 — 우리가 바꾸면 밖에서 깨지는 것

## 3.1 Vultr VPS ↔ Supabase 직접 테이블 계약

**위험도: 상**

**가장 중요한 사실: VPS 는 우리 API 를 거의 쓰지 않는다. Supabase REST 로 테이블에 직접 쓴다.**
(이유는 `docs/architecture/workflow-vultr-betman-supabase.md:50` — Vercel Deployment Protection 이 VPS 에 401 을 반환)

즉 **마이그레이션으로 컬럼명이나 unique 인덱스를 바꾸면 Next.js 쪽에는 아무 신호가 없고 VPS 만 조용히 죽는다.**

저장소 안의 백업본은 `scripts/vps-betman/` 이다. **원본은 VPS `/opt/betman/*.sh` 에 있고 자동 동기화되지 않는다** (`scripts/vps-betman/README.md`). 저장소 백업본과 VPS 실제 파일의 일치 여부는 **미확인**.

| 스크립트:라인 | 의존하는 DB 계약 |
|---|---|
| `scripts/vps-betman/sync.sh:311` | `betman_games` + **unique(round_id, game_no)** (`on_conflict`) |
| `scripts/vps-betman/sync.sh:367` | `betman_unknown_games` + **unique(source, gm_ts, game_no, bet_typ_id, handi_val)** — 5컬럼 인덱스 |
| `scripts/vps-betman/sync.sh:202,215,238` | `betman_rounds` — `gm_ts`, `status='closed'` |
| `scripts/vps-betman/sync.sh:26,384,527,571` | `betman_sync_state` — `id, latest_gm_ts, last_error, last_checked_at, updated_at` |
| `scripts/vps-betman/fetch-results.sh:205,231,328,335,367` | `betman_games` — `home_score, away_score, game_type='일반', result, status, match_time, daily_round_id` |
| `scripts/vps-betman/monitor.sh:26,35` | `betman_sync_state`, `betman_rounds.round` 컬럼 |
| `scripts/vps-betman/integrity-check.sh:44,103,121,136,150` | `betman_games.over_under_line`, `.daily_round_id`, `betman_rounds` |

**증상**: 경기 목록이 갱신 안 됨 → `/prediction` 이 빈 슬레이트 → 사용자가 베팅을 못 한다. Vercel 로그에는 아무것도 안 남는다. 발견은 Discord ops 알림(`/api/cron/ops-monitor`)이나 사용자 문의로.

**테스트**: **없음.** (스크립트가 bash 이고 저장소 밖이라 vitest 범위 밖.)

---

## 3.2 `app/api/betman/settle` 응답 키 — VPS 가 파싱한다

**위험도: 상**

VPS 가 실제로 호출하는 **유일한** 저장소 내 API 라우트다.

- 호출: `scripts/vps-betman/fetch-results.sh:307-312` (body `{"gm_ts":"..."}`), `scripts/vps-betman/integrity-check.sh:156-161` (body `{"daily_round_id":"..."}`)
- 인증: `app/api/betman/settle/route.ts:34` `verifyCronSecret` (Bearer `CRON_SECRET`)
- 요청 스키마: `app/api/betman/settle/route.ts:9-18`
- **VPS 가 읽는 응답 키**: `.settled`, `.correct`, `.wrong`, `.slips.won`, `.slips.lost` — `fetch-results.sh:314-318` / `.settled` — `integrity-check.sh:163`
- 생산 지점: `app/api/betman/settle/route.ts:126-132` (예측 없음 분기)와 `:178-194` (정상 분기)

**`:126-132` 분기는 `slips` 키를 반환하지 않는다.** VPS 가 `.slips.won` 을 파싱하면 null 이 된다(jq 동작상 에러는 아님 — 로그만 비어 보임).

**증상**: 응답 키를 하나라도 이름 변경하면 VPS 로그·정산 카운트가 조용히 깨진다. 정산 자체는 계속 된다.

**테스트**: **없음.** `__tests__/api/predictions-settle.test.ts` 는 `/api/predictions/settle` (다른 라우트)를 다룬다.

---

## 3.3 `lib/betman/result-fetcher.ts` — betman 필드명 하드코딩 + 조용한 폴백

**위험도: 상**

- 엔드포인트 `/gamebuy/winrst/inqWinrstDetlBody.do` — `lib/betman/result-fetcher.ts:45`
- 응답 배열 키 `data.detlBody` — `:60`
- 대문자 필드명 하드코딩 `GAME_RESULT, GM_SEQ, MCH_SCORE, HANDI_VAL, HOME_TEAM, AWAY_TEAM, FIX_MCH_DTM` — `:22-30`
- **`HANDI_VAL` → game_type 매핑** — `:12-20` (`0→일반, 2→핸디캡, 5→SUM, 6→S핸디캡, 7→S언더오버, 9→언더오버, 14→일반`)
- **조용한 폴백** — `:90`, `:116` `RESULT_HANDI_MAP[item.HANDI_VAL] ?? "일반"`

**대조**: `lib/betman/game-fetcher.ts:151-158` 은 `keys.indexOf()` 로 컬럼을 찾고 못 찾으면 `console.error` + 빈 배열로 **fail-closed** 한다(`:154`). 미지의 `betTypId` 는 샘플 덤프까지 남긴다(`:233-243`).
**`result-fetcher.ts` 만 fail-open 이다.**

**증상**: betman 이 새 `HANDI_VAL` 코드를 도입하면 그 경기가 "일반"으로 취급되어 `mapGameResult` 의 잘못된 분기를 타고 **오정산**된다. 에러 없음, 알림 없음. (메모 `project_betman_volleyball_handicap.md` 의 배구 세트핸디캡 누락이 이 계열 사고.)

**테스트**: **없음.** `lib/betman/` 에서 `result-fetcher.ts`, `http-client.ts`, `sync-state.ts`, `settle-sweep.ts` 만 테스트가 없다 — 그중 가장 드리프트 위험이 큰 파일이 result-fetcher 다.

---

## 3.4 리라이트 계약 — `/api/sports`, `/api/live-scores`

**위험도: 중**

- `next.config.mjs:167-168` `/api/sports/:path*` → `/api/betman/:path*`
- `next.config.mjs:171-172` `/api/live-scores/:path*` → `/api/wisetoto/:path*`
- `next.config.mjs:162-163` `/storage/:path*` → `https://ekysrlhdrapmsnrkytif.supabase.co/...` — **Supabase 프로젝트 ref 하드코딩**

**프로덕션 앱 코드는 규칙을 잘 지킨다** (`/api/betman`·`/api/wisetoto` 직접 호출 0건). 위반은 e2e 스펙에만 있다:
- `e2e/error-states.spec.ts:35-36` — `page.route('**/api/betman/prediction**')` 로 **리라이트 전 경로**를 인터셉트한다. 브라우저는 `/api/sports/prediction` 을 요청하므로 **이 인터셉션은 매치되지 않고, 해당 에러 상태 테스트는 사실상 무효(vacuous pass)** 일 가능성이 높다. (실행해서 확인하지는 않음 — 미확인)
- `e2e/api-smoke.spec.ts:25-27` — 내부 경로를 직접 때린다. **리라이트를 삭제해도 이 테스트는 통과한다** → 공개 계약을 지켜주지 못한다.

`/api/live-scores/*` 를 호출하는 코드는 **저장소 전체에 0건** — 리라이트가 현재 dead 다. `app/api/wisetoto/sync/route.ts:23` 주석은 "프론트엔드에서 30초마다 폴링" 이라고 하지만 폴링 호출자를 찾지 못했다(**미확인** — 제거됐을 가능성).

**증상**: 리라이트를 지우면 프론트 전체의 경기/베팅 화면이 404 로 죽는다. e2e 는 초록색으로 남는다.

**테스트**: **없음** (리라이트 무결성 검증 테스트 부재).

---

## 3.5 Discord — 하드코딩된 외부 ID

**위험도: 중**

`app/api/discord/interactions/route.ts`:
- **길드 ID 하드코딩** `1528110979425239231` — `:17`
- **역할 ID 5개 하드코딩** — `:20-26` (데일리알림 역할은 `:90` 에 한 번 더 중복 하드코딩)
- 버튼 `custom_id` 규약 `role:{roleId}` — `:70`. 길드에 재게시된 버튼의 prefix 가 바뀌면 모든 버튼이 조용히 "알 수 없는 요청이에요" 를 반환한다.
- 서명 검증: `DISCORD_APP_PUBLIC_KEY` — `:47` (`lib/discord/verify-interaction.ts`)

`lib/discord/news-notify.ts`:
- 채널 env 5개 — `:14-20`. **`DISCORD_NEWS_WEBHOOK_SNACK` (`:19`) 은 `lib/env.ts:15-18` 의 zod 스키마에 선언돼 있지 않다** — 런타임에 읽지만 검증 대상이 아니다. env 검증 통과 후에도 스낵 채널만 조용히 no-op 할 수 있다.
- 소스 ID 하드코딩 `reddit-gunners`, `reddit-liverpoolfc`, `reddit-chelseafc` — `:33-37` (`data/crawlers/config/sources.json` 과의 계약)

**테스트**: `lib/discord/news-notify.ts` ✅ `__tests__/lib/discord-news-notify.test.ts` / `lib/discord-notify.ts` (ops 웹훅) **없음** / `app/api/discord/interactions/route.ts` **없음**.

---

## 3.6 기타 외부 계약 (요약)

| 대상 | 파일:라인 | 하드코딩된 계약 | 테스트 |
|---|---|---|---|
| wisetoto 응답 | `app/api/wisetoto/sync/route.ts:11-15`, `:191-196` | `gm_no`, `h_score`, `a_score`. 파싱 실패 시 `:185`/`:188` **조용히 `[]` 반환** | 없음 |
| wisetoto 도메인 | `app/api/wisetoto/sync/route.ts:34-45` | `ALLOWED_ORIGINS` 에 프로덕션 도메인 하드코딩 — 도메인 변경 시 폴링 차단 | 없음 |
| betman 게임 슬립 | `lib/betman/game-fetcher.ts:32-39`, `:134-148` | `betTypId` 맵, 필수 컬럼 13개 (fail-closed ✅) | ✅ `__tests__/lib/betman/game-fetcher.test.ts` + 실 fixture |
| Cloudflare Stream | `app/api/upload/video/route.ts:33-34`, `:50` | direct_upload 응답 `data.result.uploadURL`/`.uid` | 없음 |
| OpenAI | `app/api/og/route.ts:235` (`gpt-4o-mini`), `app/api/cron/reddit-seed-posts/route.ts:20` (`gpt-4o`) | 모델명 하드코딩, `json_object` 응답 형식. reddit-seed 쪽은 **타임아웃 signal 없음** | 없음 |
| GA4 이벤트명 | `lib/analytics/events.ts` | 외부 GA4 대시보드/리포트가 이 이름에 묶여 있다 — 이름 변경 시 저장소 밖에서 깨짐 | 없음 |
| CSP 화이트리스트 | `next.config.mjs:12-23` | 운영 정책 + Report-Only 정책 **양쪽** 갱신 필요. 한쪽만 고치면 관측이 오염되거나 기능이 죽는다 | 없음 |
| PortOne | `lib/portone/constants.ts:22` | **`PORTONE_API_BASE` 에 호출자가 없다.** 실 결제 연동이 저장소에 없음(`app/api/payments/purchase/route.ts:20` 주석이 확인). 상수는 dead | ✅ (dead 상수를 테스트 중) |

---

# 4. 캐시 · ISR

## 4.1 개인화 GET 이 `public` 으로 캐시된다

**위험도: 상**

`next.config.mjs` 의 `headers()` 규칙은 **메서드 필터도, 인증 조건도 없다**(`has`/`missing` 미사용 — 확인함). 경로만 맞으면 개인화 응답에도 `public, s-maxage=…` 가 붙는다.

| 라우트 | 개인화 근거 | 적용되는 규칙 | 결과 |
|---|---|---|---|
| **`app/api/feed/predictions/route.ts`** GET | `:60` `currentUser()`, `:119` `.eq("buyer_id", user.id)`, `:381` `is_purchased` | `next.config.mjs:92-94` `public, s-maxage=15, swr=60` | **유료 분석글 잠금 해제 상태가 공개 캐시된다.** 구매자 응답이 비구매자에게 최대 15초(SWR 포함 75초) 서빙 가능 → 페이월 우회 + 팔로우 그래프 유출 |
| **`app/api/posts/my/route.ts`** GET | `:13` `currentUser()`, `.eq("user_id", userId)` | `next.config.mjs:85-87` `public, s-maxage=30, swr=120` | A 유저의 내 글 목록이 B 유저에게 서빙 가능 |
| `app/api/posts/hot-alerts/route.ts` | `follows` 쿼리 파라미터로 변동 | 같은 규칙 (라우트는 `:49`,`:74` 에서 `no-store` 를 원함) | 쿼리 파라미터가 캐시 키에 포함되므로 심각도는 낮음 |

**둘 다 자체 `Cache-Control` 을 설정하지 않는다** (grep 으로 확인 — 0건). 그래서 config 헤더가 그대로 나간다.

**config 헤더와 라우트 헤더가 충돌할 때 어느 쪽이 이기는지는 미확인** (빌드/런타임 확인 불가). 하지만 위 두 라우트는 **충돌 자체가 없다** — 라우트가 아무 헤더도 안 붙이므로 config 값이 확정적으로 적용된다.

**증상**: 재현이 극히 어렵다. "가끔 남의 글 목록이 보여요", "안 샀는데 분석글이 열려요" 같은 산발적 제보. 로그로는 안 잡힌다.

대조군(올바른 사례): `app/api/profile/me/route.ts:92` `private, max-age=30`, `app/api/comments/route.ts:48` `private, no-store`, `app/api/flair-prefs/route.ts:28` `private, no-store`. **이 셋은 config 규칙에 매치되지 않는 경로라서** 자체 헤더가 살아남았다.

**테스트**: **없음.** `__tests__/`, `e2e/`, `tests/` 전체에서 `Cache-Control|s-maxage|no-store|revalidat` grep 결과 0건.

---

## 4.2 config 캐시 규칙의 오타 — 매치되지 않는 경로

**위험도: 중**

| `next.config.mjs` 의 이름 | 실제 라우트 | 매치? |
|---|---|---|
| `communities` (`:85`) | `app/api/community/[slug]/...` (**단수**) | ❌ |
| `profiles` (`:85`) | `app/api/profile/me/route.ts` (**단수**) | ❌ |
| `ranking` (`:99`) | `app/api/rankings/route.ts` (**복수**) | ❌ (`ranking` 뒤에 `/` 리터럴이 필요) |
| `betman/games` (`:99`) | `app/api/betman/games/route.ts` | 그룹 안의 `/` 를 path-to-regexp 가 어떻게 컴파일하는지 **미확인** |

**그리고 리라이트 사각지대**: Next 의 `headers()` 는 **들어온 URL** 로 매치한다. 클라이언트가 실제로 요청하는 경로는 `/api/sports/games` (`hooks/use-betting-matches.ts:24`, `components/home/matchday-band.tsx:56`)이므로 **`betman/games` 규칙은 브라우저가 요청하지 않는 경로에 걸려 있다.** 실효 헤더는 `app/api/betman/games/route.ts:361` 의 인라인 `s-maxage=30` 뿐.

**증상**: "캐시 켰는데 왜 안 먹지" — 오리진 부하가 예상보다 높다. 성능 문제로만 보이고 원인이 오타라는 걸 모른다.

**리팩토링 함정**: 위 오타를 "고치면" 그 순간 §4.1 의 개인화 누출이 **더 넓어진다** (`/api/profile/me` 가 `public, s-maxage=30` 규칙에 들어옴 — 지금은 `private` 로 안전). **오타 수정 = 보안 변경**이다. 반드시 §4.1 을 먼저 해결한 뒤에 손댈 것.

**테스트**: **없음.**

---

## 4.3 `revalidatePath` 누락

**위험도: 중**

`revalidateTag` 는 저장소 전체에 **0건**. 태그 기반 무효화가 없다.

현재 호출 지점 (전부):

| 파일:라인 | 무효화 대상 |
|---|---|
| `app/api/posts/route.ts:374` (POST) | `/` |
| `app/api/posts/[id]/route.ts:148` (PATCH) | `/` |
| `app/api/posts/[id]/route.ts:192` (DELETE) | `/` |
| `app/api/posts/[id]/notice/route.ts:132` (PATCH, 조건부) | `/` |
| `app/api/admin/content/boards/route.ts:16-19` | `/explore`, `/`, `/community`(layout), `/community/${slug}` |
| `app/admin/event/actions.ts:32-33`, `:57-59` | `/admin/event`, `/worldcup/games`, `/worldcup` |

**누락 (ISR 페이지인데 해당 mutation 이 무효화하지 않음)**:

| ISR 페이지 | revalidate | 갱신되어야 할 mutation | 증상 |
|---|---|---|---|
| `app/community/[slug]/page.tsx:24` | 30초 | 글 작성/수정/삭제 (`app/api/posts/route.ts:374` 등이 `/` 만 무효화) | 자기 글이 자기 게시판에 최대 30초 안 보임. 삭제한 글이 30초 남아 있음 |
| `app/explore/page.tsx:6` | 60초 | 글 작성 (게시판별 글 수 집계, `:46-49`) | 탐색 페이지 글 수가 최대 60초 어긋남 |
| `app/page.tsx:10` | 300초 | 투표 `app/api/posts/[id]/vote/route.ts:15`, 댓글 `app/api/comments/route.ts:59`, 온도 cron `app/api/cron/update-temperatures/route.ts:16` | **정렬 기준(온도/투표수)이 최대 5분 낡음.** `components/home/home-client.tsx` 의 SWR 재조회가 이걸 가리고 있다 |
| `app/stadium/[teamId]/page.tsx:6` | 30초 | `app/api/stadiums/invest/route.ts:22` | `components/stadium/stadium-room.tsx:58` SWR 이 가림 |

**리팩토링 함정**: 홈/스타디움의 클라이언트 SWR 재조회를 "중복이니 제거" 하면 **가려져 있던 ISR 지연이 즉시 사용자에게 노출된다.** 투표했는데 5분간 반영 안 되는 화면이 된다.

**테스트**: **없음.**

---

## 4.4 `force-dynamic` × 캐시 헤더 모순

**위험도: 하**

- `app/api/feed/snack/route.ts:5` `force-dynamic` ↔ `next.config.mjs:92-94` `s-maxage=15` ↔ 라우트 자체 `:52` `s-maxage=30` — **세 값이 다르다**
- `app/api/feed/cardnews/route.ts:5` / `:16` — 동일 패턴

`force-dynamic` 은 Next 데이터 캐시만 끄고 **CDN 헤더는 그대로 나간다.** 오리진은 매 요청 재실행하는데 엣지는 15~30초 캐시한다. 의도가 상충한다.

페이지 레벨에는 모순이 없다 — `headers()` 가 `/sw.js` 와 `/api/*` 에만 `Cache-Control` 을 설정하고, `/(.*)` 규칙(`:39`)은 보안 헤더만 붙인다(확인함).

**ISR 페이지에 개인화 데이터가 섞인 사례는 발견하지 못했다.** ISR 5개 페이지는 전부 `createAnonClient()` 를 쓰고 `auth()`/`currentUser()`/`cookies()` 를 호출하지 않는다. 개인화는 전부 클라이언트 SWR 로 밀려 있다. (그래서 문제가 §4.1 의 API 레이어로 옮겨간 것이다.)

**테스트**: **없음.**

---

# 5. 데이터 계약

## 5.1 타입 파일이 아무 데서도 쓰이지 않는다

**위험도: 상** — 이 절의 나머지 모든 위험을 컴파일 타임에 못 잡게 만드는 근본 원인

`lib/supabase/types.ts` 와 `lib/supabase/database.types.ts` **둘 다 앱 코드에서 import 되지 않는다** (확인함 — 유일한 grep 매치는 `lib/draft/rooms.ts:14` 의 주석 한 줄).

- `lib/supabase/client.ts:17`, `lib/supabase/server.ts:16` — `createSupabaseClient(url, key)` 에 **제네릭 인자 없음**
- `SupabaseClient<Database>` / `createClient<Database>` 사용처 0건
- `lib/supabase/index.ts` 는 24번 줄 주석에서 끝나고 타입 re-export 가 없다
- `knip.json:33-34` 가 두 파일을 dead-code 검사에서 **명시적으로 제외** — 미사용임을 이미 인지한 상태

**결과: 모든 `.from()` / `.rpc()` 가 `any` 로 동작한다.** 컬럼 오타, RPC 이름 오타, 반환 키 불일치가 `tsc --noEmit` 을 통과한다.

### 두 파일의 stale 정도

| | `lib/supabase/types.ts` | `lib/supabase/database.types.ts` |
|---|---|---|
| 마지막 커밋 | `e04562d3` 2026-02-20 (5개월) | `909fe1d4` 2026-07-22 |
| 줄 수 | 2647 | 6453 |

`database.types.ts` 조차 2026-07-22 재생성 이후의 마이그레이션 5개를 반영하지 않는다 — `match_previews`, `embed_cache`, `agg_publish_queue` 는 **양쪽 파일 모두에 0건**.

**리팩토링 함정**: "타입을 켜자" 는 올바른 방향이지만, 제네릭을 붙이는 순간 **수백 개의 타입 에러가 한꺼번에 터진다** (스키마와 코드가 실제로 어긋난 지점 + stale 타입이 만든 가짜 에러가 섞여서). 점진적으로 켤 계획 없이 시작하면 되돌리기 어렵다.

**테스트**: **없음.** (`supabase gen types` 재생성 후 diff 가 비어야 한다는 CI 게이트도 없음.)

---

## 5.2 PostgREST 임베드 힌트 — `post_flairs!flair_id`

**위험도: 중** (프로덕션 경로는 이미 수정됨 / 잔존 1건)

`posts` 에서 `post_flairs` 로 가는 경로가 **2개**다:
- `supabase/migrations/00000000000001_prod_schema.sql:9434` — `posts.flair_id → post_flairs.id` (직접 FK)
- `supabase/migrations/20260722b_post_flair_map.sql:7-12` — `post_flair_map` 경유

→ 힌트 없는 `post_flairs(...)` 임베드는 PGRST200 (`more than one relationship found`) 으로 **500**.

| 파일:라인 | 임베드 | 상태 |
|---|---|---|
| `app/api/posts/route.ts:138` | `post_flairs!flair_id (...)` | ✅ 힌트 있음 |
| `app/community/[slug]/page.tsx:55` | `post_flairs!flair_id (...)` | ✅ |
| `lib/feed/cardnews.ts:53` | `post_flairs!flair_id (...)` | ✅ (`:52` 에 사고 이력 주석 — `f15c802a`) |
| **`app/design-preview/page.tsx:61`** | `post_flairs ( name )` — base 가 `posts`(`:59`), **힌트 없음** | 🔴 **잔존** |

`app/design-preview/page.tsx:58` 은 `error` 를 구조분해하지 않으므로 `rows` 가 `null` 이 되고 `:68` `rows ?? []` 로 흡수된다 → **에러 없이 빈 화면.**

### 환경별로 다르게 깨진다

`20260722b_post_flair_map.sql` 이 **적용된 환경에서만** 관계가 모호해진다. 로컬/스테이징에 이 마이그레이션이 없으면 힌트 없는 쿼리도 정상 동작한다. **로컬 테스트로는 절대 잡히지 않는 버그 클래스다.** (각 환경의 실제 적용 상태는 **미확인**.)

### 다음 지뢰 후보

`betman_predictions → betman_games` / `→ prediction_slips` 임베드 **8곳이 전부 힌트가 없다**. 현재는 FK 경로가 1개씩이라 안전하지만, 조인 테이블이 하나 추가되는 순간 **8곳이 동시에 500** 난다 — `post_flair_map` 과 정확히 같은 패턴:

`app/api/predictions/my/route.ts:90,97,118` · `app/api/feed/predictions/route.ts:137,140` · `app/api/predictions/purchase/route.ts:63,65` · `app/api/betman/prediction/route.ts:717`

### profiles 임베드

`posts.user_id`, `comments.user_id`, `prediction_slips.user_id` → `profiles` **FK 가 존재하지 않는다** (`prod_schema.sql:9109-9614` 확인). 따라서 `profiles!inner(...)` 임베드는 PGRST200 으로 실패한다.
현재는 전부 회피 처리돼 있다 — `lib/admin/attach-nicknames.ts:5-8,17` 이 별도 조회 + JS 병합으로 우회하고, `app/api/admin/content/comments/route.ts:26`, `app/admin/content/posts/page.tsx:12` 에 사유 주석이 있다.
**하지만 이건 주석으로만 유지되는 규약이다.** 타입 검사가 없으므로(§5.1) 신규 코드에서 재발하기 쉽다. (예외: `user_tokens.user_id → profiles.user_id` FK 는 존재 — `prod_schema.sql:9614`. `app/api/admin/tokens/balances/route.ts:24` 의 임베드는 정상.)

**테스트**: **없음.** `__tests__/api/posts.test.ts` 는 zod 스키마 복사본만 검증하고 `.select()` 문자열을 건드리지 않는다. 실제 HTTP 를 쏘는 `e2e/api-smoke.spec.ts` 만이 PGRST200 을 잡을 수 있는 유일한 테스트인데, `/design-preview` 커버 여부는 **미확인**.

---

## 5.3 타입에 없는 RPC 2건

**위험도: 중**

| RPC | 호출 위치 | 타입 파일 |
|---|---|---|
| `decrement_comment_count` | `app/api/comments/[id]/route.ts:128` (인자 `p_post_id`) | 양쪽 파일 모두 **0건** |
| `get_popular_communities` | `app/api/community/popular/route.ts:14` (인자 `lim: 3`) | 양쪽 파일 모두 **0건** |

**DB 에 실제로 존재하는지는 미확인.** `decrement_comment_count` 는 호출 후 에러를 확인하지 않으므로(`:128`), 함수가 없어도 **조용히 실패**한다 → 댓글 삭제 시 `posts.comment_count` 가 안 줄어든다. 사용자에게는 "댓글 3개" 라고 표시되는데 실제로는 1개인 화면.

(타입에는 이름이 비슷한 `increment_post_comment_count`, `recalculate_post_comment_count` 가 있다 — 혼동 주의.)

**나머지 RPC 36건은 이름·인자·반환 키가 타입과 일치한다** (확인함). 특히:
- `spend_tokens` → `remaining_balance` ✅ (`app/api/betman/prediction/route.ts:368,381`, `app/api/tokens/spend/route.ts:86,96,103`)
- `spend_gold` → `remaining` ✅ (`prod_schema.sql:3361` 이 `jsonb_build_object('success',true,'spent',…,'remaining',…)`)

단 `spend_gold` 의 **실패 경로**(`prod_schema.sql:3346`)는 `remaining` 을 반환하지 않는다 → `app/api/predictions/purchase/route.ts:130` 의 `gold_balance` 는 실패 시 항상 `undefined`.

**테스트**: RPC 이름+인자를 실제로 assert 하는 테스트는 **`__tests__/lib/betman/refund-tokens.test.ts:30` 단 하나**. 나머지는 전부 `rpc: vi.fn()` 으로 통째 목킹한다.

---

## 5.4 컬럼 실존 확인

**위험도: 중**

| 컬럼/테이블 | 상태 |
|---|---|
| `posts.latest_comment_at` | ✅ **재발 없음.** 코드 참조 0건. `prod_schema.sql:1646,1657,1662` 의 `latest_comment_at` 은 SQL 함수 내부 **CTE 별칭**이지 컬럼이 아니다. 실제 컬럼 `last_comment_at` 을 쓰는 곳은 전부 정상 (`app/page.tsx:93,96`, `app/community/[slug]/page.tsx:344,347`, `app/prediction/page.tsx:37,40`, `lib/temperature.ts:61,79,81`, `components/sidebar/activity-sidebar.tsx:34,43`). ⚠️ `comment_cooldowns.last_comment_at` (`prod_schema.sql:4047,4051`) 은 **동명의 다른 테이블 컬럼** — 혼동 주의 |
| `posts.view_count_unique` | 컬럼은 존재 (`prod_schema.sql:5427`), **앱 코드 참조 0건**. `record_unique_view` RPC(`prod_schema.sql:2781`)가 쓰기만 하는데 그 RPC 자체도 코드에서 호출되지 않는다 → 컬럼+RPC 세트가 통째로 유휴 |
| `posts.is_global_notice` | 마이그레이션 `20260627_post_global_notice.sql:4` 존재. **적용 여부 미확인.** 코드가 **비대칭 방어** 중: 읽기(`app/api/posts/[id]/notice/route.ts:25-28`)는 컬럼 없으면 에러를 삼키고 `false` 폴백, 쓰기(`:118-132`)는 방어 없이 UPDATE 시도 → **어드민이 전체공지를 켰다고 생각하는데 반영 안 되는 시나리오가 성립** |
| `user_flair_prefs` | 마이그레이션 `20260625_user_flair_prefs.sql:10-33` 존재. **적용 여부 미확인.** 미적용 시 `/api/flair-prefs` 전 엔드포인트가 42P01. 단 `app/api/posts/route.ts:158-163` 은 URL 파라미터로 필터링하므로 **피드 자체는 무사**, 즐겨찾기/뮤트 토글 UI 만 죽음 |
| `post_flair_map` | 마이그레이션 `20260722b_post_flair_map.sql` 존재. **적용 여부 미확인.** §5.2 참조 — 이게 적용돼야만 임베드가 깨진다 |
| `match_previews`, `embed_cache`, `agg_publish_queue` | 마이그레이션 존재, **양쪽 타입 파일에 0건**. 적용 여부 미확인 |

---

## 5.5 nullable 을 덮는 코드 — 돈/정산 경로

**위험도: 상** (§1.2 와 중복되지만 데이터 계약 관점에서 재정리)

| 파일:라인 | 패턴 | 왜 중요한가 |
|---|---|---|
| `lib/betman/settle.ts:85-91` | odds 를 `string` (non-nullable) 로 **선언** | DB 는 `numeric(5,2)` nullable (`prod_schema.sql:4644-4650`). 타입이 거짓말 |
| `lib/betman/settle.ts:126-132` | `parseFloat(game.X_odds) \|\| 0` | odds NULL → **적중 유저에게 `points_earned=0`**. 무음 |
| `lib/betman/settle.ts:134` | `oddsMap[pred.prediction] \|\| 0` | 알 수 없는 prediction 값 → 0 |
| `lib/betman/result-mapper.ts:78` | `homeScore + (handicap ?? 0)` | 핸디캡 게임인데 `handicap` NULL(`prod_schema.sql:4632` nullable) → **무핸디로 오판정** → 잘못된 승패 |
| `lib/betman/result-mapper.ts:85-86` | `const line = overUnderLine ?? 0; if (line === 0) return ""` | ✅ **여기는 방어됨.** line 이 0/NULL 이면 빈 결과를 반환하고 `settle.ts:186` 이 스킵한다. fail-safe |
| `app/api/betman/prediction/route.ts:274-278` | `parseFloat(String(x)) \|\| 0` | `String(null)` → `"null"` → NaN → 0. 현재는 `:280-288` 검증이 막고 있지만 검증과 누적이 같은 맵에 의존하는 게 유일한 방어 (§1.1) |
| `app/api/betman/community-stats/route.ts:199` | `Number(slip.total_odds) \|\| 1` | `total_odds` NULL/0 슬립을 **배당 1.0(원금 반환)** 으로 취급 → 커뮤니티 수익률이 실제보다 좋게 표시 |
| `app/api/betman/community-stats/route.ts:155` | `dayToSlips.get(d)!.push(sid)` | 검증되지 않은 non-null 단언 |
| `app/api/betman/my-stats/route.ts:44-63` | `parseFloat(x) \|\| 0` 다수 | `net_profit` NULL 을 0 으로 → **손실이 감춰짐** (표시 전용) |
| `app/api/betman/games/route.ts:401` | `Number(g.game_no) \|\| 0` | `game_no=0` 인 정상 경기와 NULL 이 구분 불가 |

**테스트**: nullable odds 정산 테스트 **없음** (`settle.test.ts:249` 는 `locked_odds` 가 NULL 일 때 **game odds 로 폴백**하는 경로만 테스트하고, game odds 자체가 NULL 인 경우는 없다).

---

# 6. 테스트 없이 손대면 안 되는 파일 목록

> 판정 기준: **① 돈 또는 권한이 걸려 있다** ② **깨져도 에러가 안 난다** ③ **회귀를 잡을 테스트가 없거나 무효다** — 셋 중 둘 이상.
> "테스트" 열의 ⚠️ 는 테스트 파일은 있지만 **프로덕션 코드를 import 하지 않는 복사본 테스트**라 회귀를 못 잡는 경우 (상세: `docs/refactor/test-gaps.md`).

| # | 파일 | 왜 위험한가 | 깨졌을 때 보이는 것 | 테스트 | 위험도 |
|---|---|---|---|---|---|
| 1 | `lib/betman/settle.ts` | 3개 정산 경로 공유. 멱등성이 `.eq("status","pending")` 5곳에만 의존. odds nullable → 0 지급 | 볼 중복 환불 / 적중인데 배당 0 / 슬립 영구 `pending` | ✅ 16케이스 (nullable·환불 미커버) | **상** |
| 2 | `app/api/betman/prediction/route.ts` | 볼 차감 후 3단계 비원자. 배당 검증과 `total_odds` 누적이 같은 맵에 의존 | 볼은 빠졌는데 슬립 없음 / 고아 슬립 / `total_odds=0` | ⚠️ 스키마 복사본만 | **상** |
| 3 | `app/api/predictions/purchase/route.ts` | 5단계 골드 흐름. **구매자 환불 실패가 큐에 안 남는다**(`:168-181`). 중복구매 체크 비원자 | 골드 빠졌는데 안 열림 + 어드민 화면에서 찾을 수 없음 | ⚠️ 부분 | **상** |
| 4 | `lib/supabase/server.ts` | `server-only` 가드 없음. `createServiceRoleClient` 가 클라이언트 번들로 샐 수 있는 유일한 관문 | 없음 — **전체 DB 가 공개된다** | ❌ | **상** |
| 5 | `app/admin/layout.tsx` | `/admin` 전체의 **유일한** role 게이트 (`admin-guard.ts:16-25` 는 로그인만 확인) | 없음 — 일반 유저가 회원목록·잔액을 본다 | ❌ (`requireAdmin` 테스트 자체 없음) | **상** |
| 6 | `next.config.mjs` (`headers()` `:83-117`) | 메서드/인증 조건 없음. `/api/feed/predictions`·`/api/posts/my` 가 `public` 캐시 | 산발적 "남의 데이터가 보여요" / 페이월 우회 | ❌ (전 저장소 0건) | **상** |
| 7 | `lib/betman/result-fetcher.ts` | `HANDI_VAL` 미지 코드를 `?? "일반"` 로 **조용히** 폴백 (`:90`,`:116`). game-fetcher 와 달리 fail-open | 없음 — **오정산** | ❌ | **상** |
| 8 | `scripts/vps-betman/*.sh` + 이들이 의존하는 `betman_*` 컬럼/unique 인덱스 | VPS 가 API 를 우회해 Supabase 에 직접 쓴다. 마이그레이션 변경이 Vercel 에 신호 0 | 경기 목록이 안 채워짐 → 베팅 불가. Vercel 로그 무흔적 | ❌ (bash, 저장소 밖) | **상** |
| 9 | `app/api/betman/settle/route.ts` | VPS 가 호출하는 유일한 라우트. 응답 키 `.settled/.correct/.wrong/.slips.won/.slips.lost` 를 `fetch-results.sh:314-318` 이 파싱 | VPS 로그/카운트가 조용히 깨짐 | ❌ | **상** |
| 10 | `lib/supabase/database.types.ts` + `lib/supabase/types.ts` | **둘 다 import 0건.** 스키마 드리프트를 컴파일 타임에 못 잡는 근본 원인 | 없음 — 다른 모든 항목의 조용한 실패를 가능하게 함 | ❌ (gen types diff CI 없음) | **상** |
| 11 | `supabase/migrations/` 의 경제 RPC (`spend_*`, `refund_*`, `reward_*` 15종) | 재정의 시 `20260718_revoke_economy_rpc_grants.sql` 의 REVOKE 재부착 필수 | 없음 — 브라우저에서 자기 계정에 무한 충전 | ❌ (SQL 권한, vitest 범위 밖) | **상** |
| 12 | `middleware.ts` + `lib/middleware/onboarding-guard.ts` | 순서 의존(`onboardingGuard` 가 통과 시에도 non-null 반환 → 체인 종료). `.single()` 에러가 catch 를 우회해 **24h 온보딩 스킵 쿠키**를 심음 (`:63-79`) | 순서 변경 시 adminGuard 무력화 / DB 지연 시 프로필 없는 유저 발생 | ⚠️ 복사본만, `adminGuard` 는 파일 자체 없음 | **상** |
| 13 | `app/api/admin/refunds/route.ts` (PATCH `:86-118`) | TOCTOU — 상태 확인과 UPDATE 사이 조건부 가드 없음 | 환불 볼 이중 지급, 추적 불가 | ❌ | 중 |
| 14 | `app/api/gold/reward/route.ts` | self-service 지급. 멱등 키가 클라이언트 문자열(`:76`), count 체크 비원자(`:61`) | 설명 안 되는 골드 증가 | ❌ | 중 |
| 15 | `app/api/admin/users/[userId]/adjust-economy/route.ts` | RPC 없이 read-modify-write (`:64`,`:101`) → lost update | 어드민 조정이 사라지거나 사용자 차감이 덮임 | ❌ | 중 |
| 16 | `app/api/cron/daily-token-reset/route.ts` (`:23`) | 페이지네이션 없는 전체 조회 → 상한 초과 사용자 리셋 누락 | 일부 사용자만 "볼이 안 채워져요" | ❌ | 중 |
| 17 | `app/api/wisetoto/sync/route.ts` (`:32-47`) | 위조 가능한 Origin 헤더로 service-role 쓰기 통과. 25초 쿨다운이 수용 근거 | 외부에서 스코어 임의 주입 | ❌ | 중 |
| 18 | `lib/metaverse/auth.ts` (`:26-32`) | `NODE_ENV` 하나에 걸린 헤더 기반 신원 → 경제 RPC `p_user_id` 로 직행 | 프리뷰/스테이징에서 타인 계정 골드 사용 | ⚠️ 커버 범위 미확인 | 중 |
| 19 | `app/api/discord/interactions/route.ts` | 길드 ID(`:17`) + 역할 ID 5개(`:20-26`) 하드코딩, `custom_id` prefix 규약(`:70`) | 버튼이 전부 "알 수 없는 요청" | ❌ | 중 |
| 20 | `app/api/feed/predictions/route.ts` · `app/api/posts/my/route.ts` | 자체 `Cache-Control` 없음 → config 규칙이 `public` 을 씌운다 (#6 의 구체 지점) | 교차 사용자 데이터 노출 | ❌ | **상** |
| 21 | `app/api/posts/route.ts` · `app/community/[slug]/page.tsx` · `lib/feed/cardnews.ts` 의 `post_flairs!flair_id` | 힌트 제거 시 PGRST200 → `/api/posts` 500. **로컬에서는 재현 안 됨**(마이그레이션 적용 환경에서만) | 피드 API 전체 500 | ⚠️ 복사본만 | 중 |
| 22 | `app/api/comments/[id]/route.ts:128` (`decrement_comment_count`) | 타입에 없는 RPC. 에러 미확인 → 조용히 실패 | 댓글 수 표시가 실제와 어긋남 | ❌ | 중 |
| 23 | `app/api/posts/[id]/notice/route.ts` | 읽기는 컬럼 부재를 삼키고(`:25-28`) 쓰기는 방어 없음(`:118-132`) — 비대칭 | 어드민이 전체공지를 켰는데 반영 안 됨 | ❌ | 중 |

## 착수 순서 권고

1. **#4, #5, #6/#20** — 코드 변경 없이 **가드/헤더만 추가**하면 되는 것들. 리팩토링 착수 전에 먼저 막을 것.
2. **#10** — 타입을 켜는 작업. 다만 점진 계획(파일 단위 opt-in) 없이 시작하지 말 것.
3. **#1, #2, #3** — 돈 경로. `test-gaps.md` 의 테스트를 먼저 깔고 나서 손댈 것.
4. **#8, #9** — VPS 계약. 손대기 전에 VPS 실제 파일과 `scripts/vps-betman/` 백업본의 diff 를 먼저 확인할 것(현재 **미확인**).

## 이 문서가 확인하지 못한 것 (후속 필요)

- 모든 마이그레이션의 **프로덕션 적용 여부** (`20260627_post_global_notice.sql`, `20260625_user_flair_prefs.sql`, `20260722b_post_flair_map.sql`, `20260530b_allow_odd_even_predictions.sql`)
- `decrement_comment_count`, `get_popular_communities` 의 **DB 실존 여부**
- 경제 RPC 15종의 **현재 EXECUTE 권한 상태**
- `prediction_purchases` 의 `(buyer_id, activity_id)` **unique 제약 존재 여부** (§1.3 중복구매 심각도가 여기서 갈린다)
- `user_tokens` **행 수** (§1.7 이 이미 터졌는지 여부)
- VPS `/opt/betman/*.sh` 실제 파일 ↔ `scripts/vps-betman/` 백업본 **일치 여부**
- `next.config.mjs` `headers()` 와 라우트 인라인 `Cache-Control` **충돌 시 승자** (빌드/런타임 확인 필요 — 이 세션에서는 빌드 금지)
- `e2e/error-states.spec.ts:35-36` 의 라우트 인터셉션이 실제로 매치되는지
- `app/api/betman/results/route.ts` 의 정산 경로 상세 (`settlePredictions` 호출 여부만 간접 확인)
