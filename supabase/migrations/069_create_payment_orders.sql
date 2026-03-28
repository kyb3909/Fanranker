-- ============================================
-- 069: Create payment_orders table
-- Purpose: Track all real-money payment transactions (PortOne)
-- Dependencies: 001_create_profiles.sql, 068_extend_subscriptions_for_payments.sql
-- ============================================

-- Step 1: Create payment_orders table
CREATE TABLE IF NOT EXISTS payment_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,

    -- PortOne identifiers
    payment_id text UNIQUE NOT NULL,       -- Merchant-generated payment ID
    portone_tx_id text,                    -- PortOne transaction ID (set after payment)

    -- Order details
    order_type text NOT NULL CHECK (order_type IN ('subscription', 'content_purchase')),
    order_name text NOT NULL,              -- Display name: "FanRanker 프리미엄 구독" etc.
    amount integer NOT NULL,               -- KRW amount
    currency text DEFAULT 'KRW',

    -- Status tracking
    status text DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),

    -- Linking to domain objects
    subscription_id uuid REFERENCES subscriptions(id),
    content_id uuid,                       -- prediction_id for content purchases

    -- PG metadata
    pg_provider text,                      -- 'tosspayments', 'kakaopay', etc.
    receipt_url text,

    -- Timestamps for each status transition
    paid_at timestamptz,
    failed_at timestamptz,
    cancelled_at timestamptz,
    cancel_reason text,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Step 2: Indexes
CREATE INDEX IF NOT EXISTS idx_payment_orders_user
    ON payment_orders(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_orders_status
    ON payment_orders(status)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_payment_orders_subscription
    ON payment_orders(subscription_id)
    WHERE subscription_id IS NOT NULL;

-- Step 3: Enable RLS
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own payment orders
CREATE POLICY "Users can view own payment orders"
    ON payment_orders FOR SELECT
    USING ((auth.jwt()->>'sub') = user_id);

-- System (service role) can insert/update payment orders
-- Note: API routes use createServiceRoleClient() which bypasses RLS

-- Step 4: Updated_at trigger
CREATE TRIGGER update_payment_orders_updated_at
    BEFORE UPDATE ON payment_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Verification
-- ============================================
SELECT 'payment_orders table created!' as status;
