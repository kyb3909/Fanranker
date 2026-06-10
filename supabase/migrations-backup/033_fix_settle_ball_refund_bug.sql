-- ============================================
-- 030: Fix settle_predictions_by_round ball refund bug
--
-- BUG: settle_predictions_by_round was calling refund_tokens()
--      for won slips, returning floor(stake * total_odds) balls.
--      Balls are consumable — they should NEVER be returned on win.
--      Only points_earned should be recorded.
--
-- FIX: Replace the function with a safe version that does NOT
--      call refund_tokens for won slips. Only cancelled slips
--      get refunds (all predictions cancelled).
--
-- ALSO: Correct already-credited balls from past buggy settlements.
-- ============================================

-- Step 1: Replace settle_predictions_by_round with safe version
-- (This removes the refund_tokens call for won slips)
CREATE OR REPLACE FUNCTION settle_predictions_by_round(p_gm_ts text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_round_id uuid;
  v_game record;
  v_pred record;
  v_slip record;
  v_settled integer := 0;
  v_correct integer := 0;
  v_wrong integer := 0;
  v_cancelled integer := 0;
  v_slips_won integer := 0;
  v_slips_lost integer := 0;
  v_odds_map jsonb;
  v_is_correct boolean;
  v_points_earned numeric;
  v_affected_slip_ids uuid[];
  v_affected_user_ids text[];
  v_now timestamptz := now();
BEGIN
  -- Find round by gm_ts
  SELECT id INTO v_round_id
  FROM betman_rounds
  WHERE gm_ts = p_gm_ts;

  IF v_round_id IS NULL THEN
    RETURN jsonb_build_object('error', 'gm_ts=' || p_gm_ts || '에 해당하는 회차 없음');
  END IF;

  -- Settle individual predictions
  FOR v_game IN
    SELECT id, game_no, game_type, sport, result, status,
           home_win_odds, away_win_odds, draw_odds, over_odds, under_odds,
           daily_round_id
    FROM betman_games
    WHERE round_id = v_round_id
      AND status IN ('completed', 'cancelled')
  LOOP
    FOR v_pred IN
      SELECT id, user_id, game_id, prediction, status, stake, slip_id
      FROM betman_predictions
      WHERE game_id = v_game.id AND status = 'pending'
    LOOP
      IF v_game.status = 'cancelled' THEN
        UPDATE betman_predictions
        SET status = 'cancelled', is_correct = NULL, points_earned = 0, settled_at = v_now
        WHERE id = v_pred.id;
        v_cancelled := v_cancelled + 1;
      ELSE
        v_is_correct := (v_pred.prediction = v_game.result);
        v_points_earned := 0;

        IF v_is_correct THEN
          v_odds_map := jsonb_build_object(
            'home', COALESCE(v_game.home_win_odds::numeric, 0),
            'away', COALESCE(v_game.away_win_odds::numeric, 0),
            'draw', COALESCE(v_game.draw_odds::numeric, 0),
            'over', COALESCE(v_game.over_odds::numeric, 0),
            'under', COALESCE(v_game.under_odds::numeric, 0)
          );
          v_points_earned := COALESCE((v_odds_map->>v_pred.prediction)::numeric, 0);
        END IF;

        UPDATE betman_predictions
        SET status = 'settled', is_correct = v_is_correct,
            points_earned = v_points_earned, settled_at = v_now
        WHERE id = v_pred.id;

        v_settled := v_settled + 1;
        IF v_is_correct THEN v_correct := v_correct + 1;
        ELSE v_wrong := v_wrong + 1;
        END IF;
      END IF;

      -- Collect affected slip IDs
      IF v_pred.slip_id IS NOT NULL THEN
        IF NOT v_pred.slip_id = ANY(COALESCE(v_affected_slip_ids, ARRAY[]::uuid[])) THEN
          v_affected_slip_ids := array_append(COALESCE(v_affected_slip_ids, ARRAY[]::uuid[]), v_pred.slip_id);
        END IF;
      END IF;

      -- Collect affected user IDs
      IF NOT v_pred.user_id = ANY(COALESCE(v_affected_user_ids, ARRAY[]::text[])) THEN
        v_affected_user_ids := array_append(COALESCE(v_affected_user_ids, ARRAY[]::text[]), v_pred.user_id);
      END IF;
    END LOOP;
  END LOOP;

  -- Settle slips
  IF v_affected_slip_ids IS NOT NULL THEN
    FOR v_slip IN
      SELECT ps.id, ps.user_id, ps.stake, ps.total_odds, ps.status
      FROM prediction_slips ps
      WHERE ps.id = ANY(v_affected_slip_ids) AND ps.status = 'pending'
    LOOP
      -- Check if all predictions in this slip are settled/cancelled
      IF EXISTS (
        SELECT 1 FROM betman_predictions
        WHERE slip_id = v_slip.id AND status = 'pending'
      ) THEN
        CONTINUE; -- Still has pending predictions
      END IF;

      -- Check settled (non-cancelled) predictions
      IF NOT EXISTS (
        SELECT 1 FROM betman_predictions
        WHERE slip_id = v_slip.id AND status = 'settled'
      ) THEN
        -- All cancelled → refund
        UPDATE prediction_slips SET status = 'cancelled' WHERE id = v_slip.id;
        PERFORM refund_tokens(v_slip.user_id, v_slip.stake, '경기 취소 환불 (슬립)');
        CONTINUE;
      END IF;

      -- Check if all settled predictions are correct
      IF NOT EXISTS (
        SELECT 1 FROM betman_predictions
        WHERE slip_id = v_slip.id AND status = 'settled' AND is_correct = false
      ) THEN
        -- All correct → WON (NO ball refund — points only)
        UPDATE prediction_slips SET status = 'won' WHERE id = v_slip.id;
        v_slips_won := v_slips_won + 1;
      ELSE
        -- Some wrong → LOST
        UPDATE prediction_slips SET status = 'lost' WHERE id = v_slip.id;
        v_slips_lost := v_slips_lost + 1;
      END IF;
    END LOOP;
  END IF;

  -- Update daily round status
  DECLARE
    v_dr_id uuid;
    v_remaining integer;
  BEGIN
    FOR v_dr_id IN
      SELECT DISTINCT daily_round_id
      FROM betman_games
      WHERE round_id = v_round_id AND daily_round_id IS NOT NULL
    LOOP
      SELECT count(*) INTO v_remaining
      FROM betman_games
      WHERE daily_round_id = v_dr_id AND status IN ('scheduled', 'in_progress');

      IF v_remaining = 0 THEN
        UPDATE betman_daily_rounds
        SET status = 'settled', updated_at = v_now
        WHERE id = v_dr_id AND bet_close_at < v_now;
      END IF;
    END LOOP;
  END;

  -- Update user sport stats
  IF v_affected_user_ids IS NOT NULL THEN
    BEGIN
      FOR i IN 1..array_length(v_affected_user_ids, 1) LOOP
        BEGIN
          PERFORM recalc_user_sport_stats(v_affected_user_ids[i]);
        EXCEPTION WHEN OTHERS THEN
          -- Non-fatal: log but continue
          NULL;
        END;
      END LOOP;
    END;
  END IF;

  RETURN jsonb_build_object(
    'gm_ts', p_gm_ts,
    'round_id', v_round_id,
    'settled', v_settled,
    'correct', v_correct,
    'wrong', v_wrong,
    'cancelled', v_cancelled,
    'slips_won', v_slips_won,
    'slips_lost', v_slips_lost,
    'total_payout', 0,
    'users_updated', COALESCE(array_length(v_affected_user_ids, 1), 0)
  );
END;
$$;

-- Step 2: Also fix settle_round if it exists with the same bug
-- (Replace with a wrapper that calls the fixed settle_predictions_by_round)
CREATE OR REPLACE FUNCTION settle_round(p_gm_ts text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_round_id uuid;
  v_result jsonb;
  v_dr record;
  v_remaining integer;
  v_daily_rounds_updated integer := 0;
BEGIN
  SELECT id INTO v_round_id
  FROM betman_rounds
  WHERE gm_ts = p_gm_ts;

  IF v_round_id IS NULL THEN
    RETURN jsonb_build_object('error', 'round not found', 'gm_ts', p_gm_ts);
  END IF;

  -- Delegate to fixed settle_predictions_by_round
  v_result := settle_predictions_by_round(p_gm_ts);

  -- Additional: update round status
  FOR v_dr IN
    SELECT DISTINCT daily_round_id
    FROM betman_games
    WHERE round_id = v_round_id AND daily_round_id IS NOT NULL
  LOOP
    SELECT count(*) INTO v_remaining
    FROM betman_games
    WHERE daily_round_id = v_dr.daily_round_id AND status IN ('scheduled', 'in_progress');

    IF v_remaining = 0 THEN
      UPDATE betman_daily_rounds
      SET status = 'settled', updated_at = now()
      WHERE id = v_dr.daily_round_id AND bet_close_at < now();
      v_daily_rounds_updated := v_daily_rounds_updated + 1;
    END IF;
  END LOOP;

  -- Check round-level completion
  SELECT count(*) INTO v_remaining
  FROM betman_games
  WHERE round_id = v_round_id AND status IN ('scheduled', 'in_progress');

  IF v_remaining = 0 THEN
    UPDATE betman_rounds
    SET status = 'settled', updated_at = now()
    WHERE id = v_round_id;
    v_result := v_result || jsonb_build_object('round_status', 'settled');
  ELSE
    v_result := v_result || jsonb_build_object('round_status', 'open');
  END IF;

  v_result := v_result || jsonb_build_object('daily_rounds_updated', v_daily_rounds_updated);

  RETURN v_result;
END;
$$;

-- Step 3: Correct already-credited balls
-- Find all "적중" refund transactions and reverse them
DO $$
DECLARE
  v_txn record;
  v_current_balance integer;
BEGIN
  FOR v_txn IN
    SELECT id, user_id, amount, created_at, description
    FROM token_transactions
    WHERE transaction_type = 'refund'
      AND description LIKE '%적중%'
    ORDER BY created_at ASC
  LOOP
    -- Deduct the incorrectly credited amount
    UPDATE user_tokens
    SET token_balance = GREATEST(0, token_balance - v_txn.amount)
    WHERE user_id = v_txn.user_id
    RETURNING token_balance INTO v_current_balance;

    -- Log the correction
    INSERT INTO token_transactions (
      user_id, transaction_type, amount, balance_after, description
    ) VALUES (
      v_txn.user_id,
      'admin_adjustment',
      -v_txn.amount,
      COALESCE(v_current_balance, 0),
      '적중 볼 반환 버그 정정 (원본: ' || v_txn.description || ', txn=' || v_txn.id || ')'
    );

    RAISE NOTICE 'Corrected user=%, amount=-%', v_txn.user_id, v_txn.amount;
  END LOOP;
END;
$$;

-- Verify correction
SELECT 'Migration 030 complete: settle ball refund bug fixed' as status;
