-- =============================================
-- 레벨 시스템 제거 + 추천 포인트 적립 기반 마련
-- 레벨 대신 total_points 기준으로 칭호 구매 제한
-- =============================================

-- 1) noun_titles에 required_points 컬럼 추가
-- 기존 required_level → 포인트 임계값으로 변환
ALTER TABLE noun_titles ADD COLUMN IF NOT EXISTS required_points integer NOT NULL DEFAULT 0;

-- 기존 레벨 → 포인트 매핑 적용
-- Lv1=0, Lv2=50, Lv3=150, Lv4=400, Lv5=800,
-- Lv6=1500, Lv7=3000, Lv8=5000, Lv9=10000, Lv10=20000
UPDATE noun_titles SET required_points = CASE required_level
  WHEN 1 THEN 0
  WHEN 2 THEN 50
  WHEN 3 THEN 150
  WHEN 4 THEN 400
  WHEN 5 THEN 800
  WHEN 6 THEN 1500
  WHEN 7 THEN 3000
  WHEN 8 THEN 5000
  WHEN 9 THEN 10000
  WHEN 10 THEN 20000
  ELSE 0
END;

-- 2) award_points 함수 재작성 — 레벨 계산 제거
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

  -- 포인트 upsert (레벨 계산 없이)
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
    'achievements', v_achievements
  );
END;
$$;

-- 3) purchase_noun_title 함수 — 레벨 대신 total_points 체크
CREATE OR REPLACE FUNCTION purchase_noun_title(
  p_user_id text,
  p_noun_title_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_title noun_titles%ROWTYPE;
  v_user_points user_board_points%ROWTYPE;
  v_already_owned boolean;
BEGIN
  -- 칭호 정보 조회
  SELECT * INTO v_title FROM noun_titles WHERE id = p_noun_title_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'title_not_found');
  END IF;

  -- 이미 보유 여부
  SELECT EXISTS(
    SELECT 1 FROM user_noun_titles WHERE user_id = p_user_id AND noun_title_id = p_noun_title_id
  ) INTO v_already_owned;
  IF v_already_owned THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_owned');
  END IF;

  -- 유저 포인트 조회
  SELECT * INTO v_user_points
  FROM user_board_points
  WHERE user_id = p_user_id AND board_slug = v_title.board_slug;

  -- 누적 포인트 체크 (레벨 대신)
  IF COALESCE(v_user_points.total_points, 0) < v_title.required_points THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_total_points',
      'required', v_title.required_points, 'current', COALESCE(v_user_points.total_points, 0));
  END IF;

  -- 가격 체크 (무료가 아닌 경우)
  IF v_title.price > 0 THEN
    IF v_user_points.available_points IS NULL OR v_user_points.available_points < v_title.price THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_points',
        'required', v_title.price, 'current', COALESCE(v_user_points.available_points, 0));
    END IF;

    -- 포인트 차감
    UPDATE user_board_points
    SET available_points = available_points - v_title.price, updated_at = now()
    WHERE user_id = p_user_id AND board_slug = v_title.board_slug;

    -- 트랜잭션 기록
    INSERT INTO point_transactions (user_id, board_slug, amount, transaction_type, description, related_id)
    VALUES (p_user_id, v_title.board_slug, -v_title.price, 'shop_purchase', '명사 칭호 구매: ' || v_title.title, p_noun_title_id::text);
  END IF;

  -- 구매 기록
  INSERT INTO user_noun_titles (user_id, noun_title_id)
  VALUES (p_user_id, p_noun_title_id);

  RETURN jsonb_build_object('success', true, 'title', v_title.title, 'spent', v_title.price);
END;
$$;

