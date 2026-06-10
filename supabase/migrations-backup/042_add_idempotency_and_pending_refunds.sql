-- 042: 멱등성 키 + 환불 실패 보상 큐

-- 1. token_transactions + gold_transactions에 idempotency_key 추가
ALTER TABLE token_transactions ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_tx_idempotency
  ON token_transactions(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE gold_transactions ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_gold_tx_idempotency
  ON gold_transactions(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. 환불 실패 시 보상 큐 테이블
CREATE TABLE IF NOT EXISTS pending_refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    amount integer NOT NULL,
    description text,
    source text NOT NULL, -- 'slip_creation_failed', 'prediction_insert_failed', 'game_cancelled'
    related_slip_id uuid,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'failed')),
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    created_at timestamptz DEFAULT now(),
    resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pending_refunds_status ON pending_refunds(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pending_refunds_user ON pending_refunds(user_id);

-- RLS
ALTER TABLE pending_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only for pending_refunds" ON pending_refunds FOR ALL USING (false);
