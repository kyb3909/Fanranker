-- 20260429: 분석글 판매자 정산 실패 보상 큐 (pending_refunds 패턴)
--
-- /api/predictions/purchase 에서 reward_gold RPC가 inline retry 3회 모두 실패하면
-- 이 테이블에 INSERT. 운영자가 admin UI에서 수동 해결.

CREATE TABLE IF NOT EXISTS pending_seller_rewards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    buyer_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    activity_id uuid NOT NULL,
    purchase_id uuid,
    amount integer NOT NULL,
    description text,
    transaction_type text NOT NULL DEFAULT 'analysis_sale_revenue',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'failed')),
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    created_at timestamptz DEFAULT now(),
    resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pending_seller_rewards_status
    ON pending_seller_rewards(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pending_seller_rewards_seller
    ON pending_seller_rewards(seller_id);

-- RLS: admin only (service role bypass; 일반 유저 차단)
ALTER TABLE pending_seller_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only for pending_seller_rewards"
    ON pending_seller_rewards FOR ALL USING (false);
