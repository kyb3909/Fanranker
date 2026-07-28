# 리팩토링 안전망 설계 — 테스트 갭 분석

작성일: 2026-07-28
측정: `pnpm test:coverage` 실제 실행 (65 files / 914 tests / 15.31s, 전부 통과)
범위: 리팩토링 착수 **전에** 깔아야 할 테스트만 다룬다. (위험 지도 = `risk-map.md`, 리팩토링 후보 = `candidates.md` 는 별도 문서)

---

## 0. 한 줄 요약

**914개 테스트 중 307개(33.6%)는 프로덕션 코드를 단 한 줄도 import 하지 않는다.**
테스트 파일 안에 로직을 복사해두고 그 복사본을 검증한다. 프로덕션 코드를 어떻게 바꾸든 이 307개는 초록색으로 남는다.
그리고 그 307개가 몰려 있는 곳이 하필 **돈(볼·골드 차감/환불/정산)과 인증(admin·onboarding·rate-limit 가드)** 이다.

---

## 1. 지금 커버되는 것과 안 되는 것

### 1-1. 실측 커버리지 (2026-07-28)

```
All files          |  15.88 % Stmts |  19.46 % Branch |  14.66 % Funcs |  15.38 % Lines
```

`vitest.config.ts` 에 설정된 임계값은 statements 25 / branches 22 / functions 22 / lines 25 다.
**즉 `pnpm test:coverage` 는 지금 exit 1 로 실패한다.**

```
ERROR: Coverage for lines (15.38%) does not meet global threshold (25%)
ERROR: Coverage for functions (14.66%) does not meet global threshold (22%)
ERROR: Coverage for statements (15.88%) does not meet global threshold (25%)
ERROR: Coverage for branches (19.46%) does not meet global threshold (22%)
```

이게 아무도 모르고 지나간 이유: `.github/workflows/ci.yml` 은 `pnpm test` 만 돌린다. `test:coverage` 는 CI에 없다.
→ **커버리지 게이트는 존재하지만 작동한 적이 없다.**

### 1-2. 측정 범위 자체가 좁다

`vitest.config.ts` coverage 설정:

```ts
include: ["lib/**/*.ts", "hooks/**/*.ts"]
exclude: ["lib/supabase/**", "lib/ga4/**", "lib/admin/**", "lib/analytics/**", "lib/api/**", "hooks/use-toast.ts"]
```

| 영역 | 계측 여부 | 비고 |
|---|---|---|
| `app/**` (API 라우트 60+ 개, 페이지 전부) | ❌ 계측 안 됨 | 돈 라우트 5종 전부 여기 |
| `components/**` | ❌ 계측 안 됨 | 실제 렌더 테스트 3파일 35케이스는 있는데 수치로 안 잡힘 |
| `middleware.ts` (루트) | ❌ 계측 안 됨 | 인증 체인 진입점 |
| `lib/admin/**` | ❌ **명시적 exclude** | `requireAdminApi` — 39개 admin 라우트가 의존 |
| `lib/supabase/**` | ❌ 명시적 exclude | Clerk JWT → RLS 클라이언트 생성 |
| `lib/api/**` | — | **디렉토리가 존재하지 않음.** 스테일 exclude |

즉 15.88% 라는 숫자조차 `lib/` + `hooks/` 만의 숫자다. 앱 전체 기준으로는 이보다 한참 낮다.

### 1-3. 폴더별 실측

| 폴더 | Stmts | 실상 |
|---|---:|---|
| `hooks/` (35 파일) | **0.00%** | 파일 하나도 안 걸림 |
| `lib/` (루트) | 58.94% | |
| `lib/betman/` | 40.63% | settle 40.35 / stats 10.41 / http-client 23.8 / result-fetcher·settle-sweep·sync-state 0 |
| `lib/middleware/` | **0.00%** | admin-guard / onboarding-guard / rate-limit-guard 전부 0 |
| `lib/draft/` | 20.90% | engine.ts 96.39 ↔ multi-engine.ts 0 / rooms.ts 0 |
| `lib/metaverse/` | 65.97% | auth·constants·karma 100 ↔ realtime/·scenes/·avatar/ 전부 0 |
| `lib/tiptap/` | 87.44% | 단, `lib/tiptap/extensions/` 는 1.62% |
| `lib/utils/` | 85.88% | 여기는 진짜로 건강함 |
| `lib/stadium/` | 15.49% | map-utils 100 ↔ team-matcher 4 / contribution-sync 10.81 |
| `lib/standings/` | 39.65% | column-map 100 ↔ naver-leagues 0 |
| `lib/worldcup/`, `lib/agg/`, `lib/feed/`, `lib/transfer/`, `lib/comments/`, `lib/news/`, `lib/cron/`, `lib/youtube/` | **0.00%** | 테스트 없음 |

### 1-4. 숫자가 높은데 실은 안전하지 않은 영역 ⚠️

리팩토링 안전망 관점에서 가장 위험한 건 0%가 아니라 **"초록색인데 아무것도 안 지키는" 영역**이다.

#### (a) 미러 테스트 — 프로덕션 import 0 (20 파일 / 307 케이스)

테스트 파일 상단에 이런 주석이 달려 있다:

```ts
// ============================================================
// Schema extracted from app/api/tokens/spend/route.ts
// ============================================================
const TokenSpendSchema = z.object({ ... })   // ← 라우트의 스키마를 복사
```

