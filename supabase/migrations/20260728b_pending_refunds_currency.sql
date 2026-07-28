-- pending_refunds 에 통화 구분 추가
--
-- 배경
--   app/api/predictions/purchase/route.ts 의 골드 구매에서, 구매 기록 INSERT 실패 시
--   골드 환불을 inline 3회 재시도하고 **모두 실패하면 Sentry 로그만 남긴다**(:168-181).
--   토큰 경로(lib/betman/refund-tokens.ts)는 같은 상황에서 pending_refunds 에 큐잉하는데
--   골드 경로만 빠져 있어, 어드민 화면에서 찾을 수 없는 손실이 된다.
--
-- 왜 컬럼을 먼저 추가하는가
--   pending_refunds 에는 통화 구분이 없고, 어드민 처리 라우트
--   (app/api/admin/refunds/route.ts PATCH, action="retry")는 무조건 refund_tokens 를
--   호출한다. 통화 구분 없이 골드 부채를 이 큐에 넣으면 **볼로 환불**되어
--   지금보다 나쁜 상태가 된다. 그래서 큐잉보다 이 컬럼이 먼저다.
--
-- 안전성
--   NOT NULL DEFAULT 'token' 이므로 기존 행과 기존 코드 경로의 동작은 그대로다.
--   (기존 insert 문들은 currency 를 명시하지 않으므로 자동으로 'token' 이 된다)

ALTER TABLE pending_refunds
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'token';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pending_refunds_currency_check'
  ) THEN
    ALTER TABLE pending_refunds
      ADD CONSTRAINT pending_refunds_currency_check
      CHECK (currency IN ('token', 'gold'));
  END IF;
END $$;

COMMENT ON COLUMN pending_refunds.currency IS
  '환불해야 할 통화. token=볼(refund_tokens), gold=골드(reward_gold). '
  '어드민 retry 는 현재 token 만 자동 처리하고 gold 는 거부한다 — '
  '골드 자동 지급 경로는 테스트를 깐 뒤에 추가할 것.';
