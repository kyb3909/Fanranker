-- 058: Add favorite_team and favorite_player to profiles
-- 온보딩 보상 확장: 최애 팀/선수 필드 추가

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorite_team text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorite_player text;

-- reward_gold RPC: transaction_type 파라미터 추가 (기본값 유지)
CREATE OR REPLACE FUNCTION reward_gold(
  p_user_id text,
  p_amount int,
  p_description text DEFAULT '미니게임 보상',
  p_transaction_type text DEFAULT 'mini_game_reward'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance int;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', '보상 금액은 0보다 커야 합니다.'
    );
  END IF;

  INSERT INTO user_gold (user_id, gold_balance, updated_at)
  VALUES (p_user_id, p_amount, now())
  ON CONFLICT (user_id) DO UPDATE
  SET gold_balance = user_gold.gold_balance + p_amount,
      updated_at = now()
  RETURNING gold_balance INTO v_new_balance;

  INSERT INTO gold_transactions (user_id, amount, balance_after, description, transaction_type)
  VALUES (p_user_id, p_amount, v_new_balance, p_description, p_transaction_type);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'rewarded', p_amount
  );
END;
$$;