```ts
// Pure re-implementations of the deduplication logic from use-feed.ts
// (mirrored here so we test the algorithm without requiring React context)
```

검증한 건 프로덕션 코드가 아니라 **테스트 파일 안의 복사본**이다. 리팩토링으로 원본이 바뀌거나 삭제돼도 테스트는 통과한다. 그리고 복사본과 원본이 이미 갈라져 있는지 확인할 방법조차 없다.

| 파일 | 케이스 수 | 대상 프로덕션 파일 |
|---|---:|---|
| `__tests__/api/betman-prediction.test.ts` | 43 | `app/api/betman/prediction/route.ts` (738줄) |
| `__tests__/hooks/use-betting-slip.test.ts` | 45 | `hooks/use-betting-slip.ts` (308줄) |
| `__tests__/hooks/use-post-card-actions.test.ts` | 23 | `hooks/use-post-card-actions.ts` |
| `__tests__/hooks/use-worldcup.test.ts` | 23 | `hooks/use-worldcup.ts` |
| `__tests__/api/posts.test.ts` | 20 | `app/api/posts/route.ts` |
| `__tests__/api/predictions-purchase.test.ts` | 16 | `app/api/predictions/purchase/route.ts` |
| `__tests__/hooks/use-feed.test.ts` | 16 | `hooks/use-feed.ts` |
| `__tests__/api/battles-worldcup-vote.test.ts` | 13 | `app/api/battles/...` |
| `__tests__/api/tokens-spend.test.ts` | 12 | `app/api/tokens/spend/route.ts` |
| `__tests__/api/comments.test.ts` | 12 | `app/api/comments/route.ts` |
| `__tests__/api/predictions-settle.test.ts` | 11 | `app/api/predictions/settle/route.ts` |
| `__tests__/api/payments-purchase.test.ts` | 10 | `app/api/payments/purchase/route.ts` |
| `__tests__/lib/ensure-profile.test.ts` | 10 | `lib/ensure-profile` 계열 |
| `__tests__/lib/middleware/onboarding-guard.test.ts` | 9 | `lib/middleware/onboarding-guard.ts` |
| `__tests__/lib/middleware/rate-limit-guard.test.ts` | 9 | `lib/middleware/rate-limit-guard.ts` |
| `__tests__/api/notifications.test.ts` | 9 | `app/api/notifications/route.ts` |
| `__tests__/api/admin-role-change.test.ts` | 8 | `app/api/admin/users/[userId]/role/route.ts` |
| `__tests__/api/battles-rooms.regression-1.test.ts` | 7 | `app/api/battles/rooms/...` |
| `__tests__/api/users-block.test.ts` | 6 | `app/api/users/.../block` |
| `__tests__/api/betman-unknown-games.test.ts` | 5 | `app/api/betman/...` |
| **합계** | **307** | |

`__tests__/api/` 13개 파일 **전부**, `__tests__/hooks/` 4개 파일 **전부**가 여기 속한다.

> 참고: `__tests__/lib/cron-auth.test.ts` 와 `__tests__/lib/rate-limit.test.ts` 는 미러 함수 + `await import("@/lib/...")` 를 **섞어** 쓴다. 반쯤만 진짜다.

#### (b) `lib/draft/engine.ts` 96.39% (78 케이스) — 그런데 실제 런타임은 다른 파일

`engine.ts` 에 78개 케이스가 몰려 있어 폴더 평균을 끌어올리지만, 실제 멀티 드래프트 게임은 `lib/draft/multi-engine.ts`(583줄, **0%**) 와 `lib/draft/rooms.ts`(464줄, **0%**) 가 돌린다. `engine.ts` 는 상수(FORMATIONS)·타입·좌석 계산 헬퍼로 컴포넌트가 참조하는 쪽에 가깝다.
→ 테스트가 많은 쪽과 리스크가 큰 쪽이 어긋나 있다.

#### (c) `lib/betman/settle.ts` 40.35% — 15개 테스트가 전부 "1단계"만 본다

`settle.test.ts` 는 진짜로 `@/lib/betman/settle` 를 import 하는 좋은 테스트다. 그런데 15개 케이스가 전부 **개별 예측 정산(1단계)** 만 검증한다: 적중/미적중/취소/배당 선택/에러 누적.

미커버 구간이 `223-428, 435-441` 인데, **거기가 슬립 단위 정산 = 실제 돈이 나가는 자리**다:
- 전원 적중 → payout 계산 + 지급
- 전부 취소 → `retryRefund` 로 stake 전액 환불
- 이미 정산된 슬립 재호출 방지(이중 지급 가드)
- `settlement_result` 알림 발송
- audit row 기록

즉 "정산 로직 40% 커버"는 **지급/환불이 0% 커버**라는 뜻이다.

#### (d) `lib/metaverse/` 65.97% — 폴더 평균의 착시

`auth.ts` / `constants.ts` / `karma-award.ts` 가 100%라 평균이 66%로 보이지만, `realtime/` 5파일·`scenes/` 8파일·`avatar/` 5파일은 전부 0%다. 폴더 숫자로 판단하면 안 되는 대표 사례.

#### (e) `components/` 3파일 35케이스 — 진짜인데 안 보인다

`betting-match-card.test.tsx`(13), `prediction-activity-card.test.tsx`(17), `share-menu.test.tsx`(5) 는 실제 컴포넌트를 `@testing-library/react` 로 렌더하는 **제대로 된 행동 테스트**다. "배당 숫자를 카드에 노출하지 않는다(정책)" 같은 계약도 검증한다. 그런데 coverage include 밖이라 수치에 안 잡히고, 그래서 자산으로 인식되지 않고 있다.

