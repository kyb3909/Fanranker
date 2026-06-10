-- ============================================
-- 013: Create subscriptions table (Expert subscription system)
-- Purpose: Track monthly subscriptions to expert users
-- Dependencies: profiles table (001_create_profiles.sql)
-- ============================================

-- ============================================
-- Step 1: Create subscriptions table
-- ============================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    expert_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    subscription_type text NOT NULL CHECK (subscription_type IN ('monthly', 'one_time')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    started_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz, -- NULL for one_time subscriptions
    amount_paid integer NOT NULL DEFAULT 0, -- Payment amount in tokens or currency
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Prevent duplicate active subscriptions
    UNIQUE(subscriber_id, expert_id, subscription_type, status) 
    WHERE status = 'active'
);

-- ============================================
-- Step 2: Indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber_id ON subscriptions(subscriber_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expert_id ON subscriptions(expert_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================
-- Step 3: Enable RLS
-- ============================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions (as subscriber or expert)
CREATE POLICY "Users can view their own subscriptions"
    ON subscriptions FOR SELECT
    USING (
        (auth.jwt()->>'sub') = subscriber_id 
        OR (auth.jwt()->>'sub') = expert_id
    );

-- Users can create subscriptions (subscribe to experts)
CREATE POLICY "Users can subscribe to experts"
    ON subscriptions FOR INSERT
    WITH CHECK ((auth.jwt()->>'sub') = subscriber_id);

-- Users can update their own subscriptions (cancel, renew)
CREATE POLICY "Users can update their subscriptions"
    ON subscriptions FOR UPDATE
    USING ((auth.jwt()->>'sub') = subscriber_id)
    WITH CHECK ((auth.jwt()->>'sub') = subscriber_id);

-- ============================================
-- Step 4: Trigger for updated_at
-- ============================================

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Step 5: Function to check if subscription is active
-- ============================================

CREATE OR REPLACE FUNCTION is_subscription_active(
    p_subscriber_id text,
    p_expert_id text
)
RETURNS boolean
LANGUAGE SQL
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM subscriptions
        WHERE subscriber_id = p_subscriber_id
          AND expert_id = p_expert_id
          AND status = 'active'
          AND (
              expires_at IS NULL 
              OR expires_at > now()
          )
    )
$$;

-- ============================================
-- Verification
-- ============================================
SELECT 'subscriptions table created successfully!' as status;
