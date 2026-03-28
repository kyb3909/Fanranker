-- ============================================
-- 071: Security fixes from CSO audit (2026-03-28)
-- Purpose: Race conditions, missing constraints, atomic operations
-- ============================================

-- 1. Atomic board points deduction (fixes pixel-art TOCTOU race)
CREATE OR REPLACE FUNCTION deduct_board_points(
    p_user_id text,
    p_board_slug text,
    p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_current integer;
    v_new integer;
BEGIN
    -- Atomic update with balance check
    UPDATE user_board_points
    SET available_points = available_points - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
      AND board_slug = p_board_slug
      AND available_points >= p_amount
    RETURNING available_points INTO v_new;

    IF NOT FOUND THEN
        -- Get current balance for error message
        SELECT available_points INTO v_current
        FROM user_board_points
        WHERE user_id = p_user_id AND board_slug = p_board_slug;

        RETURN jsonb_build_object(
            'success', false,
            'current_points', COALESCE(v_current, 0)
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'new_points', v_new
    );
END;
$$;

-- 2. UNIQUE constraint on prediction_purchases (prevents double gold spending)
ALTER TABLE prediction_purchases
    ADD CONSTRAINT uq_prediction_purchases_buyer_activity
    UNIQUE (buyer_id, activity_id);

-- 3. Safe admin economy adjustment function (prevents negative balances)
CREATE OR REPLACE FUNCTION admin_adjust_tokens(
    p_user_id text,
    p_amount integer,
    p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_new_balance integer;
BEGIN
    UPDATE user_tokens
    SET token_balance = GREATEST(0, token_balance + p_amount),
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING token_balance INTO v_new_balance;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    INSERT INTO token_transactions (user_id, transaction_type, amount, balance_after, description)
    VALUES (p_user_id, 'admin_adjustment', p_amount, v_new_balance, p_description);

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION admin_adjust_gold(
    p_user_id text,
    p_amount integer,
    p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_new_balance integer;
BEGIN
    UPDATE user_gold
    SET gold_balance = GREATEST(0, gold_balance + p_amount),
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING gold_balance INTO v_new_balance;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    INSERT INTO gold_transactions (user_id, transaction_type, amount, balance_after, description)
    VALUES (p_user_id, 'admin_adjustment', p_amount, v_new_balance, p_description);

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- ============================================
-- Verification
-- ============================================
SELECT 'Security fixes applied!' as status;