---

## 2. 돈·인증 경로 테스트 실태

### 2-1. 돈 (볼/골드 차감 · 환불 · 정산)

| 경로 | 프로덕션 파일 | 줄수 | 테스트 파일 | 실제 검증? | 커버리지 |
|---|---|---:|---|---|---:|
| 볼 차감 — 베팅 제출 | `app/api/betman/prediction/route.ts` | 738 | `__tests__/api/betman-prediction.test.ts` (43) | ❌ 미러 | 계측 밖 |
| 볼 차감 — 범용 | `app/api/tokens/spend/route.ts` | 109 | `__tests__/api/tokens-spend.test.ts` (12) | ❌ 미러 | 계측 밖 |
| 볼 차감 — 상품 구매 | `app/api/payments/purchase/route.ts` | 223 | `__tests__/api/payments-purchase.test.ts` (10) | ❌ 미러 | 계측 밖 |
| 골드 차감 — 예측 열람 | `app/api/predictions/purchase/route.ts` | 234 | `__tests__/api/predictions-purchase.test.ts` (16) | ❌ 미러 | 계측 밖 |
| 정산 트리거 API | `app/api/predictions/settle/route.ts` | 190 | `__tests__/api/predictions-settle.test.ts` (11) | ❌ 미러 | 계측 밖 |
| **정산 엔진 (1단계: 개별 예측)** | `lib/betman/settle.ts` | 459 | `__tests__/lib/betman/settle.test.ts` (15) | ✅ 진짜 | 40.35% |
| **정산 엔진 (2단계: 슬립 지급/환불)** | `lib/betman/settle.ts` L223–428 | — | — | ❌ **없음** | 0% |
| 미정산 스윕 cron | `lib/betman/settle-sweep.ts` | 110 | — | ❌ 없음 | **0%** |
| 환불 재시도 래퍼 | `lib/betman/refund-tokens.ts` | 46 | `__tests__/lib/betman/refund-tokens.test.ts` (5) | ✅ 진짜 | **100%** |
| 판매자 보상 재시도 | `lib/predictions/retry-seller-reward.ts` | — | `__tests__/lib/predictions/retry-seller-reward.test.ts` (8) | ✅ 진짜 | **100%** |
| 포인트 적립 | `lib/points.ts` | 58 | `__tests__/lib/points.test.ts` (13) | ✅ 진짜 | **100%** |
| 카르마 지급 | `lib/metaverse/karma-award.ts` | — | `__tests__/lib/metaverse/karma-award.test.ts` (6) | ✅ 진짜 | **100%** |
| 유저 승률/수익 통계 반영 | `lib/betman/stats.ts` | — | `__tests__/lib/betman/stats.test.ts` (12) | ✅ 진짜 | 10.41% |
| 관리자 환불 | `app/api/admin/refunds/route.ts` | 140 | — | ❌ **없음** | 계측 밖 |
| 관리자 경제 조정 | `app/api/admin/users/[userId]/adjust-economy/route.ts` | 144 | — | ❌ **없음** | 계측 밖 |
| 월드컵 점수 산출 | `lib/worldcup/scoring.ts` | 46 | — | ❌ 없음 | **0%** |
| 베팅 슬립 상태(클라) | `hooks/use-betting-slip.ts` | 308 | `__tests__/hooks/use-betting-slip.test.ts` (45) | ❌ 미러 | **0%** |

**요약: 돈이 실제로 움직이는 5개 API 라우트(1,494줄)에 대한 진짜 테스트는 0개다.**
그 라우트들을 겨냥한 92개 케이스는 전부 라우트를 import하지 않는다.
살아 있는 안전망은 `refund-tokens` / `retry-seller-reward` / `points` / `karma-award` 네 개의 **작은 래퍼**뿐이고, 정작 지급·환불의 본체인 `settle.ts` 슬립 단계는 비어 있다.

### 2-2. 인증 / 권한 분기 (Clerk → RLS)

| 경로 | 프로덕션 파일 | 줄수 | 테스트 | 실제 검증? | 커버리지 |
|---|---|---:|---|---|---:|
| 미들웨어 체인 + fail-closed 예외 처리 | `middleware.ts` | 47 | — | ❌ **없음** | 계측 밖 |
| admin 페이지 가드 (open-redirect 방어 포함) | `lib/middleware/admin-guard.ts` | 28 | — | ❌ **없음** | **0%** |
| 온보딩 리다이렉트 | `lib/middleware/onboarding-guard.ts` | 84 | `onboarding-guard.test.ts` (9) | ❌ 미러 | **0%** |
| API rate-limit 가드 | `lib/middleware/rate-limit-guard.ts` | 55 | `rate-limit-guard.test.ts` (9) | ❌ 미러 | **0%** |
| **admin API 권한 게이트 (39개 라우트 의존)** | `lib/admin/require-admin-api.ts` | 36 | — | ❌ **없음** | **exclude됨** |
| admin 역할 변경 | `app/api/admin/users/[userId]/role/route.ts` | 59 | `admin-role-change.test.ts` (8) | ❌ 미러 | 계측 밖 |
| Clerk JWT → Supabase RLS 클라이언트 | `lib/supabase/server.ts` · `admin.ts` | — | — | ❌ 없음 | **exclude됨** |
| rate-limit 코어 | `lib/rate-limit.ts` | — | `rate-limit.test.ts` | ✅ 진짜 | 80% |
| cron 시크릿 검증 | `lib/cron-auth.ts` | — | `cron-auth.test.ts` | 🟡 반반 | 78.57% |
| 정지 계정 차단 | `lib/check-suspension.ts` | — | `security.test.ts` 안 | ✅ 진짜 | **100%** |
| 사용자 차단 | `app/api/users/.../block` | — | `users-block.test.ts` (6) | ❌ 미러 | 계측 밖 |

