-- ============================================================
-- metaverse_award_flair_karma RPC 업데이트 — 일일 카르마 cap + audit log
--
-- 변경점:
-- 1) 같은 (user_id, team_id) 조합의 당일 누적이 DAILY_CAP (100P) 를 넘지 않도록
--    delta 를 자동으로 제한. 초과분은 버려짐. 반환값에 capped: bool 포함.
-- 2) 매 적립마다 stadium_investments 테이블에 audit row 추가 — cap 계산 근거 +
--    향후 리더보드·월별 통계 가능.
--
-- 정책: 글 스팸 방지. 100점 = 게시글 10건 혹은 댓글 100건에 해당.
-- ============================================================

CREATE OR REPLACE FUNCTION metaverse_award_flair_karma(
  p_user_id text,
  p_team_id text,
  p_delta int,
  p_source text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_daily_cap int := 100;
  v_today_total bigint;
  v_effective_delta int;
  v_new_team_total bigint;
  v_new_level int;
  v_new_balance int;
BEGIN
  IF p_delta <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'delta must be positive');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM team_map_pins WHERE team_id = p_team_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'invalid team_id');
  END IF;

  -- Daily cap — 오늘 이 유저가 이 팀에 이미 쌓은 점수 합계
  SELECT COALESCE(SUM(points_invested), 0) INTO v_today_total
    FROM stadium_investments
    WHERE user_id = p_user_id
      AND team_id = p_team_id
      AND created_at >= date_trunc('day', now());

  v_effective_delta := LEAST(p_delta, GREATEST(0, v_daily_cap - v_today_total::int));

  IF v_effective_delta <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'delta', 0,
      'capped', true,
      'today_total', v_today_total,
      'source', p_source
    );
  END IF;

  -- 1) 팀별 기여도 upsert
  INSERT INTO stadium_contributions (user_id, team_id, points_contributed, last_synced_at)
    VALUES (p_user_id, p_team_id, v_effective_delta, now())
    ON CONFLICT (user_id, team_id) DO UPDATE
      SET points_contributed = stadium_contributions.points_contributed + v_effective_delta,
          last_synced_at = now();

  -- 2) 팀 경기장 합계 + 레벨 재계산
  UPDATE team_stadiums
    SET total_points = total_points + v_effective_delta, updated_at = now()
    WHERE team_id = p_team_id
    RETURNING total_points INTO v_new_team_total;

  SELECT COALESCE(MAX(level), 1) INTO v_new_level
    FROM stadium_level_thresholds
    WHERE required_points <= COALESCE(v_new_team_total, 0);

  UPDATE team_stadiums
    SET level = v_new_level
    WHERE team_id = p_team_id AND level < v_new_level;

  -- 3) spendable 활동 포인트
  INSERT INTO metaverse_user_activity_balance (user_id, spendable_points, lifetime_earned)
    VALUES (p_user_id, v_effective_delta, v_effective_delta)
    ON CONFLICT (user_id) DO UPDATE
      SET spendable_points = metaverse_user_activity_balance.spendable_points + v_effective_delta,
          lifetime_earned = metaverse_user_activity_balance.lifetime_earned + v_effective_delta,
          updated_at = now()
    RETURNING spendable_points INTO v_new_balance;

  -- 4) audit log — cap 계산 근거이자 리더보드/통계 소스
  INSERT INTO stadium_investments (user_id, team_id, points_invested)
    VALUES (p_user_id, p_team_id, v_effective_delta);

  RETURN jsonb_build_object(
    'success', true,
    'delta', v_effective_delta,
    'capped', v_effective_delta < p_delta,
    'today_total', v_today_total + v_effective_delta,
    'team_total', v_new_team_total,
    'team_level', v_new_level,
    'new_balance', v_new_balance,
    'source', p_source
  );
END;
$$;

-- 일일 cap 체크에 쓰일 인덱스 — (user_id, team_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_stadium_investments_user_team_time
  ON stadium_investments(user_id, team_id, created_at DESC);
