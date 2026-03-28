-- ============================================
-- 068: Extend subscriptions table for real payment integration
-- Purpose: Add PortOne payment fields, billing key, auto-renewal support
-- Dependencies: 013_create_subscriptions.sql
-- ============================================

-- Step 1: Allow platform-wide subscriptions (expert_id nullable)
ALTER TABLE subscriptions ALTER COLUMN expert_id DROP NOT NULL;

-- Step 2: Add payment integration columns
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_id text,
  ADD COLUMN IF NOT EXISTS payment_provider text DEFAULT 'portone',
  ADD COLUMN IF NOT EXISTS billing_key_enc text,       -- AES-256 encrypted billing key
  ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'premium'
    CHECK (plan_type IN ('premium', 'expert_monthly', 'expert_onetime')),
  ADD COLUMN IF NOT EXISTS auto_renew boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS renewal_failed_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Step 3: Index for renewal cron (finds expiring active subscriptions)
CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal
  ON subscriptions(status, expires_at)
  WHERE status = 'active' AND auto_renew = true;

-- Step 4: Index for platform subscription lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_platform
  ON subscriptions(subscriber_id, status)
  WHERE expert_id IS NULL AND status = 'active';

-- Step 5: Update is_subscription_active to support platform subscriptions
CREATE OR REPLACE FUNCTION is_subscription_active(
    p_subscriber_id text,
    p_expert_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE SQL
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM subscriptions
        WHERE subscriber_id = p_subscriber_id
          AND (
              (p_expert_id IS NULL AND expert_id IS NULL)
              OR expert_id = p_expert_id
          )
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
SELECT 'subscriptions extended for payments!' as status;