**요약: 인증 체인 전체(`middleware.ts` + 가드 3종 + `requireAdminApi`)에 진짜 테스트가 0개다.**
특히 `requireAdminApi` 는 39개 admin 라우트의 단일 관문인데 coverage에서 **명시적으로 exclude** 되어 있어 갭이 숫자로도 안 드러난다.
`middleware.ts` 의 fail-closed 로직(가드가 예외를 던졌을 때 `/admin`·`/api/admin` 만 막고 나머지는 통과)은 주석으로만 존재하는 계약이다. 리팩토링 중 try/catch 하나 옮기면 조용히 fail-open 이 된다.

---

## 3. 리팩토링 안전망 — 무엇부터 쓸 것인가

원칙: **행동(입력→관측 가능한 출력)을 고정하고, 구현 세부는 건드리지 않는다.**
"내부 함수를 몇 번 호출했나"가 아니라 "401이 나오나 / 볼이 정확히 얼마 빠지나 / 두 번 호출해도 한 번만 지급하나"를 잠근다.

---

### P1. 볼 차감 진입점 — `app/api/betman/prediction/route.ts` POST 통합 테스트

- **대상**: `app/api/betman/prediction/route.ts` (738줄, POST L41–578)
- **종류**: **통합 테스트** (Vitest, route handler 직접 import)
- **왜 이 종류인가**: 이 라우트의 위험은 계산식이 아니라 **순서와 분기**다 — 인증 → 마감 검증 → 중복 검증 → `spend_tokens` → 슬립 INSERT → 예측 INSERT. 순수 함수로 뽑아 유닛으로 만들면 딱 그 순서가 검증 밖으로 빠진다(지금 미러 테스트 43개가 정확히 그 상태). Playwright e2e 로 가면 실제 경기 데이터가 있는 날에만 돌아가서 리팩토링 루프에 못 쓴다. `@clerk/nextjs/server` 의 `auth` 와 `@/lib/supabase/server` 만 `vi.mock` 하고 `new Request(...)` → `POST(req)` → `Response` 를 검사하는 통합 테스트가 유일한 현실적 지점.
- **검증할 행동**:
  1. 비로그인 → 401, `spend_tokens` **호출 없음**
  2. 잔액 부족(RPC `success:false`) → 400 + 슬립/예측 row **미생성**
  3. 이미 예측한 경기 재제출 → 409 (23505 500 회귀 방지 — 기존 사고 이력 있음)
  4. 마감된/결과 있는 경기 → 거부
  5. 성공 → `spend_tokens` 가 **정확히 1회**, `p_amount === stake`
  6. 슬립 INSERT 실패 → 환불 경로 진입 (볼이 증발하지 않음)
  7. 응답 body에 `slip_id` 와 차감 후 잔액 키가 존재 (클라 계약)
  8. `locked_odds` 가 제출 시점 배당으로 고정되어 저장됨
- **비용**: 12~16 케이스 / **난이도 중**. supabase 체이닝 목 팩토리 1개를 새로 만들어야 하는데, `__tests__/lib/betman/settle.test.ts` 의 목 패턴을 그대로 확장하면 된다(그게 이미 `from().update().eq().select()` 체인을 흉내낸다). 이 팩토리는 P5에서 재사용된다.

---

### P2. 정산 엔진 슬립 단계 — `lib/betman/settle.ts` L223–441

- **대상**: `lib/betman/settle.ts` 의 2단계(슬립 단위 정산) + `retryRefund`
- **종류**: **유닛 테스트** (기존 `settle.test.ts` 확장)
- **왜 이 종류인가**: `settlePredictions` 는 이미 `supabase` 를 인자로 받는 순수한 형태라 목 주입이 자연스럽다. 이미 진짜 테스트가 있는 파일이므로 **한계 비용이 가장 싸다** — 목 팩토리·타입·픽스처가 이미 그 파일에 있다. 지급/환불은 e2e로 재현하려면 실제 경기 결과가 필요해서 유닛이 유일하게 반복 가능한 선택.
- **검증할 행동**:
  1. 슬립 내 예측이 하나라도 `pending` → 슬립 미정산 (조기 확정 금지)
  2. 전원 적중 → `status: won`, payout = `stake × Π(locked_odds)` (배당 소스가 `locked_odds` 인지 game odds인지 **행동으로** 고정)
  3. 하나라도 미적중 → `lost`, payout 0
  4. 전부 취소 → `cancelled` + `refund_tokens` 로 **stake 전액 1회** 환불
  5. 부분 취소 + 나머지 적중 → 취소 건이 배당에서 제외/1.0 처리되는지
  6. **이미 정산된 슬립 재호출 → 지급/환불 0회** (`.eq("status","pending")` 가드가 살아 있는지 = 이중 지급 방지)
  7. `refund_tokens` 실패 → `pending_refunds` 기록 + `result.errors` 누적, 예외로 전체 배치 중단 안 됨
  8. 확정 시 `settlement_result` 알림 row 1건 생성 (metadata에 `is_correct`, `points_earned`)
  9. audit row (`settle_slip`) 가 before/after 상태를 담아 기록됨
