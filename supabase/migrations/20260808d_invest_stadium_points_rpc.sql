-- 스타디움 투자 원자화 (2026-08-08 감사 P1-2).
--
-- /api/stadiums/invest 가 잔액검사→insert→total_points→레벨→기여→fan_count 를
-- 트랜잭션 없이 8단계 순차 실행하고 있었다 — 동시 요청 시 잔액 초과 이중 투자
-- race + 중간 실패 시 부분 반영. 기부(donate_flair_score_to_team)·정산 동기화
-- (sync_stadium_contribution)는 RPC 로 원자적인 것과 비대칭이던 마지막 경로.
--
-- 동시성: 잔액(적중 수익 합 − 투자 합)은 잠글 단일 행이 없으므로 유저 단위
-- advisory xact lock 으로 직렬화한다. 팀 행은 FOR UPDATE.

CREATE OR REPLACE FUNCTION public.invest_stadium_points(
  p_user_id text,
  p_team_id text,
  p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_total_earned integer;
  v_total_invested integer;
  v_available integer;
  v_prev_level integer;
  v_prev_points integer;
  v_new_points integer;
  v_new_level integer;
  v_fan_count integer;
BEGIN
  IF p_amount IS NULL OR p_amount < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  -- 같은 유저의 동시 투자 직렬화 (잔액 이중 사용 방지)
  PERFORM pg_advisory_xact_lock(hashtext('stadium_invest:' || p_user_id));

  SELECT COALESCE(FLOOR(SUM(points_earned)), 0)::integer INTO v_total_earned
  FROM betman_predictions
  WHERE user_id = p_user_id AND status = 'settled' AND is_correct = true;

  SELECT COALESCE(SUM(points_invested), 0)::integer INTO v_total_invested
  FROM stadium_investments
  WHERE user_id = p_user_id;

  v_available := GREATEST(0, v_total_earned - v_total_invested);
  IF p_amount > v_available THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'insufficient', 'available', v_available
    );
  END IF;

  SELECT level, total_points INTO v_prev_level, v_prev_points
  FROM team_stadiums WHERE team_id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'team_not_found');
  END IF;

  INSERT INTO stadium_investments (user_id, team_id, points_invested)
  VALUES (p_user_id, p_team_id, p_amount);

  v_new_points := COALESCE(v_prev_points, 0) + p_amount;

  SELECT COALESCE(MAX(level), 1) INTO v_new_level
  FROM stadium_level_thresholds
  WHERE required_points <= v_new_points;
  -- 레벨은 내리지 않는다 (기존 라우트와 동일 — 상향만)
  v_new_level := GREATEST(v_new_level, COALESCE(v_prev_level, 1));

  INSERT INTO stadium_contributions (user_id, team_id, points_contributed, last_synced_at)
  VALUES (p_user_id, p_team_id, p_amount, now())
  ON CONFLICT (user_id, team_id) DO UPDATE
    SET points_contributed = stadium_contributions.points_contributed + EXCLUDED.points_contributed,
        last_synced_at = now();

  SELECT COUNT(*) INTO v_fan_count
  FROM stadium_contributions
  WHERE team_id = p_team_id AND points_contributed > 0;

  UPDATE team_stadiums
  SET total_points = v_new_points,
      level = v_new_level,
      fan_count = v_fan_count,
      updated_at = now()
  WHERE team_id = p_team_id;

  RETURN jsonb_build_object(
    'success', true,
    'points_invested', p_amount,
    'new_total_points', v_new_points,
    'new_level', v_new_level,
    'leveled_up', v_new_level > COALESCE(v_prev_level, 1),
    'available_after', v_available - p_amount
  );
END;
$function$;

-- 경제 RPC 권한 규율 (20260718 재발 방지 규칙): 함수 생성/재정의 시 REVOKE 재첨부 필수.
-- REVOKE FROM anon 은 no-op — PUBLIC 에서 회수해야 한다 (gotcha 실사고).
REVOKE EXECUTE ON FUNCTION public.invest_stadium_points(text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invest_stadium_points(text, text, integer)
  TO service_role;
