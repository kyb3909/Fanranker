-- ============================================
-- 007: Create user_tokens and token_transactions tables
-- Purpose: Daily cyber token reset and balance management
-- Dependencies: 001_create_profiles.sql (profiles.user_id)
-- ============================================

-- ============================================
-- Step 1: Create user_tokens table
-- ============================================

CREATE TABLE IF NOT EXISTS user_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL UNIQUE REFERENCES profiles(user_id) ON DELETE CASCADE,
    token_balance integer NOT NULL DEFAULT 1000, -- Daily token allocation (configurable)
    last_reset_at timestamptz NOT NULL DEFAULT now(),
    total_tokens_earned integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tokens_last_reset_at ON user_tokens(last_reset_at);

-- Enable RLS
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Clerk Third-Party Auth
-- Users can view their own token balance
CREATE POLICY "Users can view their own tokens"
    ON user_tokens FOR SELECT
    USING ((auth.jwt()->>'sub') = user_id);

-- Users can update their own token balance (for spending/rewards)
CREATE POLICY "Users can update their own tokens"
    ON user_tokens FOR UPDATE
    USING ((auth.jwt()->>'sub') = user_id)
    WITH CHECK ((auth.jwt()->>'sub') = user_id);

-- System can insert tokens for new users (via ensure_profile or admin)
-- Note: Insert policy is optional - can be done via admin API or server-side
CREATE POLICY "System can insert user tokens"
    ON user_tokens FOR INSERT
    WITH CHECK (true); -- System/Admin only in practice

-- Trigger for updated_at
CREATE TRIGGER update_user_tokens_updated_at
    BEFORE UPDATE ON user_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Step 2: Create token_transactions table (audit log)
-- ============================================

CREATE TABLE IF NOT EXISTS token_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    transaction_type text NOT NULL CHECK (transaction_type IN ('daily_reset', 'prediction_spent', 'reward_earned', 'admin_adjustment')),
    amount integer NOT NULL, -- Positive = earned, Negative = spent
    balance_after integer NOT NULL, -- Balance after transaction
    description text, -- Optional description
    related_prediction_id uuid, -- If related to a prediction (FK will be added when predictions table exists)
    created_at timestamptz DEFAULT now()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_token_transactions_user_id ON token_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_transactions_type ON token_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_token_transactions_created_at ON token_transactions(created_at DESC);

-- Enable RLS
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own transaction history
CREATE POLICY "Users can view their own transactions"
    ON token_transactions FOR SELECT
    USING ((auth.jwt()->>'sub') = user_id);

-- System/Admin can insert transactions (via API with auth)
-- Note: Insert is done server-side with proper auth checks
CREATE POLICY "System can insert transactions"
    ON token_transactions FOR INSERT
    WITH CHECK (true); -- Server-side auth validation required

-- ============================================
-- Step 3: Helper function to reset daily tokens
-- ============================================

-- Function to reset tokens for a single user (called by batch process)
CREATE OR REPLACE FUNCTION reset_user_daily_tokens(target_user_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    daily_allocation integer := 1000; -- Configurable daily token amount
    current_balance integer;
    reset_amount integer;
BEGIN
    -- Get current balance
    SELECT token_balance INTO current_balance
    FROM user_tokens
    WHERE user_id = target_user_id;

    -- If user doesn't have tokens record, create one
    IF current_balance IS NULL THEN
        INSERT INTO user_tokens (user_id, token_balance, last_reset_at, total_tokens_earned)
        VALUES (target_user_id, daily_allocation, now(), daily_allocation)
        ON CONFLICT (user_id) DO NOTHING;
    ELSE
        -- Calculate reset amount (daily_allocation - current_balance, but can't be negative)
        reset_amount := GREATEST(0, daily_allocation - current_balance);

        -- Reset token balance
        UPDATE user_tokens
        SET 
            token_balance = daily_allocation,
            last_reset_at = now(),
            total_tokens_earned = total_tokens_earned + reset_amount,
            updated_at = now()
        WHERE user_id = target_user_id;

        -- Log transaction if tokens were added
        IF reset_amount > 0 THEN
            INSERT INTO token_transactions (
                user_id,
                transaction_type,
                amount,
                balance_after,
                description
            ) VALUES (
                target_user_id,
                'daily_reset',
                reset_amount,
                daily_allocation,
                'Daily token reset at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
            );
        END IF;
    END IF;
END;
$$;

-- ============================================
-- Step 4: Function to check and auto-reset tokens if needed
-- (Called when user checks balance - handles missed resets)
-- ============================================

CREATE OR REPLACE FUNCTION ensure_daily_token_reset(target_user_id text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    daily_allocation integer := 1000;
    last_reset_date date;
    current_date date := CURRENT_DATE;
    current_balance integer;
BEGIN
    -- Get last reset date and current balance
    SELECT last_reset_at::date, token_balance INTO last_reset_date, current_balance
    FROM user_tokens
    WHERE user_id = target_user_id;

    -- If no record exists, create one
    IF last_reset_date IS NULL THEN
        INSERT INTO user_tokens (user_id, token_balance, last_reset_at, total_tokens_earned)
        VALUES (target_user_id, daily_allocation, now(), daily_allocation)
        ON CONFLICT (user_id) DO UPDATE
        SET 
            token_balance = daily_allocation,
            last_reset_at = now(),
            total_tokens_earned = COALESCE(user_tokens.total_tokens_earned, 0) + daily_allocation,
            updated_at = now();
        
        RETURN daily_allocation;
    END IF;

    -- If last reset was before today, reset tokens
    IF last_reset_date < current_date THEN
        PERFORM reset_user_daily_tokens(target_user_id);
        SELECT token_balance INTO current_balance FROM user_tokens WHERE user_id = target_user_id;
        RETURN current_balance;
    END IF;

    -- Return current balance if no reset needed
    RETURN COALESCE(current_balance, daily_allocation);
END;
$$;

-- ============================================
-- Verification
-- ============================================
SELECT 'user_tokens and token_transactions tables created successfully!' as status;