- **비용**: 10~14 케이스 / **난이도 중하**. 기존 파일 확장이라 셋업 비용 거의 0. 목표 커버리지 40% → 85%.

---

### P3. 인증/권한 계약 테스트 — 미들웨어 체인 + `requireAdminApi`

- **대상**: `middleware.ts`, `lib/middleware/{admin,onboarding,rate-limit}-guard.ts`, `lib/admin/require-admin-api.ts`
- **종류**: **유닛 테스트** (가드는 이미 `auth` 를 인자로 받는 DI 형태 → 목 주입 쉬움) + `requireAdminApi` 는 **통합**(Clerk `auth` + supabase 목)
- **왜 이 종류인가**: 권한 분기는 "어떤 입력에서 통과/차단되는가"가 전부라 유닛이 정확히 맞는 도구다. e2e로는 admin 계정이 필요하고(이미 `tests/e2e/journeys/admin/` 이 있지만 느리고 봇 팩토리 의존), 리팩토링 루프에서 초 단위로 못 돈다. 무엇보다 지금 미러 테스트 18개가 "테스트 있음" 착시를 만들고 있어서 **교체가 시급**하다.
- **검증할 행동**:
  1. `adminGuard`: 비로그인 + `/admin/x?y=1` → `/sign-up?redirect_url=/admin/x?y=1` 로 리다이렉트
  2. `adminGuard`: **open redirect 방어** — `redirect_url` 이 `/admin` 으로 시작하지 않으면 `/admin` 으로 대체 (주석에만 있는 계약)
  3. `adminGuard`: `/api/admin/...` 은 통과시킴(각 API가 자체 검증) — 이 위임 계약이 깨지면 admin API가 무방비
  4. `middleware.ts`: 가드가 throw 했을 때 → `/admin` 은 `/` 리다이렉트, `/api/admin` 은 **503**, 그 외는 `NextResponse.next()` (**fail-closed 계약**)
  5. `middleware.ts`: 실행 순서 = rate-limit → admin → onboarding, 앞 단계가 응답을 반환하면 뒤 단계 **미실행**
  6. `requireAdminApi`: 비로그인 → 401 / `role !== "admin"` → 403 / admin → `{ userId, supabase }` 반환
  7. `requireAdminApi`: `profiles` 조회가 실패(null)해도 **통과하지 않음**
  8. `onboardingGuard`: 온보딩 미완료 유저가 `/onboarding` 자체에 접근할 때 무한 리다이렉트 없음
- **비용**: 16~20 케이스 / **난이도 하**. 가드 3종은 순수 함수에 가깝고 `NextRequest`/`NextResponse` 만 다루면 된다. 미러 테스트 2개 파일(18케이스)은 이걸로 **교체 삭제**.
- **부수 작업**: `vitest.config.ts` coverage exclude 에서 `lib/admin/**` 제거, `include` 에 `middleware.ts` 추가.

---

### P4. 미러 훅 테스트 4종 → 실제 훅 테스트로 전환

- **대상**: `hooks/use-betting-slip.ts`(308줄), `use-feed.ts`(241줄), `use-post-card-actions.ts`, `use-worldcup.ts`
- **종류**: **유닛 테스트** (`renderHook` from `@testing-library/react`)
- **왜 이 종류인가**: 이 훅들은 이미 `jsdom` 환경이 세팅돼 있고 `@testing-library/react` 가 설치돼 있다(컴포넌트 테스트 3개가 쓰는 중). 미러 테스트 107케이스가 검증하는 로직(총배당 계산, 예상 수익, 선택 토글, 중복 제거, 낙관적 투표)은 **훅 반환값으로 그대로 관측 가능**하다 — 즉 미러를 지우고 `renderHook` 으로 감싸는 것만으로 같은 어서션이 진짜가 된다.
- **검증할 행동** (`use-betting-slip` 기준):
  1. 베팅 선택 → `totalOdds` 가 선택 배당의 곱
  2. `expectedReturn = floor(betAmount × totalOdds)`
  3. 같은 경기에 다른 선택 → **교체**(중복 추가 아님)
  4. 같은 선택 재클릭 → 해제
  5. 종목이 다른 경기 추가 시도 → 거부 (단일 종목 슬립 규칙)
  6. 슬립 비우기 → 배당 1, 수익 0
  7. (`use-feed`) 동일 id / 동일 제목 중복 글 제거 — 페이지네이션 경계에서
- **비용**: 기존 107케이스를 **재작성이 아니라 래핑**. 실제 신규 작성은 30~40케이스 수준 / **난이도 중**. SWR·fetch 목이 필요한 훅(`use-feed`)이 조금 번거롭다. 우선순위는 `use-betting-slip` > 나머지 3개.

---

### P5. 나머지 돈 라우트 3종 통합 테스트

