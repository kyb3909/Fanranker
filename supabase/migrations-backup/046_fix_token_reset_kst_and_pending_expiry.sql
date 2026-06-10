-- ============================================
-- 046: Fix token reset timezone (UTC → KST) and add pending prediction auto-expiry
--
-- BUG-8: ensure_daily_token_reset uses CURRENT_DATE (UTC) but daily round
--         operates on KST (08:00~08:00). Users near midnight KST get wrong reset.
-- BUG-11: Predictions can stay "pending" indefinitely if a game never gets
--          results (e.g., crawler failure). Add auto-expiry mechanism.
-- ============================================

-- ============================================
-- Step 1: Fix ensure_daily_token_reset to use KST timezone (BUG-8)
-- ============================================

CREATE OR REPLACE FUNCTION ensure_daily_token_reset(target_user_id text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    daily_allocation integer := 10;
    last_reset_date date;
    kst_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
    current_balance integer;
BEGIN
    SELECT (last_reset_at AT TIME ZONE 'Asia/Seoul')::date, token_balance
    INTO last_reset_date, current_balance
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

    IF last_reset_date < kst_today THEN
        PERFORM reset_user_daily_tokens(target_user_id);
        SELECT token_balance INTO current_balance FROM user_tokens WHERE user_id = target_user_id;
        RETURN current_balance;
    END IF;

    RETURN COALESCE(current_balance, daily_allocation);
END;
$$;

-- ============================================
-- Step 2: Create function to expire stale pending predictions (BUG-11)
-- Predictions pending for >48h with game match_time passed are auto-expired.
-- ============================================

CREATE OR REPLACE FUNCTION expire_stale_pending_predictions()
RETURNS TABLE(expired_count integer, refunded_count integer)
LANGUAGE plpgsql
AS $$
DECLARE
    v_expired integer := 0;
    v_refunded integer := 0;
    v_slip RECORD;
BEGIN
    -- 1. Expire individual predictions where game match_time + 48h has passed
    WITH expired AS (
        UPDATE betman_predictions bp
        SET
            status = 'cancelled',
            is_correct = NULL,
            points_earned = 0,
            settled_at = now()
        FROM betman_games bg
        WHERE bp.game_id = bg.id
          AND bp.status = 'pending'
          AND bg.match_time < now() - interval '48 hours'
        RETURNING bp.id, bp.slip_id
    )
    SELECT count(*) INTO v_expired FROM expired;

    -- 2. Handle affected slips (all predictions resolved → determine slip outcome)
    FOR v_slip IN
        SELECT DISTINCT ps.id, ps.user_id, ps.stake, ps.status as slip_status
        FROM prediction_slips ps
        WHERE ps.status = 'pending'
          AND NOT EXISTS (
              SELECT 1 FROM betman_predictions bp
              WHERE bp.slip_id = ps.id AND bp.status = 'pending'
          )
    LOOP
        -- Check if any settled (non-cancelled) predictions exist
        IF EXISTS (
            SELECT 1 FROM betman_predictions
            WHERE slip_id = v_slip.id AND status = 'settled'
        ) THEN
            -- Has settled predictions: check if all correct
            IF NOT EXISTS (
                SELECT 1 FROM betman_predictions
                WHERE slip_id = v_slip.id AND status = 'settled' AND is_correct = false
            ) THEN
                UPDATE prediction_slips SET status = 'won' WHERE id = v_slip.id AND status = 'pending';
            ELSE
                UPDATE prediction_slips SET status = 'lost' WHERE id = v_slip.id AND status = 'pending';
            END IF;
        ELSE
            -- All cancelled → refund
            UPDATE prediction_slips SET status = 'cancelled' WHERE id = v_slip.id AND status = 'pending';
            PERFORM refund_tokens(v_slip.user_id, v_slip.stake, '만료 자동 환불 (48h)');
            v_refunded := v_refunded + 1;
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_expired, v_refunded;
END;
$$;

-- ============================================
-- Verification
-- ============================================
SELECT 'Migration 046 applied: KST timezone fix + pending expiry function' as status;