-- 4) check_achievements — 레벨 참조를 포인트 참조로 변경
CREATE OR REPLACE FUNCTION check_achievements(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_newly_earned text[] := '{}';
  v_adj_id uuid;
  v_post_count integer;
  v_comment_count integer;
  v_vote_received integer;
  v_board_count_pts150 integer;
  v_football_points integer;
  v_movies_points integer;
  v_max_posts_in_board integer;
BEGIN

  -- 1) 새내기: 첫 글 작성
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

  -- 2) 수다쟁이: 댓글 100개 작성
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

  -- 3) 인기쟁이: 좋아요 100개 받기
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

  -- 4) 열정적인: 한 게시판에 글 50개 작성
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

  -- 5) 축잘알: 축구 게시판 800P 달성 (구 Lv.5)
  SELECT COALESCE(total_points, 0) INTO v_football_points
  FROM user_board_points WHERE user_id = p_user_id AND board_slug = 'football';

  IF v_football_points >= 800 THEN
    SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'knows-football';
    IF v_adj_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
    ) THEN
      INSERT INTO user_adj_titles (user_id, adj_title_id, board_slug)
      VALUES (p_user_id, v_adj_id, 'football');
      v_newly_earned := array_append(v_newly_earned, '축잘알');
    END IF;
  END IF;

  -- 6) 감성적인: 영화 게시판 800P 달성 (구 Lv.5)
  SELECT COALESCE(total_points, 0) INTO v_movies_points
  FROM user_board_points WHERE user_id = p_user_id AND board_slug = 'movies';

  IF v_movies_points >= 800 THEN
    SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'emotional';
    IF v_adj_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
    ) THEN
      INSERT INTO user_adj_titles (user_id, adj_title_id, board_slug)
      VALUES (p_user_id, v_adj_id, 'movies');
      v_newly_earned := array_append(v_newly_earned, '감성적인');
    END IF;
  END IF;

  -- 7) 덕통사고: 3개 이상 게시판에서 150P 달성 (구 Lv.3)
  SELECT count(*) INTO v_board_count_pts150
  FROM user_board_points WHERE user_id = p_user_id AND total_points >= 150;

  IF v_board_count_pts150 >= 3 THEN
    SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'accident';
    IF v_adj_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
    ) THEN
      INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
      v_newly_earned := array_append(v_newly_earned, '덕통사고');
    END IF;
  END IF;

  -- 8) 올라운더: 5개 이상 게시판에서 150P 달성 (구 Lv.3)
  IF v_board_count_pts150 >= 5 THEN
    SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'allrounder';
    IF v_adj_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
    ) THEN
      INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
      v_newly_earned := array_append(v_newly_earned, '올라운더');
    END IF;
  END IF;

  -- 9) 예언자: 승부예측 10연속 적중
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
    NULL;
  END;

  -- 10) 똥손의: 승부예측 10연속 실패
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

  -- 11) 천재: 승부예측 정확도 80%+ (최소 50회)
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

  -- 연속 출석 칭호
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

      IF v_streak >= 365 THEN EXIT; END IF;
    END LOOP;

    IF v_streak >= 7 THEN
      SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'streak-7';
      IF v_adj_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
      ) THEN
        INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
        v_newly_earned := array_append(v_newly_earned, '꾸준한');
      END IF;
    END IF;

    IF v_streak >= 30 THEN
      SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'streak-30';
      IF v_adj_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
      ) THEN
        INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
        v_newly_earned := array_append(v_newly_earned, '성실한');
      END IF;
    END IF;

    IF v_streak >= 100 THEN
      SELECT id INTO v_adj_id FROM adj_titles WHERE slug = 'streak-100';
      IF v_adj_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM user_adj_titles WHERE user_id = p_user_id AND adj_title_id = v_adj_id
      ) THEN
        INSERT INTO user_adj_titles (user_id, adj_title_id) VALUES (p_user_id, v_adj_id);
        v_newly_earned := array_append(v_newly_earned, '철인의');
      END IF;
    END IF;

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

-- 5) adj_titles 설명 업데이트 (레벨 → 포인트 기준)
UPDATE adj_titles SET description = '축구 게시판 800P 달성' WHERE slug = 'knows-football';
UPDATE adj_titles SET description = '영화 게시판 800P 달성' WHERE slug = 'emotional';
UPDATE adj_titles SET description = '3개 이상 게시판에서 150P 달성' WHERE slug = 'accident';
UPDATE adj_titles SET description = '5개 이상 게시판에서 150P 달성' WHERE slug = 'allrounder';