- **대상**: `app/api/tokens/spend/route.ts`, `app/api/payments/purchase/route.ts`, `app/api/predictions/purchase/route.ts`
- **종류**: **통합 테스트** (P1과 동일 패턴, 목 팩토리 재사용)
- **왜 이 종류인가**: P1에서 만든 하네스를 그대로 재사용하므로 한계 비용이 가장 낮은 구간. 각 라우트는 "RPC 성공/실패 → 후속 INSERT → 실패 시 환불" 이라는 **동일한 3단 패턴**을 갖는다. 그 패턴이 리팩토링 과정에서 공통 헬퍼로 추출될 가능성이 높은데(= candidates.md 후보), 추출 전에 3개 각각의 행동을 잠가둬야 한다.
- **검증할 행동**:
  1. `tokens/spend`: `idempotency_key` 중복 → **차감 없이** 기존 트랜잭션 반환 (멱등 계약)
  2. `tokens/spend`: `amount` 0/음수/소수 → 400 + RPC 미호출
  3. `predictions/purchase`: 이미 구매한 activity → `already_purchased: true`, `spend_gold` **미호출**
  4. `predictions/purchase`: `spend_gold` 성공 후 `prediction_purchases` INSERT 실패 → **골드 환불 시도** (증발 방지)
  5. `predictions/purchase`: 판매자 보상 지급 실패해도 구매자 응답은 성공 (보상은 retry 큐로)
  6. `payments/purchase`: 잔액 부족 → 400 + 상품 미지급
  7. 3개 모두: RPC 반환 키 계약 — `spend_tokens` 는 `remaining_balance`, `spend_gold` 는 `remaining` (과거 실제 버그 지점)
- **비용**: 18~22 케이스 / **난이도 중하** (P1 이후 기준).

---

### P6. 미정산 스윕 + 관리자 경제 조작

- **대상**: `lib/betman/settle-sweep.ts`(110줄, 0%), `app/api/admin/refunds/route.ts`(140줄), `app/api/admin/users/[userId]/adjust-economy/route.ts`(144줄)
- **종류**: 유닛(sweep) + 통합(admin 라우트 2종)
- **왜**: 15분 cron 안전망이자 "고아 pending" 사고의 재발 방지선인데 테스트가 0이다. admin 경제 조정은 **임의 금액을 직접 쓰는 유일한 경로**라 권한 실수의 폭발 반경이 가장 크다.
- **검증할 행동**: sweep이 정산 대상만 골라내는지(이미 settled 재처리 안 함), admin 라우트가 비-admin에 403 + 금액 검증(음수/과대) + audit 기록.
- **비용**: 10~12 케이스 / 난이도 중.

---

### P7. 커버리지 게이트 정상화 (테스트가 아니라 배관)

- `vitest.config.ts`:
  - `include` 에 `app/**/*.ts`, `components/**/*.tsx`, `middleware.ts` 추가
  - `exclude` 에서 `lib/admin/**` 제거, 존재하지 않는 `lib/api/**` 제거
  - thresholds 를 **현재 실측치 + 1%p** 로 낮춰 일단 초록으로 만든 뒤, P1~P5 진행에 맞춰 래칫(올리기만) 방식으로 상향
- `.github/workflows/ci.yml`: `pnpm test` → `pnpm test:coverage` 로 교체
- 이유: 지금은 임계값이 실패 상태로 방치돼 있어 **아무 신호도 주지 못한다.** 리팩토링 중 커버리지가 떨어져도 알 수 없다. 초록에서 시작해서 떨어지면 빨개지는 상태로 만드는 게 목적이지, 숫자 자체가 목적이 아니다.

---

## 4. 테스트로 못 잡는 것 (정직하게)

