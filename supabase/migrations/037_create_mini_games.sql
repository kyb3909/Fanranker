-- 037: 미니게임 시스템 (페널티킥 등)
-- mini_game_plays 테이블 + reward_gold RPC

-- 1. 미니게임 플레이 기록 테이블
CREATE TABLE IF NOT EXISTS mini_game_plays (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL,
  game_type text NOT NULL DEFAULT 'penalty_kick',
  play_date date NOT NULL,
  goals int NOT NULL DEFAULT 0,
  gold_rewarded int NOT NULL DEFAULT 0,
  kick_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 하루 1회 제한: (user_id, game_type, play_date) 유니크
ALTER TABLE mini_game_plays
  ADD CONSTRAINT mini_game_plays_daily_unique
  UNIQUE (user_id, game_type, play_date);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_mini_game_plays_user
  ON mini_game_plays(user_id, game_type, play_date DESC);

-- RLS 활성화
ALTER TABLE mini_game_plays ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 본인 기록만 조회 가능
CREATE POLICY "Users can view own mini game plays"
  ON mini_game_plays FOR SELECT
  USING (user_id = auth.uid()::text);

-- Service role은 모든 작업 가능 (API 라우트에서 사용)

-- 2. reward_gold RPC: 골드 보상 지급 (atomic)
-- user_gold UPSERT + gold_transactions INSERT
CREATE OR REPLACE FUNCTION reward_gold(
  p_user_id text,
  p_amount int,
  p_description text DEFAULT '미니게임 보상'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance int;
BEGIN
  -- 보상 금액 검증
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_message', '보상 금액은 0보다 커야 합니다.'
    );
  END IF;

  -- user_gold UPSERT (없으면 생성, 있으면 증가)
  INSERT INTO user_gold (user_id, gold_balance, updated_at)
  VALUES (p_user_id, p_amount, now())
  ON CONFLICT (user_id) DO UPDATE
  SET gold_balance = user_gold.gold_balance + p_amount,
      updated_at = now()
  RETURNING gold_balance INTO v_new_balance;

  -- gold_transactions에 기록
  INSERT INTO gold_transactions (user_id, amount, balance_after, description, transaction_type)
  VALUES (p_user_id, p_amount, v_new_balance, p_description, 'mini_game_reward');

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'rewarded', p_amount
  );
END;
$$;
