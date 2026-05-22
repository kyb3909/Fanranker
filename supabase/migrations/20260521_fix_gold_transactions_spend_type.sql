-- spend_gold() RPC 가 gold_transactions 에 transaction_type='spend' 로 기록하지만
-- gold_transactions_transaction_type_check 제약의 허용 목록에 'spend' 가 빠져 있어
-- 모든 골드 차감(예측글 구매 등)이 23514 제약 위반으로 실패했다.
-- 'spend' 를 허용 목록에 추가한다.

ALTER TABLE public.gold_transactions
  DROP CONSTRAINT IF EXISTS gold_transactions_transaction_type_check;

ALTER TABLE public.gold_transactions
  ADD CONSTRAINT gold_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'purchase'::text,
    'prediction_purchase'::text,
    'reward'::text,
    'admin_adjustment'::text,
    'commission_escrow_hold'::text,
    'commission_escrow_release'::text,
    'commission_escrow_refund'::text,
    'commission_fee'::text,
    'onboarding_reward'::text,
    'mini_game_reward'::text,
    'purchase_refund'::text,
    'analysis_sale_revenue'::text,
    'spend'::text
  ]));