| # | 못 잡는 것 | 왜 못 잡나 | 대안 방어 |
|---|---|---|---|
| 1 | **RPC 내부 로직** — `spend_tokens` / `spend_gold` / `refund_tokens` / `award_points` 의 원자성·잔액 검증·반환 키 | PL/pgSQL 이라 Vitest 밖. 목은 "우리가 정의한 반환값"만 돌려준다 | `tests/e2e/.env.e2e` 의 **로컬 Supabase** 를 이미 갖고 있다 → pgTAP 또는 `tests/e2e` 에 RPC 직접 호출 스펙 1개. 최소한 마이그레이션 리뷰 체크리스트에 "함수 재정의 시 `REVOKE ... FROM anon` 재첨부" 항목 고정 (과거 실제 사고) |
| 2 | **RLS 정책** — Clerk JWT 로 남의 슬립/프로필에 접근 가능한가 | 모든 유닛/통합 테스트가 service-role 또는 목을 쓴다. RLS는 목에 존재하지 않는다 | `tests/e2e/journeys/member/` 에 "봇 A가 봇 B의 리소스 접근 시도 → 403/빈 결과" journey 1개. 봇 팩토리가 이미 있으니 추가 인프라 불필요 |
| 3 | **동시성 / 이중 차감** — 같은 유저가 동시에 두 번 베팅 | 단일 스레드 테스트로 재현 불가 | DB `unique(user_id, game_id)` 제약과 `idempotency_key` 를 **계약으로 문서화**하고, 마이그레이션에서 제약 삭제 시 리뷰 차단. 리팩토링 후 1회 부하 스크립트로 확인 |
| 4 | **`next.config.mjs`** — 캐시 헤더 정책, `/storage`·`/api/sports` 리라이트, CSP 이중 정책, `remotePatterns` | 빌드 산출물/엣지 레벨. 유닛 테스트 대상이 아니고, 이 문서 제약상 빌드 실행도 불가 | audit 하네스가 응답을 이미 관측 중 → **헤더 스냅샷 비교**를 audit 이벤트에 추가하거나, 배포 후 `curl -I` 체크리스트. 특히 리라이트가 깨지면 betman/wisetoto 출처가 외부에 노출되는 보안 사고라 수동 확인 필수 |
| 5 | **Phaser 4 씬** (`lib/metaverse/scenes/` 8파일, `lib/stadium/game/`) | jsdom 에 WebGL/Canvas 없음. 렌더 테스트 자체가 성립 안 함 | **리팩토링 범위에서 제외**(`/freeze` 또는 명시적 out-of-scope). 손대야 한다면 별도 브랜치 + 수동 스모크 체크리스트(`docs/MANUAL_QA_CHECKLIST_*.md` 패턴 재사용) |
| 6 | **Supabase Realtime** (presence/broadcast, `lib/metaverse/realtime/` 5파일) | 서버-클라이언트 실시간 왕복. 목으로 만들면 목을 테스트하게 됨 | 피처 플래그 + 단계적 롤아웃. 메타버스는 이미 GNB에서 숨겨져 있어 직접 URL 접근만 가능 → **롤백 반경이 작다**는 걸 활용, 리팩토링을 마지막 단계로 미룸 |
| 7 | **외부 API 계약 변화** — betman·wisetoto·Naver 응답 스키마 | 우리 코드가 아니다. 픽스처는 찍은 시점의 스냅샷일 뿐 | 이미 `/api/cron/ops-monitor` + Discord 알림이 있음. 픽스처(`__tests__/lib/betman/__fixtures__/`) 갱신 주기를 리팩토링 착수 시점에 1회 |
| 8 | **Vultr cron 스크립트** (`/opt/betman/*.sh`) | git 밖의 VPS 파일 | 리팩토링 범위 밖임을 명시. `lib/betman` 의 함수 시그니처를 바꾸면 VPS 스크립트가 깨질 수 있으므로, **시그니처 변경 시 VPS 동기화 체크리스트** 필요 |
| 9 | **시각적 회귀 / 레이아웃 / CLS** | 어서션으로 표현이 안 됨 | audit 스크린샷 + `pnpm audit:cwv` (아래 5장) |
| 10 | **성능 회귀** (번들 크기, LCP) | 유닛 테스트 무관 | `pnpm audit:cwv` before/after + `ANALYZE=true` 번들 비교 |

**공통 대안 원칙**: 위 항목들은 "테스트를 더 쓴다"로 해결되지 않는다.
→ ① 리팩토링 범위에서 **명시적으로 제외**하거나, ② **피처 플래그 + 단계적 롤아웃**으로 폭발 반경을 줄이거나, ③ **수동 체크리스트**로 넘긴다. 셋 중 하나를 반드시 고르고, "테스트로 커버했다고 착각하지 않는다".

---

## 5. 회귀 감지 루틴 — `tests/audit/` 하네스 활용안

새로 만들 것 없다. 이미 있는 자산 그대로 쓴다.

### 5-1. 왜 이 하네스가 리팩토링 diff 에 적합한가 (설계상 근거)

`tests/audit/lib/parse-events.ts` 의 이슈 ID 생성 규칙:

```ts
const id = `response:${status}:${method}:${u.pathname}`   // 호스트 제외, pathname 만
const id = `pageerror:${String(e.message).slice(0, 50)}`  // 메시지 기반
const id = `fatal:${String(e.message).slice(0, 50)}`
```

**ID 에 호스트가 안 들어간다.** 따라서 `gongnori.fan`(before) 에서 뽑은 run 과 Vercel preview URL(after) 에서 뽑은 run 을 **그대로 비교할 수 있다.** 이건 우연이 아니라 이미 그렇게 설계돼 있는 것 — 크로스 호스트 diff 를 위해 추가 작업이 필요 없다.

그리고 `playwright.audit.config.ts` 는 `baseURL: process.env.BASE_URL || "https://gongnori.fan"` 이고 `webServer: undefined` 다 → **로컬 서버를 절대 띄우지 않는다.** 지금 `.next` 를 로컬 dev 가 점유 중이어도 안전하게 돌릴 수 있는 유일한 하네스다.

`compare-runs.ts` 는 CLI 인자 2개를 받는다:
```
tsx tests/audit/lib/compare-runs.ts <currDir> <prevDir>
```
→ `pnpm audit:diff` 의 "최근 2개 자동 비교"에 의존하지 말고 **항상 명시 지정**할 것. 중간에 다른 run 이 끼면 비교 대상이 어긋난다.

### 5-2. 리팩토링 전후 루틴

**[T0] 착수 전 — 베이스라인 고정**

```bash
BASE_URL=https://gongnori.fan pnpm audit:headless
BASE_URL=https://gongnori.fan pnpm audit:cwv
```
- 산출 디렉토리명(`tests/audit/reports/2026-07-28T…`)을 **리팩토링 계획 문서에 적어 고정**한다. reports/ 는 gitignored 라 지워지면 베이스라인이 사라진다 → `run-meta.json` + `audit-events.jsonl` 두 파일만 별도 백업 권장(스크린샷/trace.zip 제외하면 가볍다).
- `pnpm audit:parse <baselineDir>` 로 이슈 목록을 뽑아 **"이미 알려진 이슈"** 로 확정. 이걸 안 하면 after run 에서 기존 이슈와 신규 이슈를 구분 못 한다.

**[T1] 리팩토링 브랜치 preview 배포 후 — 비교**

```bash
BASE_URL=https://<preview>.vercel.app pnpm audit:headless
pnpm exec tsx tests/audit/lib/compare-runs.ts <afterDir> <baselineDir>
```

