-- ============================================
-- 045: Fix daily_allocation (1000 → 10) and add locked_odds to betman_predictions
--
-- BUG-2: DB 함수 daily_allocation이 1000(레거시)으로 설정되어 있어
--         실제 볼 시스템(10볼/일)과 불일치
-- BUG-5: 베팅 시점의 배당률을 저장하지 않아 정산 시 변동된 배당률 사용 가능
-- ============================================

-- ============================================
-- Step 1: Fix daily_allocation in reset_user_daily_tokens (1000 → 10)
-- ============================================

CREATE OR REPLACE FUNCTION reset_user_daily_tokens(target_user_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    daily_allocation integer := 10; -- Fixed: 10 balls per day (was 1000)
    current_balance integer;
    reset_amount integer;
BEGIN
    SELECT token_balance INTO current_balance
    FROM user_tokens
    WHERE user_id = target_user_id;

    IF current_balance IS NULL THEN
        INSERT INTO user_tokens (user_id, token_balance, last_reset_at, total_tokens_earned)
        VALUES (target_user_id, daily_allocation, now(), daily_allocation)
        ON CONFLICT (user_id) DO NOTHING;
    ELSE
        reset_amount := GREATEST(0, daily_allocation - current_balance);

        UPDATE user_tokens
        SET
            token_balance = daily_allocation,
            last_reset_at = now(),
            total_tokens_earned = total_tokens_earned + reset_amount,
            updated_at = now()
        WHERE user_id = target_user_id;

        IF reset_amount > 0 THEN
            INSERT INTO token_transactions (
                user_id, transaction_type, amount, balance_after, description
            ) VALUES (
                target_user_id, 'daily_reset', reset_amount, daily_allocation,
                'Daily token reset at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
            );
        END IF;
    END IF;
END;
$$;

-- ============================================
-- Step 2: Fix daily_allocation in ensure_daily_token_reset (1000 → 10)
-- ============================================

CREATE OR REPLACE FUNCTION ensure_daily_token_reset(target_user_id text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    daily_allocation integer := 10; -- Fixed: 10 balls per day (was 1000)
    last_reset_date date;
    current_date date := CURRENT_DATE;
    current_balance integer;
BEGIN
    SELECT last_reset_at::date, token_balance INTO last_reset_date, current_balance
    FROM user_tokens
    WHERE user_id = target_user_id;

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

    IF last_reset_date < current_date THEN
        PERFORM reset_user_daily_tokens(target_user_id);
        SELECT token_balance INTO current_balance FROM user_tokens WHERE user_id = target_user_id;
        RETURN current_balance;
    END IF;

    RETURN COALESCE(current_balance, daily_allocation);
END;
$$;

-- ============================================
-- Step 3: Add locked_odds column to betman_predictions (BUG-5)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'betman_predictions'
    AND column_name = 'locked_odds'
  ) THEN
    ALTER TABLE betman_predictions ADD COLUMN locked_odds numeric;
    COMMENT ON COLUMN betman_predictions.locked_odds IS '베팅 시점에 잠긴 배당률 (정산 시 이 값 우선 사용)';
  END IF;
END $$;

-- ============================================
-- Verification
-- ============================================
SELECT 'Migration 045 applied: daily_allocation fixed to 10, locked_odds column added' as status;
