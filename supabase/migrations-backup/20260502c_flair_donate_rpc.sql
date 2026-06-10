-- ============================================
-- Phase C: flair 활동 점수 → 경기장 기부 RPC
--
-- 사용자가 본인 user_flair_scores.score_balance 를 차감해서
-- 그 flair 의 team_id 경기장에 기부. balance 만 차감, score_total 은 그대로 유지
-- (호칭은 영향 없음). stadium_contributions / team_stadiums.total_points / fan_count 갱신.
--
-- 제약:
--   - flair 의 team_id 가 NULL 이면 실패 (리그 flair 는 매핑된 팀 없음)
--   - balance 부족하면 실패
--   - amount > 0 이어야 함
-- ============================================

CREATE OR REPLACE FUNCTION donate_flair_score_to_team(
  p_user_id  text,
  p_flair_id uuid,
  p_amount   int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team_id      text;
  v_balance      int;
  v_old_total    bigint;
  v_new_total    bigint;
  v_old_level    int;
  v_new_level    int;
  v_fan_count    int;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'amount must be > 0');
  END IF;

  -- 1. flair → team_id 확인
  SELECT team_id INTO v_team_id FROM post_flairs WHERE id = p_flair_id;
  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '이 flair 는 매핑된 경기장이 없습니다.');
  END IF;

  -- team_map_pins 활성 확인
  IF NOT EXISTS (SELECT 1 FROM team_map_pins WHERE team_id = v_team_id AND is_active = true) THEN
    RETURN jsonb_build_object('ok', false, 'error', '비활성 팀입니다.');
  END IF;

  -- 2. balance 충분한지 확인 + 차감 (atomic)
  UPDATE user_flair_scores
    SET score_balance = score_balance - p_amount,
        last_at = now()
    WHERE user_id = p_user_id
      AND flair_id = p_flair_id
      AND score_balance >= p_amount
    RETURNING score_balance INTO v_balance;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '잔액이 부족합니다.');
  END IF;

  -- 3. team_stadiums 점수 누적 + 레벨 재계산
  SELECT level, total_points INTO v_old_level, v_old_total
    FROM team_stadiums WHERE team_id = v_team_id;

  v_old_total := COALESCE(v_old_total, 0);
  v_new_total := v_old_total + p_amount;

  UPDATE team_stadiums
    SET total_points = v_new_total,
        updated_at = now()
    WHERE team_id = v_team_id;

  -- 레벨 재계산
  SELECT level INTO v_new_level
    FROM stadium_level_thresholds
    WHERE required_points <= v_new_total
    ORDER BY level DESC
    LIMIT 1;
  v_new_level := COALESCE(v_new_level, COALESCE(v_old_level, 1));

  IF v_new_level > COALESCE(v_old_level, 1) THEN
    UPDATE team_stadiums SET level = v_new_level WHERE team_id = v_team_id;
  END IF;

  -- 4. stadium_contributions 누적
  INSERT INTO stadium_contributions (user_id, team_id, points_contributed, last_synced_at)
  VALUES (p_user_id, v_team_id, p_amount, now())
  ON CONFLICT (user_id, team_id) DO UPDATE
    SET points_contributed = stadium_contributions.points_contributed + p_amount,
        last_synced_at = now();

  -- 5. fan_count 갱신
  SELECT COUNT(*) INTO v_fan_count
    FROM stadium_contributions
    WHERE team_id = v_team_id AND points_contributed > 0;

  UPDATE team_stadiums SET fan_count = v_fan_count WHERE team_id = v_team_id;

  RETURN jsonb_build_object(
    'ok', true,
    'team_id', v_team_id,
    'amount_donated', p_amount,
    'new_balance', v_balance,
    'stadium_total_points', v_new_total,
    'stadium_level', v_new_level,
    'leveled_up', v_new_level > COALESCE(v_old_level, 1),
    'fan_count', v_fan_count
  );
END;
$$;

REVOKE ALL ON FUNCTION donate_flair_score_to_team(text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION donate_flair_score_to_team(text, uuid, int) TO service_role;

SELECT 'Phase C done — donate_flair_score_to_team RPC 등록.' AS status;