판정 기준(머지 게이트):

| 지표 | 통과 조건 |
|---|---|
| `regressed` (신규 critical/major) | **0 건** — 하나라도 있으면 머지 보류 |
| `newly` 중 `response:5xx:*` | 0 건 |
| `newly` 중 `pageerror:*` | 0 건 |
| `persisting` | 증가 없음 (베이스라인과 동일하면 OK) |
| `resolved` | 있으면 보너스 (리팩토링이 버그도 잡음) |

`compare-runs.ts` 는 실행 시 `reports/health.json` 에 자동 누적한다 → 리팩토링 단계별로 여러 번 돌리면 **회귀 추세선**이 그대로 남는다. 이미 5월 run 들이 쌓여 있어 비교 히스토리도 있다.

**[T2] 성능 회귀**

```bash
BASE_URL=https://<preview>.vercel.app pnpm audit:cwv
```
- 6 페이지 × 2 viewport × 3 샘플. LCP/FCP/CLS/TTFB.
- 게이트: LCP +15% 이상 악화 또는 CLS +0.05 이상 → 보류. (현재 홈 LCP ≈ 1.1s, CLS ≈ 0.001 이 기준선)
- 컴포넌트 분할·동적 import 를 건드리는 리팩토링이면 여기가 유일한 감지 수단이다.

**[T3] 프로덕션 배포 후 — 확인 사살**

```bash
BASE_URL=https://gongnori.fan pnpm audit:headless
pnpm exec tsx tests/audit/lib/compare-runs.ts <prodAfterDir> <baselineDir>
```
preview 에서 안 잡히는 것(CDN 캐시 헤더, 리라이트, CSP)이 여기서 드러난다.

### 5-3. 실행 전 주의 (이미 알려진 함정)

1. **Vercel Bot Protection** — preview 도메인에서 켜져 있으면 `/api/*` 가 429 Security Checkpoint 를 뱉어 **대량 false positive** 가 발생한다. audit 돌리기 전에 Firewall → Bot Protection 상태 확인.
2. **audit 은 실계정으로 로그인 크롤한다** — QA 계정이 사용자 본인(kyb3909)이다. 안전장치가 삭제/탈퇴/결제/구매/로그아웃 키워드를 차단하지만, 크롤 후 `prediction_slips` 에 잔여 슬립이 없는지 확인하고 있으면 삭제 + 환불할 것.
3. **run 당 30~45분** — 리팩토링 커밋마다 돌릴 수는 없다. **단계(Phase) 경계에서만** 돌리는 게이트로 쓴다. 커밋 단위 안전망은 P1~P5의 유닛/통합 테스트가 담당한다.
4. **`pnpm audit:diff` (인자 없는 형태) 금지** — 최근 2개 디렉토리를 자동으로 잡기 때문에, 중간에 CWV run 이나 재시도 run 이 끼면 엉뚱한 비교를 하고 `health.json` 을 오염시킨다. 항상 인자 2개 명시.

---

## 6. 1차 스프린트에서 써야 할 테스트 Top 5

| # | 대상 | 종류 | 케이스 / 난이도 | 왜 1순위인가 |
|---|---|---|---:|---|
| 1 | `app/api/betman/prediction/route.ts` POST | 통합 | 12–16 / 중 | 볼이 빠져나가는 738줄짜리 최대 라우트인데, 이걸 겨냥한 43개 케이스가 라우트를 import조차 안 한다 — 안전망이 있다고 믿고 있는 자리가 실은 완전히 비어 있다 |
| 2 | `lib/betman/settle.ts` 슬립 단계 (L223–441) | 유닛 | 10–14 / 중하 | 정산 "40% 커버"의 실체는 지급·환불 0% 커버다. 이미 진짜 테스트가 있는 파일이라 한계 비용이 가장 싸고, 이중 지급 가드를 잠글 유일한 수단이다 |
| 3 | `middleware.ts` + 가드 3종 + `requireAdminApi` | 유닛 + 통합 | 16–20 / 하 | 39개 admin 라우트의 단일 관문이 커버리지에서 **exclude** 되어 갭이 숫자로도 안 보인다. fail-closed 계약이 주석으로만 존재해서 try/catch 한 줄만 옮겨도 조용히 fail-open 된다 |
| 4 | `hooks/use-betting-slip.ts` | 유닛 (`renderHook`) | 30–40(래핑 포함) / 중 | hooks 폴더 커버리지가 정확히 **0.00%**. 미러 45케이스의 어서션을 그대로 살려 `renderHook` 으로 감싸기만 하면 되므로, 투입 대비 회수율이 가장 높다 |
| 5 | `tokens/spend` · `payments/purchase` · `predictions/purchase` | 통합 | 18–22 / 중하 | 셋이 동일한 "RPC → INSERT → 실패 시 환불" 패턴이라 리팩토링에서 공통 헬퍼로 추출될 1순위 후보다. 추출 **전에** 각각의 행동(특히 멱등성·환불·RPC 반환 키)을 잠가두지 않으면 통합 자체가 도박이 된다 |

병행 필수(테스트는 아니지만 같은 스프린트): **P7 커버리지 게이트 정상화** — CI 를 `pnpm test:coverage` 로 바꾸고 임계값을 실측치 기준으로 재설정. 지금은 임계값이 실패 상태로 방치돼 있어 어떤 신호도 주지 못한다.
