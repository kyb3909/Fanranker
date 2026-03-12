-- =============================================
-- 형용사 칭호 자동 부여 함수
-- 포인트 적립 후 호출되어 조건 달성 시 칭호 자동 지급
-- =============================================

CREATE OR REPLACE FUNCTION check_achievements(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_newly_earned text[] := '{}';
  v_adj_id uuid;
  v_post_count integer;
  v_comment_count integer;
  v_vote_received integer;
  v_board_count_lv3 integer;
  v_board_count_lv5 integer;
  v_football_level integer;
  v_movies_level integer;
  v_max_posts_in_board integer;
BEGIN

  -- ============================================
  -- 1) 새내기: 첫 글 작성
  -- ============================================
  SELECT count(*) INTO v_post_count
  FROM posts WHERE user_id = p_user_id AND deleted_at IS NULL;

  IF v_post_count >= 1 THEN
    SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'newcomer';
    IF v_adj_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
    ) THEN
      INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
      v_newly_earned := array_append(v_newly_earned, '새내기');
    END IF;
  END IF;

  -- ============================================
  -- 2) 수다쟁이: 댓글 100개 작성
  -- ============================================
  SELECT count(*) INTO v_comment_count
  FROM comments WHERE user_id = p_user_id AND deleted_at IS NULL;

  IF v_comment_count >= 100 THEN
    SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'chatterbox';
    IF v_adj_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
    ) THEN
      INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
      v_newly_earned := array_append(v_newly_earned, '수다쟁이');
    END IF;
  END IF;

  -- ============================================
  -- 3) 인기쟁이: 좋아요 100개 받기 (전체 게시글 합산)
  -- ============================================
  SELECT COALESCE(sum(vote_count), 0) INTO v_vote_received
  FROM posts WHERE user_id = p_user_id AND deleted_at IS NULL AND vote_count > 0;

  IF v_vote_received >= 100 THEN
    SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'popular';
    IF v_adj_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
    ) THEN
      INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
      v_newly_earned := array_append(v_newly_earned, '인기쟁이');
    END IF;
  END IF;

  -- ============================================
  -- 4) 열정적인: 한 게시판에 글 50개 작성
  -- ============================================
  SELECT COALESCE(max(cnt), 0) INTO v_max_posts_in_board
  FROM (
    SELECT count(*) as cnt
    FROM posts WHERE user_id = p_user_id AND deleted_at IS NULL
    GROUP BY community_slug
  ) sub;

  IF v_max_posts_in_board >= 50 THEN
    SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'passionate';
    IF v_adj_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
    ) THEN
      INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
      v_newly_earned := array_append(v_newly_earned, '열정적인');
    END IF;
  END IF;

  -- ============================================
  -- 5) 축잘알: 축구 게시판 Lv.5 달성
  -- ============================================
  SELECT COALESCE(level, 1) INTO v_football_level
  FROM user_board_points WHERE user_id = p_user_id AND board_slug = 'football';

  IF v_football_level >= 5 THEN
    SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'knows-football';
    IF v_adj_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
    ) THEN
      INSERT INTO user_adj_titles (user_id, adj_title_id, board_slug)
      VALUES (p_user_id, v_adj_id, 'football');
      v_newly_earned := array_append(v_newly_earned, '축잘알');
    END IF;
  END IF;

  -- ============================================
  -- 6) 감성적인: 영화 게시판 Lv.5 달성
  -- ============================================
  SELECT COALESCE(level, 1) INTO v_movies_level
  FROM user_board_points WHERE user_id = p_user_id AND board_slug = 'movies';

  IF v_movies_level >= 5 THEN
    SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'emotional';
    IF v_adj_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
    ) THEN
      INSERT INTO user_adj_titles (user_id, adj_title_id, board_slug)
      VALUES (p_user_id, v_adj_id, 'movies');
      v_newly_earned := array_append(v_newly_earned, '감성적인');
    END IF;
  END IF;

  -- ============================================
  -- 7) 덕통사고: 3개 이상 게시판에서 Lv.3 달성
  -- ============================================
  SELECT count(*) INTO v_board_count_lv3
  FROM user_board_points WHERE user_id = p_user_id AND level >= 3;

  IF v_board_count_lv3 >= 3 THEN
    SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'accident';
    IF v_adj_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
    ) THEN
      INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
      v_newly_earned := array_append(v_newly_earned, '덕통사고');
    END IF;
  END IF;

  -- ============================================
  -- 8) 올라운더: 5개 이상 게시판에서 Lv.3 달성
  -- ============================================
  IF v_board_count_lv3 >= 5 THEN
    SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'allrounder';
    IF v_adj_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
    ) THEN
      INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
      v_newly_earned := array_append(v_newly_earned, '올라운더');
    END IF;
  END IF;

  -- ============================================
  -- 9) 예언자: 승부예측 10연속 적중
  -- (prediction_slips 테이블의 최근 연속 적중 체크)
  -- ============================================
  DECLARE
    v_consecutive_hits integer := 0;
    v_slip record;
  BEGIN
    FOR v_slip IN
      SELECT result FROM prediction_slips
      WHERE user_id = p_user_id AND result IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 20
    LOOP
      IF v_slip.result = 'win' THEN
        v_consecutive_hits := v_consecutive_hits + 1;
      ELSE
        EXIT;
      END IF;
    END LOOP;

    IF v_consecutive_hits >= 10 THEN
      SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'prophet';
      IF v_adj_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
      ) THEN
        INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
        v_newly_earned := array_append(v_newly_earned, '예언자');
      END IF;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    -- prediction_slips 테이블이 없으면 무시
    NULL;
  END;

  -- ============================================
  -- 10) 똥손의: 승부예측 10연속 실패
  -- ============================================
  DECLARE
    v_consecutive_misses integer := 0;
    v_slip2 record;
  BEGIN
    FOR v_slip2 IN
      SELECT result FROM prediction_slips
      WHERE user_id = p_user_id AND result IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 20
    LOOP
      IF v_slip2.result = 'lose' THEN
        v_consecutive_misses := v_consecutive_misses + 1;
      ELSE
        EXIT;
      END IF;
    END LOOP;

    IF v_consecutive_misses >= 10 THEN
      SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'butterfingers';
      IF v_adj_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
      ) THEN
        INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
        v_newly_earned := array_append(v_newly_earned, '똥손의');
      END IF;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- ============================================
  -- 11) 천재: 승부예측 정확도 80%+ (최소 50회)
  -- ============================================
  DECLARE
    v_total_predictions integer;
    v_wins integer;
  BEGIN
    SELECT count(*), count(*) FILTER (WHERE result = 'win')
    INTO v_total_predictions, v_wins
    FROM prediction_slips
    WHERE user_id = p_user_id AND result IS NOT NULL;

    IF v_total_predictions >= 50 AND (v_wins::numeric / v_total_predictions) >= 0.8 THEN
      SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'genius';
      IF v_adj_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
      ) THEN
        INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
        v_newly_earned := array_append(v_newly_earned, '천재');
      END IF;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- ============================================
  -- 연속 출석 칭호 (streak-7, streak-30, streak-100, streak-365)
  -- daily_point_caps에서 연속 날짜 체크
  -- ============================================
  DECLARE
    v_streak integer := 0;
    v_check_date date := CURRENT_DATE;
    v_found boolean;
  BEGIN
    LOOP
      SELECT EXISTS(
        SELECT 1 FROM daily_point_caps
        WHERE user_id = p_user_id AND date = v_check_date
      ) INTO v_found;

      IF v_found THEN
        v_streak := v_streak + 1;
        v_check_date := v_check_date - 1;
      ELSE
        EXIT;
      END IF;

      -- 최대 365일까지만 체크
      IF v_streak >= 365 THEN EXIT; END IF;
    END LOOP;

    -- 7일
    IF v_streak >= 7 THEN
      SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'streak-7';
      IF v_adj_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
      ) THEN
        INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
        v_newly_earned := array_append(v_newly_earned, '꾸준한');
      END IF;
    END IF;

    -- 30일
    IF v_streak >= 30 THEN
      SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'streak-30';
      IF v_adj_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
      ) THEN
        INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
        v_newly_earned := array_append(v_newly_earned, '성실한');
      END IF;
    END IF;

    -- 100일
    IF v_streak >= 100 THEN
      SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'streak-100';
      IF v_adj_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
      ) THEN
        INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
        v_newly_earned := array_append(v_newly_earned, '철인의');
      END IF;
    END IF;

    -- 365일
    IF v_streak >= 365 THEN
      SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'streak-365';
      IF v_adj_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
      ) THEN
        INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
        v_newly_earned := array_append(v_newly_earned, '전설의');
      END IF;
    END IF;
  END;

  RETURN jsonb_build_object(
    'newly_earned', v_newly_earned,
    'count', array_length(v_newly_earned, 1)
  );
END;
$$;

-- =============================================
-- award_points 후 자동으로 업적 체크하도록 연결
-- award_points 함수 끝에 check_achievements 호출 추가
-- =============================================

CREATE OR REPLACE FUNCTION award_points(
  p_user_id text,
  p_board_slug text,
  p_amount integer,
  p_type text,
  p_description text DEFAULT NULL,
  p_related_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_daily_earned integer;
  v_daily_cap constant integer := 100;
  v_actual_amount integer;
  v_new_total integer;
  v_new_available integer;
  v_new_level integer;
  v_achievements jsonb;
BEGIN
  -- 양수(적립)일 때만 일일 상한 체크
  IF p_amount > 0 THEN
    INSERT INTO daily_point_caps (user_id, board_slug, date, earned_today)
    VALUES (p_user_id, p_board_slug, CURRENT_DATE, 0)
    ON CONFLICT (user_id, board_slug, date) DO NOTHING;

    SELECT earned_today INTO v_daily_earned
    FROM daily_point_caps
    WHERE user_id = p_user_id AND board_slug = p_board_slug AND date = CURRENT_DATE;

    IF v_daily_earned >= v_daily_cap THEN
      RETURN jsonb_build_object('success', false, 'reason', 'daily_cap_reached');
    END IF;

    v_actual_amount := LEAST(p_amount, v_daily_cap - v_daily_earned);

    UPDATE daily_point_caps
    SET earned_today = earned_today + v_actual_amount
    WHERE user_id = p_user_id AND board_slug = p_board_slug AND date = CURRENT_DATE;
  ELSE
    v_actual_amount := p_amount;
  END IF;

  -- 포인트 upsert
  INSERT INTO user_board_points (user_id, board_slug, total_points, available_points, level, updated_at)
  VALUES (
    p_user_id, p_board_slug,
    GREATEST(0, v_actual_amount),
    v_actual_amount,
    1,
    now()
  )
  ON CONFLICT (user_id, board_slug) DO UPDATE SET
    total_points = CASE
      WHEN v_actual_amount > 0
      THEN user_board_points.total_points + v_actual_amount
      ELSE user_board_points.total_points
    END,
    available_points = GREATEST(0, user_board_points.available_points + v_actual_amount),
    updated_at = now()
  RETURNING total_points, available_points INTO v_new_total, v_new_available;

  -- 레벨 재계산
  v_new_level := get_level_for_points(v_new_total);
  UPDATE user_board_points
  SET level = v_new_level
  WHERE user_id = p_user_id AND board_slug = p_board_slug;

  -- 트랜잭션 기록
  INSERT INTO point_transactions (user_id, board_slug, amount, transaction_type, description, related_id)
  VALUES (p_user_id, p_board_slug, v_actual_amount, p_type, p_description, p_related_id);

  -- 업적 자동 체크
  v_achievements := check_achievements(p_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'amount', v_actual_amount,
    'total_points', v_new_total,
    'available_points', v_new_available,
    'level', v_new_level,
    'achievements', v_achievements
  );
END;
$$;
