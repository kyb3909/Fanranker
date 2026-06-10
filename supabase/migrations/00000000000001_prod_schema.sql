


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."admin_adjust_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."admin_adjust_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_adjust_tokens"("p_user_id" "text", "p_amount" integer, "p_description" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."admin_adjust_tokens"("p_user_id" "text", "p_amount" integer, "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_flair_score"("p_user_id" "text", "p_flair_id" "uuid", "p_delta" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_new_total int;
BEGIN
  IF p_user_id IS NULL OR p_flair_id IS NULL OR p_delta = 0 THEN
    RETURN;
  END IF;

  INSERT INTO user_flair_scores (user_id, flair_id, score_total, score_balance, last_at)
  VALUES (p_user_id, p_flair_id, GREATEST(0, p_delta), GREATEST(0, p_delta), now())
  ON CONFLICT (user_id, flair_id) DO UPDATE
    SET score_total   = GREATEST(0, user_flair_scores.score_total   + p_delta),
        score_balance = GREATEST(0, user_flair_scores.score_balance + p_delta),
        last_at       = now()
  RETURNING score_total INTO v_new_total;

  -- 임계값 도달한 호칭 자동 unlock (이미 잠금 해제된 건 ON CONFLICT 로 무시)
  IF p_delta > 0 AND v_new_total > 0 THEN
    INSERT INTO user_unlocked_titles (user_id, title_id)
    SELECT p_user_id, ft.id
    FROM flair_titles ft
    WHERE ft.flair_id = p_flair_id
      AND ft.threshold <= v_new_total
    ON CONFLICT (user_id, title_id) DO NOTHING;
  END IF;
END;
$$;


ALTER FUNCTION "public"."apply_flair_score"("p_user_id" "text", "p_flair_id" "uuid", "p_delta" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_daily_round"("p_daily_id" "date", "p_daily_round_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- daily_round_id가 아직 없는 게임만 대상 (이미 할당된 건 스킵)
  UPDATE betman_games
  SET daily_round_id = p_daily_round_id
  WHERE daily_round_id IS NULL
    AND compute_daily_id(match_time) = p_daily_id;

  -- game_count 갱신
  UPDATE betman_daily_rounds
  SET game_count = (
    SELECT COUNT(*) FROM betman_games WHERE daily_round_id = p_daily_round_id
  ), updated_at = now()
  WHERE id = p_daily_round_id;
END;
$$;


ALTER FUNCTION "public"."assign_daily_round"("p_daily_id" "date", "p_daily_round_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_gold_balance_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_diff integer;
BEGIN
  v_diff := NEW.gold_balance - OLD.gold_balance;
  IF v_diff != 0 AND current_setting('app.skip_gold_audit', true) IS DISTINCT FROM 'true' THEN
    INSERT INTO public.gold_transactions (user_id, transaction_type, amount, balance_after, description)
    VALUES (NEW.user_id, 'admin_adjustment', v_diff, NEW.gold_balance, '잔액 직접 조정');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_gold_balance_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_points"("p_user_id" "text", "p_board_slug" "text", "p_amount" integer, "p_type" "text", "p_description" "text" DEFAULT NULL::"text", "p_related_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."award_points"("p_user_id" "text", "p_board_slug" "text", "p_amount" integer, "p_type" "text", "p_description" "text", "p_related_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."betman_check_sync_health"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sync_state RECORD;
  v_hours_since_sync NUMERIC;
  v_is_stale BOOLEAN;
  v_open_rounds INT;
  v_scheduled_games INT;
  v_result JSONB;
BEGIN
  -- 1. 최신 sync_state 조회
  SELECT *
  INTO v_sync_state
  FROM betman_sync_state
  ORDER BY updated_at DESC
  LIMIT 1;

  -- 동기화 경과 시간 계산
  IF v_sync_state.last_checked_at IS NOT NULL THEN
    v_hours_since_sync := EXTRACT(EPOCH FROM (NOW() - v_sync_state.last_checked_at)) / 3600;
  ELSE
    v_hours_since_sync := 999;
  END IF;

  v_is_stale := v_hours_since_sync > 3;

  -- 2. open 라운드 수
  SELECT COUNT(*) INTO v_open_rounds
  FROM betman_rounds WHERE status = 'open';

  -- 3. scheduled 게임 수
  SELECT COUNT(*) INTO v_scheduled_games
  FROM betman_games WHERE status = 'scheduled';

  -- 4. stale 상태이고 6시간 이상이면 resync 플래그 설정
  IF v_hours_since_sync > 6 AND v_sync_state.id IS NOT NULL THEN
    UPDATE betman_sync_state
    SET
      last_error = jsonb_build_object(
        'needs_resync', true,
        'requested_at', NOW()::TEXT,
        'reason', 'pg_cron_urgent',
        'hours_since_sync', v_hours_since_sync,
        'probe_range_start', (COALESCE(v_sync_state.latest_gm_ts::INT, 260022) + 1)::TEXT,
        'probe_range_end', (COALESCE(v_sync_state.latest_gm_ts::INT, 260022) + 5)::TEXT
      )::TEXT,
      last_sync_action = 'pg_cron_watchdog',
      updated_at = NOW()
    WHERE id = v_sync_state.id;
  END IF;

  -- 5. open 라운드 중 scheduled 게임이 없는 것 자동 close
  UPDATE betman_rounds
  SET status = 'closed', updated_at = NOW()
  WHERE status = 'open'
    AND id NOT IN (
      SELECT DISTINCT round_id
      FROM betman_games
      WHERE status = 'scheduled'
    );

  -- 결과 반환
  v_result := jsonb_build_object(
    'hours_since_sync', ROUND(v_hours_since_sync, 1),
    'is_stale', v_is_stale,
    'latest_gm_ts', v_sync_state.latest_gm_ts,
    'last_action', v_sync_state.last_sync_action,
    'open_rounds', v_open_rounds,
    'scheduled_games', v_scheduled_games,
    'checked_at', NOW()::TEXT
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."betman_check_sync_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."betman_update_sync_state"("new_gm_ts" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  state_id uuid;
  current_rounds text[];
BEGIN
  SELECT id, active_rounds INTO state_id, current_rounds
  FROM betman_sync_state
  ORDER BY updated_at DESC
  LIMIT 1;

  IF state_id IS NULL THEN
    INSERT INTO betman_sync_state (latest_gm_ts, active_rounds, last_checked_at, updated_at)
    VALUES (new_gm_ts, ARRAY[new_gm_ts], now(), now());
  ELSE
    -- active_rounds에 없으면 추가, 최근 5개만 유지
    IF NOT (new_gm_ts = ANY(current_rounds)) THEN
      current_rounds := array_append(current_rounds, new_gm_ts);
      IF array_length(current_rounds, 1) > 5 THEN
        current_rounds := current_rounds[array_length(current_rounds, 1) - 4 : array_length(current_rounds, 1)];
      END IF;
    END IF;

    UPDATE betman_sync_state
    SET latest_gm_ts = new_gm_ts,
        active_rounds = current_rounds,
        last_checked_at = now(),
        updated_at = now()
    WHERE id = state_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."betman_update_sync_state"("new_gm_ts" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calc_streaks"("p_user_id" "text", "p_sport" "text" DEFAULT NULL::"text") RETURNS TABLE("current_streak" integer, "best_win" integer, "worst_lose" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH ordered AS (
    SELECT 
      p.is_correct,
      ROW_NUMBER() OVER (ORDER BY g.match_time, p.id) as rn
    FROM betman_predictions p
    JOIN betman_games g ON g.id = p.game_id
    WHERE p.user_id = p_user_id
      AND p.status = 'settled'
      AND p.is_correct IS NOT NULL
      AND (p_sport IS NULL OR g.sport = p_sport)
  ),
  grouped AS (
    SELECT 
      is_correct,
      rn - ROW_NUMBER() OVER (PARTITION BY is_correct ORDER BY rn) as grp,
      rn
    FROM ordered
  ),
  streak_lengths AS (
    SELECT 
      is_correct, grp,
      COUNT(*)::int as len,
      MAX(rn)::int as max_rn
    FROM grouped
    GROUP BY is_correct, grp
  ),
  max_rn_val AS (SELECT COALESCE(MAX(rn), 0)::int as val FROM ordered)
  SELECT
    COALESCE(
      (SELECT CASE WHEN sl.is_correct THEN sl.len ELSE -sl.len END 
       FROM streak_lengths sl, max_rn_val m 
       WHERE sl.max_rn = m.val 
       LIMIT 1), 0
    )::int,
    COALESCE((SELECT MAX(len) FROM streak_lengths WHERE is_correct = true), 0)::int,
    COALESCE((SELECT MAX(len) FROM streak_lengths WHERE is_correct = false), 0)::int;
$$;


ALTER FUNCTION "public"."calc_streaks"("p_user_id" "text", "p_sport" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_post_temperature"("p_post_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_vote_count int;
  v_comment_count int;
  v_view_count int;
  v_created_at timestamptz;
  v_last_comment_at timestamptz;
  v_now timestamptz := now();
  v_post_age_hours float;
  v_comment_age_hours float;
  -- 가중치
  W_VOTE constant float := 12;
  W_COMMENT constant float := 10;
  W_VIEW constant float := 2;
  R_MAX constant float := 8;
  HALF_LIFE constant float := 24;
  B_MAX constant float := 3;
  -- 계산 변수
  v_e float;
  v_r float;
  v_d float;
  v_b float;
  v_p float;
  v_temp float;
BEGIN
  SELECT vote_count, comment_count, view_count, created_at, last_comment_at
  INTO v_vote_count, v_comment_count, v_view_count, v_created_at, v_last_comment_at
  FROM posts WHERE id = p_post_id;

  IF v_created_at IS NULL THEN RETURN 0; END IF;

  v_post_age_hours := EXTRACT(EPOCH FROM (v_now - v_created_at)) / 3600.0;
  v_vote_count := COALESCE(v_vote_count, 0);
  v_comment_count := COALESCE(v_comment_count, 0);
  v_view_count := COALESCE(v_view_count, 0);

  -- E: Engagement Score
  v_e := W_VOTE * ln(1 + GREATEST(v_vote_count, 0))
       + W_COMMENT * ln(1 + v_comment_count)
       + W_VIEW * ln(1 + v_view_count);

  -- R: 댓글 최신성 보너스
  v_r := 0;
  IF v_comment_count > 0 AND v_last_comment_at IS NOT NULL THEN
    v_comment_age_hours := EXTRACT(EPOCH FROM (v_now - v_last_comment_at)) / 3600.0;
    IF v_comment_age_hours <= 2 THEN
      v_r := R_MAX;
    ELSIF v_comment_age_hours <= 8 THEN
      v_r := R_MAX * (8 - v_comment_age_hours) / 6.0;
    END IF;
  END IF;

  -- D: 시간 감쇠 (반감기 24시간)
  v_d := power(2, -(v_post_age_hours / HALF_LIFE));

  -- B: 신규 글 부스트
  v_b := 0;
  IF v_post_age_hours <= 0.5 THEN
    v_b := B_MAX;
  ELSIF v_post_age_hours <= 2 THEN
    v_b := B_MAX * (2 - v_post_age_hours) / 1.5;
  END IF;

  -- P: 비추천 패널티
  v_p := 0;
  IF v_vote_count < 0 THEN
    v_p := 5 * ln(1 + abs(v_vote_count));
  END IF;

  -- 최종 온도
  v_temp := (v_e + v_r) * v_d + v_b - v_p;
  RETURN LEAST(100, GREATEST(0, ROUND(v_temp::numeric, 1)));
END;
$$;


ALTER FUNCTION "public"."calculate_post_temperature"("p_post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_increment_view_count"("post_id_param" "uuid", "ip_address_param" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  last_view_time timestamptz;
BEGIN
  SELECT MAX(viewed_at) INTO last_view_time
  FROM post_views
  WHERE post_id = post_id_param
    AND ip_hash = ip_address_param
    AND viewed_at > now() - INTERVAL '1 hour';

  RETURN last_view_time IS NULL;
END;
$$;


ALTER FUNCTION "public"."can_increment_view_count"("post_id_param" "uuid", "ip_address_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_post_comment"("user_id_param" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  last_comment_time timestamptz;
  cooldown_seconds integer := 10;
BEGIN
  -- Get last comment time for this user
  SELECT last_comment_at INTO last_comment_time
  FROM comment_cooldowns
  WHERE user_id = user_id_param;

  -- If no previous comment, allow
  IF last_comment_time IS NULL THEN
    RETURN true;
  END IF;

  -- Check if cooldown period has passed
  IF now() - last_comment_time >= INTERVAL '10 seconds' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;


ALTER FUNCTION "public"."can_post_comment"("user_id_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_achievements"("p_user_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."check_achievements"("p_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_character_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  character_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO character_count
  FROM wrestling_characters
  WHERE owner_user_id = NEW.owner_user_id;

  IF character_count >= 3 THEN
    RAISE EXCEPTION '캐릭터는 최대 3개까지만 저장할 수 있습니다. (현재: %개)', character_count;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_character_limit"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_character_limit"() IS 'PRD 요구사항: 유저당 최대 3명의 캐릭터 제한';



CREATE OR REPLACE FUNCTION "public"."check_prediction_allowed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  match_record RECORD;
BEGIN
  SELECT * INTO match_record FROM matches WHERE id = NEW.match_id;
  
  IF match_record IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;
  
  -- Check if match has already started
  IF match_record.time_status != 0 THEN
    RAISE EXCEPTION 'Match has already started, predictions are closed';
  END IF;
  
  -- Check if predictions are still open
  IF match_record.is_prediction_open = false THEN
    RAISE EXCEPTION 'Predictions are closed for this match';
  END IF;
  
  -- Check if prediction close time has passed
  IF match_record.prediction_close_time IS NOT NULL AND NOW() > match_record.prediction_close_time THEN
    RAISE EXCEPTION 'Prediction deadline has passed';
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_prediction_allowed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_total_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (NEW.power + NEW.stamina + NEW.guts + NEW.technique + NEW.speed + NEW.charisma) > 400 THEN
    RAISE EXCEPTION '능력치 총합이 400을 초과할 수 없습니다. 현재: %', 
      (NEW.power + NEW.stamina + NEW.guts + NEW.technique + NEW.speed + NEW.charisma);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_total_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_ticker_comments"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM ticker_comments WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_ticker_comments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_ticker_items"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM news_ticker_items WHERE posted_at < now() - interval '48 hours';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_ticker_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_temperature_queue"("days_old" integer DEFAULT 7) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN 0;
END;
$$;


ALTER FUNCTION "public"."cleanup_temperature_queue"("days_old" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_daily_id"("match_time" timestamp with time zone) RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT DATE((match_time AT TIME ZONE 'Asia/Seoul') - INTERVAL '8 hours');
$$;


ALTER FUNCTION "public"."compute_daily_id"("match_time" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_comment_count_on_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only decrement if comment was not already deleted
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE posts
    SET comment_count = GREATEST(COALESCE(comment_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."decrement_comment_count_on_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_board_points"("p_user_id" "text", "p_board_slug" "text", "p_amount" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."deduct_board_points"("p_user_id" "text", "p_board_slug" "text", "p_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."donate_flair_score_to_team"("p_user_id" "text", "p_flair_id" "uuid", "p_amount" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."donate_flair_score_to_team"("p_user_id" "text", "p_flair_id" "uuid", "p_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_temperature_update"("p_post_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM update_temperature_score(p_post_id);
END;
$$;


ALTER FUNCTION "public"."enqueue_temperature_update"("p_post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_daily_token_reset"("target_user_id" "text") RETURNS integer
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."ensure_daily_token_reset"("target_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."escrow_hold_gold"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order record;
  v_client_balance integer;
  v_new_balance integer;
BEGIN
  SELECT * INTO v_order
  FROM commission_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', '주문을 찾을 수 없습니다.');
  END IF;

  IF v_order.escrow_held = true THEN
    RETURN jsonb_build_object('success', false, 'error_message', '이미 에스크로가 설정되어 있습니다.');
  END IF;

  SELECT gold_balance INTO v_client_balance
  FROM user_gold
  WHERE user_id = v_order.client_id
  FOR UPDATE;

  IF v_client_balance IS NULL OR v_client_balance < v_order.price_gold THEN
    RETURN jsonb_build_object('success', false, 'error_message', '골드가 부족합니다. 필요: ' || v_order.price_gold || ', 보유: ' || COALESCE(v_client_balance, 0));
  END IF;

  v_new_balance := v_client_balance - v_order.price_gold;

  -- Skip audit trigger (we log transactions manually below)
  PERFORM set_config('app.skip_gold_audit', 'true', true);

  UPDATE user_gold
  SET gold_balance = v_new_balance, updated_at = now()
  WHERE user_id = v_order.client_id;

  INSERT INTO gold_transactions (user_id, transaction_type, amount, balance_after, description, related_id)
  VALUES (v_order.client_id, 'commission_escrow_hold', -v_order.price_gold, v_new_balance,
          '커미션 에스크로 보관', p_order_id);

  INSERT INTO commission_escrow (order_id, action, amount, from_user_id, note)
  VALUES (p_order_id, 'hold', v_order.price_gold, v_order.client_id, '클라이언트 결제');

  UPDATE commission_orders
  SET escrow_held = true, updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'held_amount', v_order.price_gold, 'remaining_balance', v_new_balance);
END;
$$;


ALTER FUNCTION "public"."escrow_hold_gold"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."escrow_hold_gold"("p_user_id" "text", "p_order_id" "uuid", "p_amount" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
BEGIN
  -- Lock user_gold row
  SELECT gold_balance INTO v_balance
  FROM user_gold
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', '골드 계정이 없습니다.');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error_message', '골드가 부족합니다. 현재: ' || v_balance || ', 필요: ' || p_amount);
  END IF;

  v_new_balance := v_balance - p_amount;

  -- Deduct gold
  UPDATE user_gold
  SET gold_balance = v_new_balance, updated_at = now()
  WHERE user_id = p_user_id;

  -- Record transaction
  INSERT INTO gold_transactions (user_id, transaction_type, amount, balance_after, description, related_id)
  VALUES (p_user_id, 'commission_escrow_hold', -p_amount, v_new_balance, '커미션 에스크로 홀드', p_order_id);

  -- Record escrow
  INSERT INTO commission_escrow (order_id, action, amount, from_user_id, note)
  VALUES (p_order_id, 'hold', p_amount, p_user_id, '주문 에스크로 보관');

  -- Mark order as escrow held
  UPDATE commission_orders
  SET escrow_held = true, updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;


ALTER FUNCTION "public"."escrow_hold_gold"("p_user_id" "text", "p_order_id" "uuid", "p_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."escrow_refund_gold"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order record;
  v_client_balance integer;
  v_new_balance integer;
BEGIN
  SELECT * INTO v_order
  FROM commission_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', '주문을 찾을 수 없습니다.');
  END IF;

  IF v_order.escrow_held = false THEN
    RETURN jsonb_build_object('success', false, 'error_message', '에스크로가 설정되지 않았습니다.');
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error_message', '이미 처리된 주문입니다.');
  END IF;

  SELECT gold_balance INTO v_client_balance
  FROM user_gold
  WHERE user_id = v_order.client_id
  FOR UPDATE;

  IF v_client_balance IS NULL THEN
    INSERT INTO user_gold (user_id, gold_balance)
    VALUES (v_order.client_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    v_client_balance := 0;
  END IF;

  v_new_balance := v_client_balance + v_order.price_gold;

  -- Skip audit trigger (we log transactions manually below)
  PERFORM set_config('app.skip_gold_audit', 'true', true);

  UPDATE user_gold
  SET gold_balance = v_new_balance, updated_at = now()
  WHERE user_id = v_order.client_id;

  INSERT INTO gold_transactions (user_id, transaction_type, amount, balance_after, description, related_id)
  VALUES (v_order.client_id, 'commission_escrow_refund', v_order.price_gold, v_new_balance,
          '커미션 에스크로 환불', p_order_id);

  INSERT INTO commission_escrow (order_id, action, amount, to_user_id, note)
  VALUES (p_order_id, 'refund', v_order.price_gold, v_order.client_id, '클라이언트 환불');

  UPDATE commission_orders
  SET escrow_held = false, status = 'cancelled', updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'refunded_amount', v_order.price_gold, 'new_balance', v_new_balance);
END;
$$;


ALTER FUNCTION "public"."escrow_refund_gold"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."escrow_refund_gold"("p_order_id" "uuid", "p_refund_percent" integer DEFAULT 100) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order record;
  v_refund_amount integer;
  v_artist_amount integer;
  v_client_balance integer;
  v_new_client_balance integer;
  v_artist_balance integer;
  v_new_artist_balance integer;
BEGIN
  -- Lock order
  SELECT * INTO v_order
  FROM commission_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', '주문을 찾을 수 없습니다.');
  END IF;

  IF v_order.escrow_held = false THEN
    RETURN jsonb_build_object('success', false, 'error_message', '에스크로가 설정되지 않았습니다.');
  END IF;

  -- Calculate refund
  v_refund_amount := (v_order.price_gold * p_refund_percent) / 100;
  v_artist_amount := v_order.price_gold - v_refund_amount;

  -- Refund client
  SELECT gold_balance INTO v_client_balance
  FROM user_gold
  WHERE user_id = v_order.client_id
  FOR UPDATE;

  IF v_client_balance IS NULL THEN
    v_client_balance := 0;
  END IF;

  v_new_client_balance := v_client_balance + v_refund_amount;

  UPDATE user_gold
  SET gold_balance = v_new_client_balance, updated_at = now()
  WHERE user_id = v_order.client_id;

  INSERT INTO gold_transactions (user_id, transaction_type, amount, balance_after, description, related_id)
  VALUES (v_order.client_id, 'commission_escrow_refund', v_refund_amount, v_new_client_balance, '커미션 환불 (' || p_refund_percent || '%)', p_order_id);

  INSERT INTO commission_escrow (order_id, action, amount, to_user_id, note)
  VALUES (p_order_id, 'refund', v_refund_amount, v_order.client_id, p_refund_percent || '% 환불');

  -- If partial refund, pay artist the remainder
  IF v_artist_amount > 0 THEN
    SELECT gold_balance INTO v_artist_balance
    FROM user_gold
    WHERE user_id = v_order.artist_id
    FOR UPDATE;

    IF v_artist_balance IS NULL THEN
      INSERT INTO user_gold (user_id, gold_balance)
      VALUES (v_order.artist_id, 0)
      ON CONFLICT (user_id) DO NOTHING;
      v_artist_balance := 0;
    END IF;

    v_new_artist_balance := v_artist_balance + v_artist_amount;

    UPDATE user_gold
    SET gold_balance = v_new_artist_balance, updated_at = now()
    WHERE user_id = v_order.artist_id;

    INSERT INTO gold_transactions (user_id, transaction_type, amount, balance_after, description, related_id)
    VALUES (v_order.artist_id, 'commission_escrow_release', v_artist_amount, v_new_artist_balance, '커미션 부분 정산 (취소)', p_order_id);

    INSERT INTO commission_escrow (order_id, action, amount, to_user_id, note)
    VALUES (p_order_id, 'release', v_artist_amount, v_order.artist_id, '취소에 따른 부분 정산');
  END IF;

  -- Update order
  UPDATE commission_orders
  SET status = 'cancelled',
      escrow_refunded_at = now(),
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'refunded', v_refund_amount, 'artist_received', v_artist_amount);
END;
$$;


ALTER FUNCTION "public"."escrow_refund_gold"("p_order_id" "uuid", "p_refund_percent" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."escrow_release_gold"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order record;
  v_fee integer;
  v_artist_amount integer;
  v_artist_balance integer;
  v_new_balance integer;
BEGIN
  SELECT * INTO v_order
  FROM commission_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message', '주문을 찾을 수 없습니다.');
  END IF;

  IF v_order.escrow_held = false THEN
    RETURN jsonb_build_object('success', false, 'error_message', '에스크로가 설정되지 않았습니다.');
  END IF;

  IF v_order.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error_message', '이미 정산된 주문입니다.');
  END IF;

  -- 수수료 5%로 통일 (BUG-08 FIX)
  v_fee := GREATEST(1, (v_order.price_gold * 5) / 100);
  v_artist_amount := v_order.price_gold - v_fee;

  SELECT gold_balance INTO v_artist_balance
  FROM user_gold
  WHERE user_id = v_order.artist_id
  FOR UPDATE;

  IF v_artist_balance IS NULL THEN
    INSERT INTO user_gold (user_id, gold_balance)
    VALUES (v_order.artist_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    v_artist_balance := 0;
  END IF;

  v_new_balance := v_artist_balance + v_artist_amount;

  -- Skip audit trigger (we log transactions manually below)
  PERFORM set_config('app.skip_gold_audit', 'true', true);

  UPDATE user_gold
  SET gold_balance = v_new_balance, updated_at = now()
  WHERE user_id = v_order.artist_id;

  INSERT INTO gold_transactions (user_id, transaction_type, amount, balance_after, description, related_id)
  VALUES (v_order.artist_id, 'commission_escrow_release', v_artist_amount, v_new_balance,
          '커미션 정산 (수수료 ' || v_fee || 'G 차감)', p_order_id);

  INSERT INTO gold_transactions (user_id, transaction_type, amount, balance_after, description, related_id)
  VALUES (v_order.artist_id, 'commission_fee', -v_fee, v_new_balance,
          '플랫폼 수수료 5%', p_order_id);

  INSERT INTO commission_escrow (order_id, action, amount, to_user_id, note)
  VALUES (p_order_id, 'release', v_artist_amount, v_order.artist_id, '작가 정산');

  INSERT INTO commission_escrow (order_id, action, amount, note)
  VALUES (p_order_id, 'fee', v_fee, '플랫폼 수수료 5%');

  UPDATE commission_orders
  SET status = 'completed',
      platform_fee_gold = v_fee,
      escrow_released_at = now(),
      completed_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'artist_received', v_artist_amount, 'fee', v_fee);
END;
$$;


ALTER FUNCTION "public"."escrow_release_gold"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_stale_pending_predictions"() RETURNS TABLE("expired_count" integer, "refunded_count" integer)
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."expire_stale_pending_predictions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_order_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  today_str text;
  seq_num integer;
  result text;
BEGIN
  today_str := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYYMMDD');
  
  SELECT COUNT(*) + 1 INTO seq_num
  FROM commission_orders
  WHERE order_number LIKE 'COM-' || today_str || '-%';
  
  result := 'COM-' || today_str || '-' || lpad(seq_num::text, 4, '0');
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."generate_order_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_league_id_by_alias"("p_alias" "text", "p_source" "text" DEFAULT 'betman'::"text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT league_id FROM league_aliases 
  WHERE alias = p_alias AND source = p_source
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_league_id_by_alias"("p_alias" "text", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_level_for_points"("p_total_points" integer) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  RETURN CASE
    WHEN p_total_points >= 20000 THEN 10
    WHEN p_total_points >= 10000 THEN 9
    WHEN p_total_points >= 5000 THEN 8
    WHEN p_total_points >= 3000 THEN 7
    WHEN p_total_points >= 1500 THEN 6
    WHEN p_total_points >= 800 THEN 5
    WHEN p_total_points >= 400 THEN 4
    WHEN p_total_points >= 150 THEN 3
    WHEN p_total_points >= 50 THEN 2
    ELSE 1
  END;
END;
$$;


ALTER FUNCTION "public"."get_level_for_points"("p_total_points" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recent_commented_posts"("p_limit" integer DEFAULT 20, "p_community_slug" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "sql" STABLE
    AS $$
  WITH latest_comments AS (
    SELECT post_id, MAX(created_at) AS latest_comment_at
    FROM comments
    WHERE deleted_at IS NULL
    GROUP BY post_id
    ORDER BY MAX(created_at) DESC
    LIMIT p_limit
  ),
  result_posts AS (
    SELECT
      p.id, p.user_id, p.community_slug, p.title, p.content, p.image,
      p.vote_count, p.comment_count, p.temperature, p.created_at,
      lc.latest_comment_at
    FROM latest_comments lc
    JOIN posts p ON p.id = lc.post_id
    WHERE p.deleted_at IS NULL
      AND (p_community_slug IS NULL OR p.community_slug = p_community_slug)
    ORDER BY lc.latest_comment_at DESC
  )
  SELECT json_build_object(
    'posts', COALESCE(
      (SELECT json_agg(row_to_json(rp)) FROM result_posts rp),
      '[]'::json
    ),
    'profiles', COALESCE(
      (SELECT json_agg(DISTINCT jsonb_build_object(
        'user_id', pr.user_id,
        'nickname', pr.nickname,
        'avatar_url', pr.avatar_url,
        'temperature', pr.temperature
      ))
      FROM result_posts rp2
      JOIN profiles pr ON pr.user_id = rp2.user_id),
      '[]'::json
    )
  );
$$;


ALTER FUNCTION "public"."get_recent_commented_posts"("p_limit" integer, "p_community_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_id_by_alias"("p_alias" "text", "p_source" "text" DEFAULT 'betman'::"text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT team_id FROM team_aliases 
  WHERE alias = p_alias AND source = p_source
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_team_id_by_alias"("p_alias" "text", "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_token_reset_date"("check_time" timestamp with time zone) RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
    kst_time timestamp;
BEGIN
    kst_time := check_time AT TIME ZONE 'Asia/Seoul';
    
    -- 23:00 KST 이후면 다음날 베팅일에 속함
    IF EXTRACT(HOUR FROM kst_time) >= 23 THEN
        RETURN (kst_time + interval '1 day')::date;
    ELSE
        RETURN kst_time::date;
    END IF;
END;
$$;


ALTER FUNCTION "public"."get_token_reset_date"("check_time" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_vote"("p_user_id" "text", "p_target_type" "text", "p_target_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT vote_value FROM public.votes
  WHERE user_id = p_user_id 
    AND target_type = p_target_type 
    AND target_id = p_target_id;
$$;


ALTER FUNCTION "public"."get_user_vote"("p_user_id" "text", "p_target_type" "text", "p_target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_betman_round"("data" "jsonb") RETURNS TABLE("round_id" "uuid", "games_imported" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_round_id uuid;
  v_year integer;
  v_round integer;
  v_deadline text;
  v_games jsonb;
  v_game_key text;
  v_game jsonb;
  v_count integer := 0;
  v_match_time timestamptz;
BEGIN
  -- 회차 정보 추출
  v_year := (data->>'year')::integer;
  v_round := (data->>'round')::integer;
  v_deadline := data->>'deadline';
  v_games := data->'games';
  
  -- 회차 생성 또는 업데이트
  INSERT INTO betman_rounds (year, round, deadline, status)
  VALUES (v_year, v_round, v_deadline, 'open')
  ON CONFLICT (year, round) DO UPDATE SET
    deadline = EXCLUDED.deadline,
    updated_at = now()
  RETURNING id INTO v_round_id;
  
  -- 경기 데이터 삽입
  FOR v_game_key, v_game IN SELECT * FROM jsonb_each(v_games)
  LOOP
    -- matchTime 파싱 (형식: "2026-01-24 09:00")
    v_match_time := (v_game->>'matchTime')::timestamp AT TIME ZONE 'Asia/Seoul';
    
    INSERT INTO betman_games (
      round_id, game_no, match_time, sport, league_code, game_type,
      home_team_name, away_team_name, handicap, venue
    ) VALUES (
      v_round_id,
      (v_game->>'gameNo')::integer,
      v_match_time,
      v_game->>'sport',
      v_game->>'league',
      v_game->>'gameType',
      v_game->>'homeTeam',
      v_game->>'awayTeam',
      NULLIF(v_game->>'handicap', '')::numeric,
      v_game->>'venue'
    )
    ON CONFLICT (round_id, game_no) DO UPDATE SET
      match_time = EXCLUDED.match_time,
      sport = EXCLUDED.sport,
      league_code = EXCLUDED.league_code,
      game_type = EXCLUDED.game_type,
      home_team_name = EXCLUDED.home_team_name,
      away_team_name = EXCLUDED.away_team_name,
      handicap = EXCLUDED.handicap,
      venue = EXCLUDED.venue,
      updated_at = now();
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT v_round_id, v_count;
END;
$$;


ALTER FUNCTION "public"."import_betman_round"("data" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."import_betman_round"("data" "jsonb") IS 'Betman JSON 데이터를 가져와서 회차와 경기를 생성합니다';



CREATE OR REPLACE FUNCTION "public"."increment_battle_participants"("p_battle_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE battle_rooms SET total_participants = total_participants + 1 WHERE id = p_battle_id;
END;
$$;


ALTER FUNCTION "public"."increment_battle_participants"("p_battle_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_battle_side_score"("p_side_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE battle_sides SET score = score + 1 WHERE id = p_side_id;
END;
$$;


ALTER FUNCTION "public"."increment_battle_side_score"("p_side_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_comment_count_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only increment if comment is not deleted (deleted_at is NULL)
  IF NEW.deleted_at IS NULL THEN
    UPDATE posts
    SET comment_count = COALESCE(comment_count, 0) + 1
    WHERE id = NEW.post_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."increment_comment_count_on_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_pending_predictions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE user_prediction_stats SET
    total_predictions = total_predictions + 1,
    pending_predictions = pending_predictions + 1,
    total_points = total_points - NEW.points_wagered,
    last_prediction_at = NOW(),
    updated_at = NOW()
  WHERE user_id = NEW.user_id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."increment_pending_predictions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_post_comment_count"("post_id_param" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE posts
  SET comment_count = COALESCE(comment_count, 0) + 1
  WHERE id = post_id_param;
END;
$$;


ALTER FUNCTION "public"."increment_post_comment_count"("post_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_post_view_count"("post_id_param" "uuid", "ip_address_param" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  can_increment boolean;
BEGIN
  SELECT can_increment_view_count(post_id_param, ip_address_param) INTO can_increment;
  
  IF NOT can_increment THEN
    RETURN false;
  END IF;

  INSERT INTO post_views (post_id, ip_hash, viewed_at)
  VALUES (post_id_param, ip_address_param, now());

  UPDATE posts
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = post_id_param;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."increment_post_view_count"("post_id_param" "uuid", "ip_address_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_prediction_count"("match_id_param" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE matches
  SET prediction_count = COALESCE(prediction_count, 0) + 1
  WHERE id = match_id_param;
END;
$$;


ALTER FUNCTION "public"."increment_prediction_count"("match_id_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_sticker_use"("p_sticker_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  UPDATE stickers SET use_count = use_count + 1 WHERE id = p_sticker_id;
$$;


ALTER FUNCTION "public"."increment_sticker_use"("p_sticker_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_worldcup_win"("p_candidate_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE worldcup_candidates SET win_count = win_count + 1 WHERE id = p_candidate_id;
END;
$$;


ALTER FUNCTION "public"."increment_worldcup_win"("p_candidate_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."init_user_prediction_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO user_prediction_stats (user_id)
  VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."init_user_prediction_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("p_user_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE user_id = p_user_id AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"("p_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_bookmarked"("p_user_id" "text", "p_post_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.bookmarks
    WHERE user_id = p_user_id AND post_id = p_post_id
  );
$$;


ALTER FUNCTION "public"."is_bookmarked"("p_user_id" "text", "p_post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_content_purchased"("p_user_id" "text", "p_prediction_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM purchased_content
        WHERE user_id = p_user_id
          AND prediction_id = p_prediction_id
    )
$$;


ALTER FUNCTION "public"."is_content_purchased"("p_user_id" "text", "p_prediction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_moderator_or_admin"("p_user_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE user_id = p_user_id AND role IN ('admin', 'moderator')
  );
$$;


ALTER FUNCTION "public"."is_moderator_or_admin"("p_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_subscription_active"("p_subscriber_id" "text", "p_expert_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM subscriptions
        WHERE subscriber_id = p_subscriber_id
          AND expert_id = p_expert_id
          AND status = 'active'
          AND (
              expires_at IS NULL 
              OR expires_at > now()
          )
    )
$$;


ALTER FUNCTION "public"."is_subscription_active"("p_subscriber_id" "text", "p_expert_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."metaverse_award_flair_karma"("p_user_id" "text", "p_team_id" "text", "p_delta" integer, "p_source" "text" DEFAULT 'unknown'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
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

  -- 1. stadium_contributions +delta (카르마 breakdown)
  INSERT INTO stadium_contributions (user_id, team_id, points_contributed, last_synced_at)
    VALUES (p_user_id, p_team_id, p_delta, now())
    ON CONFLICT (user_id, team_id) DO UPDATE
      SET points_contributed = stadium_contributions.points_contributed + p_delta,
          last_synced_at = now();

  -- 2. team_stadiums.total_points +delta + 레벨 재계산
  UPDATE team_stadiums
    SET total_points = total_points + p_delta, updated_at = now()
    WHERE team_id = p_team_id
    RETURNING total_points INTO v_new_team_total;

  SELECT COALESCE(MAX(level), 1) INTO v_new_level
    FROM stadium_level_thresholds
    WHERE required_points <= COALESCE(v_new_team_total, 0);

  UPDATE team_stadiums
    SET level = v_new_level
    WHERE team_id = p_team_id AND level < v_new_level;

  -- 3. spendable balance + lifetime (팀 무관 통합)
  INSERT INTO metaverse_user_activity_balance (user_id, spendable_points, lifetime_earned)
    VALUES (p_user_id, p_delta, p_delta)
    ON CONFLICT (user_id) DO UPDATE
      SET spendable_points = metaverse_user_activity_balance.spendable_points + p_delta,
          lifetime_earned = metaverse_user_activity_balance.lifetime_earned + p_delta,
          updated_at = now()
    RETURNING spendable_points INTO v_new_balance;

  RETURN jsonb_build_object(
    'success', true,
    'delta', p_delta,
    'team_total', v_new_team_total,
    'team_level', v_new_level,
    'new_balance', v_new_balance,
    'source', p_source
  );
END;
$$;


ALTER FUNCTION "public"."metaverse_award_flair_karma"("p_user_id" "text", "p_team_id" "text", "p_delta" integer, "p_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."metaverse_cleanup_empty_chat_rooms"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_closed int;
BEGIN
  UPDATE metaverse_chat_rooms
    SET closed_at = now()
    WHERE closed_at IS NULL
      AND last_activity_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END;
$$;


ALTER FUNCTION "public"."metaverse_cleanup_empty_chat_rooms"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."metaverse_create_chat_room"("p_user_id" "text", "p_plot_id" "uuid", "p_sign_text" "text", "p_cost" integer DEFAULT 100) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_room_id uuid;
  v_new_balance int;
  v_trimmed text;
BEGIN
  -- Input 검증
  v_trimmed := trim(coalesce(p_sign_text, ''));
  IF length(v_trimmed) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'sign_text_required');
  END IF;
  IF length(v_trimmed) > 20 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'sign_text_too_long');
  END IF;
  IF p_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'invalid_cost');
  END IF;

  -- Plot 존재 확인
  IF NOT EXISTS (SELECT 1 FROM metaverse_world_plots WHERE id = p_plot_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'plot_not_found');
  END IF;

  -- 1) 잔액 차감 (원자적 — WHERE 절로 잔액 체크)
  UPDATE metaverse_user_activity_balance
    SET spendable_points = spendable_points - p_cost, updated_at = now()
    WHERE user_id = p_user_id AND spendable_points >= p_cost
    RETURNING spendable_points INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'insufficient_balance');
  END IF;

  -- 2) 방 INSERT — UNIQUE(plot_id) WHERE closed_at IS NULL 로 race 방어.
  --    충돌 나면 unique_violation 예외 → BEGIN 블록에서 잡아서 명시적 에러 반환.
  --    RAISE EXCEPTION 없이 정상 return 해도 함수 전체가 하나의 서브트랜잭션이므로
  --    명시 ROLLBACK 처리를 위해 savepoint 대신 BEGIN EXCEPTION 블록 사용.
  BEGIN
    INSERT INTO metaverse_chat_rooms (plot_id, owner_user_id, sign_text)
      VALUES (p_plot_id, p_user_id, v_trimmed)
      RETURNING id INTO v_room_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- 동시에 다른 유저가 선점 → 차감 롤백 후 명시 에러
      UPDATE metaverse_user_activity_balance
        SET spendable_points = spendable_points + p_cost, updated_at = now()
        WHERE user_id = p_user_id;
      RETURN jsonb_build_object('success', false, 'error_message', 'plot_occupied');
  END;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'new_balance', v_new_balance
  );
END;
$$;


ALTER FUNCTION "public"."metaverse_create_chat_room"("p_user_id" "text", "p_plot_id" "uuid", "p_sign_text" "text", "p_cost" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."metaverse_equip_avatar"("p_user_id" "text", "p_avatar_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_is_default boolean;
    v_is_active boolean;
    v_owned boolean;
  BEGIN
    SELECT is_active, is_default
      INTO v_is_active, v_is_default
      FROM metaverse_avatar_items
      WHERE avatar_key = p_avatar_key;

    IF NOT FOUND OR NOT v_is_active THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'not_found',
        'error_message', '존재하지 않는 아바타입니다');
    END IF;

    IF NOT v_is_default THEN
      SELECT EXISTS(
        SELECT 1 FROM metaverse_avatar_inventory
          WHERE user_id = p_user_id AND avatar_key = p_avatar_key
      ) INTO v_owned;

      IF NOT v_owned THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'not_owned',
          'error_message', '소유하지 않은 아바타입니다');
      END IF;
    END IF;

    UPDATE profiles
      SET metaverse_avatar_key = p_avatar_key
      WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'avatar_key', p_avatar_key
    );
  END;
  $$;


ALTER FUNCTION "public"."metaverse_equip_avatar"("p_user_id" "text", "p_avatar_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."metaverse_purchase_avatar"("p_user_id" "text", "p_avatar_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_price int;
  v_is_active boolean;
  v_is_default boolean;
  v_already_owned boolean;
  v_new_gold int;
BEGIN
  -- 상품 존재 + 활성 여부 확인
  SELECT price_gold, is_active, is_default
    INTO v_price, v_is_active, v_is_default
    FROM metaverse_avatar_items
    WHERE avatar_key = p_avatar_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found',
      'error_message', '존재하지 않는 아바타입니다');
  END IF;

  IF NOT v_is_active THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'inactive',
      'error_message', '판매 중지된 아바타입니다');
  END IF;

  IF v_is_default THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'free',
      'error_message', '기본 아바타는 구매할 필요가 없습니다');
  END IF;

  -- 이미 소유 여부
  SELECT EXISTS(
    SELECT 1 FROM metaverse_avatar_inventory
      WHERE user_id = p_user_id AND avatar_key = p_avatar_key
  ) INTO v_already_owned;

  IF v_already_owned THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_owned',
      'error_message', '이미 소유하고 있는 아바타입니다');
  END IF;

  -- gold 차감 (user_gold 원자적 업데이트; 기존 spend_gold RPC 와 동일 로직)
  UPDATE user_gold
    SET gold_balance = gold_balance - v_price, updated_at = now()
    WHERE user_id = p_user_id AND gold_balance >= v_price
    RETURNING gold_balance INTO v_new_gold;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'insufficient_gold',
      'error_message', '골드가 부족합니다');
  END IF;

  -- 거래 로그 (gold_transactions) — 기존 spend_gold 패턴
  INSERT INTO gold_transactions (user_id, transaction_type, amount, balance_after, description)
    VALUES (p_user_id, 'metaverse_avatar_purchase', -v_price, v_new_gold,
            format('유니폼 구매: %s', p_avatar_key));

  -- 인벤토리 삽입
  INSERT INTO metaverse_avatar_inventory (user_id, avatar_key, source, price_paid_gold)
    VALUES (p_user_id, p_avatar_key, 'purchase', v_price);

  RETURN jsonb_build_object(
    'success', true,
    'avatar_key', p_avatar_key,
    'price_paid', v_price,
    'remaining_gold', v_new_gold
  );
END;
$$;


ALTER FUNCTION "public"."metaverse_purchase_avatar"("p_user_id" "text", "p_avatar_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."metaverse_spend_activity_points"("p_user_id" "text", "p_amount" integer, "p_purpose" "text" DEFAULT 'unknown'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_new_balance int;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'amount must be positive');
  END IF;

  UPDATE metaverse_user_activity_balance
    SET spendable_points = spendable_points - p_amount, updated_at = now()
    WHERE user_id = p_user_id AND spendable_points >= p_amount
    RETURNING spendable_points INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'insufficient balance');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deducted', p_amount,
    'new_balance', v_new_balance,
    'purpose', p_purpose
  );
END;
$$;


ALTER FUNCTION "public"."metaverse_spend_activity_points"("p_user_id" "text", "p_amount" integer, "p_purpose" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."news_reservoir_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."news_reservoir_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_role_self_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- role이 변경되지 않았으면 통과
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- 기존 role이 admin이면 변경 허용 (관리자는 다른 사람의 role도 변경 가능)
  IF OLD.role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- 비관리자의 role 변경 차단
  RAISE EXCEPTION 'role 변경 권한이 없습니다. 관리자만 role을 변경할 수 있습니다.';
END;
$$;


ALTER FUNCTION "public"."prevent_role_self_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_temperature_queue"("batch_size" integer DEFAULT 50) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN update_active_post_temperatures();
END;
$$;


ALTER FUNCTION "public"."process_temperature_queue"("batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purchase_noun_title"("p_user_id" "text", "p_noun_title_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."purchase_noun_title"("p_user_id" "text", "p_noun_title_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purchase_sticker"("p_user_id" "text", "p_sticker_id" "uuid", "p_board_slug" "text" DEFAULT 'free-board'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_sticker RECORD;
  v_already_owned BOOLEAN;
  v_buyer_points INT;
  v_creator_reward INT;
BEGIN
  SELECT id, creator_id, name, price, creator_cut, status
  INTO v_sticker FROM stickers WHERE id = p_sticker_id;

  IF v_sticker.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_sticker.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_approved');
  END IF;

  IF v_sticker.creator_id = p_user_id THEN
    INSERT INTO user_stickers (user_id, sticker_id)
    VALUES (p_user_id, p_sticker_id)
    ON CONFLICT (user_id, sticker_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'spent', 0, 'name', v_sticker.name);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_stickers WHERE user_id = p_user_id AND sticker_id = p_sticker_id
  ) INTO v_already_owned;

  IF v_already_owned THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_owned');
  END IF;

  SELECT COALESCE(available_points, 0) INTO v_buyer_points
  FROM user_board_points WHERE user_id = p_user_id AND board_slug = p_board_slug;

  IF v_buyer_points IS NULL OR v_buyer_points < v_sticker.price THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_points', 'required', v_sticker.price, 'available', COALESCE(v_buyer_points, 0));
  END IF;

  UPDATE user_board_points
  SET available_points = available_points - v_sticker.price, updated_at = now()
  WHERE user_id = p_user_id AND board_slug = p_board_slug;

  INSERT INTO point_transactions (user_id, board_slug, amount, transaction_type, description, related_id)
  VALUES (p_user_id, p_board_slug, -v_sticker.price, 'shop_purchase', '스티커 구매: ' || v_sticker.name, p_sticker_id);

  v_creator_reward := (v_sticker.price * v_sticker.creator_cut / 100);
  IF v_creator_reward > 0 THEN
    INSERT INTO user_board_points (user_id, board_slug, total_points, available_points, level)
    VALUES (v_sticker.creator_id, p_board_slug, v_creator_reward, v_creator_reward, 1)
    ON CONFLICT (user_id, board_slug) DO UPDATE SET
      total_points = user_board_points.total_points + v_creator_reward,
      available_points = user_board_points.available_points + v_creator_reward,
      updated_at = now();

    INSERT INTO point_transactions (user_id, board_slug, amount, transaction_type, description, related_id)
    VALUES (v_sticker.creator_id, p_board_slug, v_creator_reward, 'sticker_revenue', '스티커 판매 수익: ' || v_sticker.name, p_sticker_id);
  END IF;

  INSERT INTO user_stickers (user_id, sticker_id) VALUES (p_user_id, p_sticker_id);
  UPDATE stickers SET purchase_count = purchase_count + 1 WHERE id = p_sticker_id;

  RETURN jsonb_build_object('success', true, 'spent', v_sticker.price, 'creator_reward', v_creator_reward, 'name', v_sticker.name);
END;
$$;


ALTER FUNCTION "public"."purchase_sticker"("p_user_id" "text", "p_sticker_id" "uuid", "p_board_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_all_user_temperatures"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  r RECORD;
  v_count integer := 0;
BEGIN
  FOR r IN SELECT user_id FROM profiles LOOP
    PERFORM update_user_temperature(r.user_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."recalc_all_user_temperatures"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_comment_vote_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  target_comment_id uuid;
BEGIN
  target_comment_id := COALESCE(NEW.comment_id, OLD.comment_id);
  UPDATE comments SET vote_count = (
    SELECT COALESCE(
      COUNT(*) FILTER (WHERE vote_type = 'up') -
      COUNT(*) FILTER (WHERE vote_type = 'down'),
      0
    )
    FROM comment_votes WHERE comment_id = target_comment_id
  ) WHERE id = target_comment_id;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."recalc_comment_vote_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_post_vote_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  target_post_id uuid;
BEGIN
  target_post_id := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE posts SET vote_count = (
    SELECT COALESCE(
      COUNT(*) FILTER (WHERE vote_type = 'up') -
      COUNT(*) FILTER (WHERE vote_type = 'down'),
      0
    )
    FROM post_votes WHERE post_id = target_post_id
  ) WHERE id = target_post_id;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."recalc_post_vote_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_user_sport_stats"("p_user_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_rec record;
  v_wagered int;
  v_accuracy numeric;
  v_net_profit numeric;
  v_profit_rate numeric;
  v_cs int;
  v_bw int;
  v_wl int;
  -- 전체 통계용 별도 변수
  v_total int;
  v_correct int;
  v_wrong int;
  v_cancelled_cnt int;
  v_total_returns numeric;
BEGIN
  -- 종목별 통계
  FOR v_rec IN
    SELECT 
      g.sport,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE p.is_correct = true)::int as correct,
      COUNT(*) FILTER (WHERE p.is_correct = false)::int as wrong,
      COUNT(*) FILTER (WHERE p.status = 'cancelled')::int as cancelled,
      COALESCE(SUM(p.points_earned) FILTER (WHERE p.is_correct = true), 0)::numeric as total_returns
    FROM betman_predictions p
    JOIN betman_games g ON g.id = p.game_id
    WHERE p.user_id = p_user_id AND p.status IN ('settled', 'cancelled')
    GROUP BY g.sport
  LOOP
    v_wagered := v_rec.correct + v_rec.wrong;
    v_accuracy := CASE WHEN v_wagered > 0 THEN ROUND((v_rec.correct::numeric / v_wagered) * 100, 2) ELSE 0 END;
    v_net_profit := ROUND(v_rec.total_returns - v_wagered, 2);
    v_profit_rate := CASE WHEN v_wagered > 0 THEN ROUND((v_net_profit / v_wagered) * 100, 2) ELSE 0 END;
    
    SELECT cs.current_streak, cs.best_win, cs.worst_lose
    INTO v_cs, v_bw, v_wl
    FROM calc_streaks(p_user_id, v_rec.sport) cs;

    INSERT INTO betman_user_sport_stats (
      user_id, sport, total_predictions, correct_predictions, wrong_predictions,
      cancelled_predictions, accuracy, total_wagered, total_returns,
      net_profit, profit_rate, current_streak, best_win_streak, worst_lose_streak, updated_at
    ) VALUES (
      p_user_id, v_rec.sport, v_rec.total, v_rec.correct, v_rec.wrong,
      v_rec.cancelled, v_accuracy, v_wagered, ROUND(v_rec.total_returns, 2),
      v_net_profit, v_profit_rate, v_cs, v_bw, v_wl, now()
    )
    ON CONFLICT (user_id, sport) DO UPDATE SET
      total_predictions = EXCLUDED.total_predictions,
      correct_predictions = EXCLUDED.correct_predictions,
      wrong_predictions = EXCLUDED.wrong_predictions,
      cancelled_predictions = EXCLUDED.cancelled_predictions,
      accuracy = EXCLUDED.accuracy,
      total_wagered = EXCLUDED.total_wagered,
      total_returns = EXCLUDED.total_returns,
      net_profit = EXCLUDED.net_profit,
      profit_rate = EXCLUDED.profit_rate,
      current_streak = EXCLUDED.current_streak,
      best_win_streak = EXCLUDED.best_win_streak,
      worst_lose_streak = EXCLUDED.worst_lose_streak,
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  -- '전체' 통합 통계 (별도 변수 사용으로 컬럼 별칭 문제 해결)
  SELECT 
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE p.is_correct = true)::int,
    COUNT(*) FILTER (WHERE p.is_correct = false)::int,
    COUNT(*) FILTER (WHERE p.status = 'cancelled')::int,
    COALESCE(SUM(p.points_earned) FILTER (WHERE p.is_correct = true), 0)::numeric
  INTO v_total, v_correct, v_wrong, v_cancelled_cnt, v_total_returns
  FROM betman_predictions p
  JOIN betman_games g ON g.id = p.game_id
  WHERE p.user_id = p_user_id AND p.status IN ('settled', 'cancelled');

  IF v_total IS NOT NULL AND v_total > 0 THEN
    v_wagered := v_correct + v_wrong;
    v_accuracy := CASE WHEN v_wagered > 0 THEN ROUND((v_correct::numeric / v_wagered) * 100, 2) ELSE 0 END;
    v_net_profit := ROUND(v_total_returns - v_wagered, 2);
    v_profit_rate := CASE WHEN v_wagered > 0 THEN ROUND((v_net_profit / v_wagered) * 100, 2) ELSE 0 END;

    SELECT cs.current_streak, cs.best_win, cs.worst_lose
    INTO v_cs, v_bw, v_wl
    FROM calc_streaks(p_user_id, NULL) cs;

    INSERT INTO betman_user_sport_stats (
      user_id, sport, total_predictions, correct_predictions, wrong_predictions,
      cancelled_predictions, accuracy, total_wagered, total_returns,
      net_profit, profit_rate, current_streak, best_win_streak, worst_lose_streak, updated_at
    ) VALUES (
      p_user_id, '전체', v_total, v_correct, v_wrong,
      v_cancelled_cnt, v_accuracy, v_wagered, ROUND(v_total_returns, 2),
      v_net_profit, v_profit_rate, v_cs, v_bw, v_wl, now()
    )
    ON CONFLICT (user_id, sport) DO UPDATE SET
      total_predictions = EXCLUDED.total_predictions,
      correct_predictions = EXCLUDED.correct_predictions,
      wrong_predictions = EXCLUDED.wrong_predictions,
      cancelled_predictions = EXCLUDED.cancelled_predictions,
      accuracy = EXCLUDED.accuracy,
      total_wagered = EXCLUDED.total_wagered,
      total_returns = EXCLUDED.total_returns,
      net_profit = EXCLUDED.net_profit,
      profit_rate = EXCLUDED.profit_rate,
      current_streak = EXCLUDED.current_streak,
      best_win_streak = EXCLUDED.best_win_streak,
      worst_lose_streak = EXCLUDED.worst_lose_streak,
      updated_at = EXCLUDED.updated_at;
  END IF;
END;
$$;


ALTER FUNCTION "public"."recalc_user_sport_stats"("p_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_all_comment_counts"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Update comment_count for all posts based on actual comment counts
  UPDATE posts p
  SET comment_count = (
    SELECT COUNT(*)
    FROM comments c
    WHERE c.post_id = p.id
      AND c.deleted_at IS NULL
  );
END;
$$;


ALTER FUNCTION "public"."recalculate_all_comment_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_post_comment_count"("post_id_param" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  actual_count integer;
BEGIN
  -- Count actual non-deleted comments (including replies)
  SELECT COUNT(*) INTO actual_count
  FROM comments
  WHERE post_id = post_id_param
    AND deleted_at IS NULL;

  -- Update the post's comment_count
  UPDATE posts
  SET comment_count = actual_count
  WHERE id = post_id_param;

  RETURN actual_count;
END;
$$;


ALTER FUNCTION "public"."recalculate_post_comment_count"("post_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_unique_view"("p_post_id" "uuid", "p_user_id" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_inserted boolean;
BEGIN
    -- 시간당 1회만 카운트
    INSERT INTO post_views (post_id, user_id, viewed_hour)
    VALUES (p_post_id, p_user_id, date_trunc('hour', now()))
    ON CONFLICT (post_id, user_id, viewed_hour) DO NOTHING;
    
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    
    IF v_inserted > 0 THEN
        -- 유니크 조회수 증가
        UPDATE posts SET view_count_unique = view_count_unique + 1 WHERE id = p_post_id;
        -- 온도 점수 업데이트 큐에 추가
        PERFORM enqueue_temperature_update(p_post_id);
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."record_unique_view"("p_post_id" "uuid", "p_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_hot_feed"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY hot_feed;
END;
$$;


ALTER FUNCTION "public"."refresh_hot_feed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refund_tokens"("p_user_id" "text", "p_amount" integer, "p_description" "text" DEFAULT NULL::"text") RETURNS TABLE("success" boolean, "new_balance" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_new_balance integer;
BEGIN
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  UPDATE user_tokens
  SET
    token_balance = token_balance + p_amount,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING token_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  -- Log refund transaction
  INSERT INTO token_transactions (
    user_id,
    transaction_type,
    amount,
    balance_after,
    description
  ) VALUES (
    p_user_id,
    'refund',
    p_amount,
    v_new_balance,
    COALESCE(p_description, '토큰 ' || p_amount || '개 환불')
  );

  RETURN QUERY SELECT true, v_new_balance;
END;
$$;


ALTER FUNCTION "public"."refund_tokens"("p_user_id" "text", "p_amount" integer, "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_expired_temperatures"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_updated integer;
BEGIN
    UPDATE posts 
    SET temperature = 0, temp_score_updated_at = now()
    WHERE created_at < now() - interval '24 hours'
      AND temperature > 0
      AND deleted_at IS NULL;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;


ALTER FUNCTION "public"."reset_expired_temperatures"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_expired_temperatures"("days_old" integer DEFAULT 7) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_updated integer;
BEGIN
    UPDATE posts 
    SET temperature = 0, temp_score_updated_at = now()
    WHERE created_at < now() - (days_old || ' days')::interval
      AND temperature > 0
      AND deleted_at IS NULL;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;


ALTER FUNCTION "public"."reset_expired_temperatures"("days_old" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_user_daily_tokens"("target_user_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    daily_allocation integer := 10; -- Fixed: 10 balls per day (was 1000)
    current_balance integer;
    reset_amount integer;
BEGIN
    SELECT token_balance INTO current_balance
    FROM user_tokens
    WHERE user_id = target_user_id;

    IF current_balance IS NULL THEN
        INSERT INTO user_tokens (user_id, token_balance, last_reset_at, total_tokens_earned)
        VALUES (target_user_id, daily_allocation, now(), daily_allocation)
        ON CONFLICT (user_id) DO NOTHING;
    ELSE
        reset_amount := GREATEST(0, daily_allocation - current_balance);

        UPDATE user_tokens
        SET
            token_balance = daily_allocation,
            last_reset_at = now(),
            total_tokens_earned = total_tokens_earned + reset_amount,
            updated_at = now()
        WHERE user_id = target_user_id;

        IF reset_amount > 0 THEN
            INSERT INTO token_transactions (
                user_id, transaction_type, amount, balance_after, description
            ) VALUES (
                target_user_id, 'daily_reset', reset_amount, daily_allocation,
                'Daily token reset at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
            );
        END IF;
    END IF;
END;
$$;


ALTER FUNCTION "public"."reset_user_daily_tokens"("target_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reward_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text" DEFAULT '미니게임 보상'::"text", "p_transaction_type" "text" DEFAULT 'mini_game_reward'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."reward_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text", "p_transaction_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_comment_path"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    NEW.path := ARRAY[NEW.id::text];
  ELSE
    SELECT depth + 1, path || NEW.id::text
    INTO NEW.depth, NEW.path
    FROM public.comments
    WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_comment_path"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_betman_game"("p_game_id" "uuid", "p_home_score" integer, "p_away_score" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_game betman_games%ROWTYPE;
  v_result text;
  v_settled_count integer := 0;
BEGIN
  -- 경기 정보 조회
  SELECT * INTO v_game FROM betman_games WHERE id = p_game_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found: %', p_game_id;
  END IF;
  
  -- 결과 계산
  IF v_game.game_type IN ('일반', 'S일반') THEN
    -- 승무패
    IF p_home_score > p_away_score THEN
      v_result := 'home';
    ELSIF p_home_score < p_away_score THEN
      v_result := 'away';
    ELSE
      v_result := 'draw';
    END IF;
  ELSIF v_game.game_type IN ('핸디캡', 'S핸디캡') THEN
    -- 핸디캡 (홈팀 기준)
    IF (p_home_score + COALESCE(v_game.handicap, 0)) > p_away_score THEN
      v_result := 'home';
    ELSIF (p_home_score + COALESCE(v_game.handicap, 0)) < p_away_score THEN
      v_result := 'away';
    ELSE
      v_result := 'draw';
    END IF;
  ELSIF v_game.game_type IN ('언더오버', 'S언더오버') THEN
    -- 언더오버
    IF (p_home_score + p_away_score) > COALESCE(v_game.handicap, 0) THEN
      v_result := 'over';
    ELSE
      v_result := 'under';
    END IF;
  ELSE
    -- SUM 등 기타
    v_result := NULL;
  END IF;
  
  -- 경기 업데이트
  UPDATE betman_games
  SET home_score = p_home_score,
      away_score = p_away_score,
      result = v_result,
      status = 'completed',
      updated_at = now()
  WHERE id = p_game_id;
  
  -- 예측 정산
  UPDATE betman_predictions
  SET is_correct = (prediction = v_result),
      points_earned = CASE WHEN prediction = v_result THEN 10 ELSE 0 END,
      status = 'settled',
      settled_at = now()
  WHERE game_id = p_game_id
    AND status = 'pending';
  
  GET DIAGNOSTICS v_settled_count = ROW_COUNT;
  
  RETURN v_settled_count;
END;
$$;


ALTER FUNCTION "public"."settle_betman_game"("p_game_id" "uuid", "p_home_score" integer, "p_away_score" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."settle_betman_game"("p_game_id" "uuid", "p_home_score" integer, "p_away_score" integer) IS '경기 결과를 입력하고 예측을 정산합니다';



CREATE OR REPLACE FUNCTION "public"."settle_predictions_by_round"("p_gm_ts" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."settle_predictions_by_round"("p_gm_ts" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."settle_predictions_by_round"("p_gm_ts" "text") IS 'VPS fetch-results.sh에서 경기 결과 업데이트 후 호출. 
pending 예측 정산 → 슬립 정산 → daily round 상태 → 유저 통계 갱신.
Usage: SELECT settle_predictions_by_round(''260025'');';



CREATE OR REPLACE FUNCTION "public"."settle_round"("p_gm_ts" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."settle_round"("p_gm_ts" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."spend_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text" DEFAULT '골드 사용'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
BEGIN
  SELECT gold_balance INTO v_balance
  FROM user_gold
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error_message', '골드가 부족합니다. 필요: ' || p_amount || ', 보유: ' || COALESCE(v_balance, 0));
  END IF;

  v_new_balance := v_balance - p_amount;

  -- Skip audit trigger (we log transactions manually below)
  PERFORM set_config('app.skip_gold_audit', 'true', true);

  UPDATE user_gold
  SET gold_balance = v_new_balance, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO gold_transactions (user_id, transaction_type, amount, balance_after, description)
  VALUES (p_user_id, 'spend', -p_amount, v_new_balance, p_description);

  RETURN jsonb_build_object('success', true, 'spent', p_amount, 'remaining', v_new_balance);
END;
$$;


ALTER FUNCTION "public"."spend_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."spend_tokens"("p_user_id" "text", "p_amount" integer, "p_transaction_type" "text" DEFAULT 'prediction_spent'::"text", "p_description" "text" DEFAULT NULL::"text", "p_related_prediction_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("success" boolean, "remaining_balance" integer, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_new_balance integer;
  v_user_exists boolean;
  v_current_balance integer;
BEGIN
  -- Validate inputs
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0, '유효하지 않은 토큰 양입니다.'::text;
    RETURN;
  END IF;

  -- Check user exists
  SELECT EXISTS(SELECT 1 FROM profiles WHERE profiles.user_id = p_user_id) INTO v_user_exists;
  IF NOT v_user_exists THEN
    RETURN QUERY SELECT false, 0, '사용자를 찾을 수 없습니다.'::text;
    RETURN;
  END IF;

  -- Ensure daily reset first
  PERFORM ensure_daily_token_reset(p_user_id);

  -- Lock the row with FOR UPDATE to prevent race conditions
  SELECT ut.token_balance INTO v_current_balance
  FROM user_tokens ut
  WHERE ut.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_current_balance < p_amount THEN
    RETURN QUERY SELECT false, COALESCE(v_current_balance, 0), '토큰이 부족합니다.'::text;
    RETURN;
  END IF;

  -- Atomic deduction (row is locked, safe from concurrent updates)
  UPDATE user_tokens
  SET
    token_balance = token_balance - p_amount,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING token_balance INTO v_new_balance;

  -- Record transaction
  INSERT INTO token_transactions (
    user_id, transaction_type, amount, balance_after, description, related_prediction_id
  ) VALUES (
    p_user_id, p_transaction_type, -p_amount, v_new_balance,
    COALESCE(p_description, '토큰 ' || p_amount || '개 사용'),
    p_related_prediction_id
  );

  RETURN QUERY SELECT true, v_new_balance, NULL::text;
END;
$$;


ALTER FUNCTION "public"."spend_tokens"("p_user_id" "text", "p_amount" integer, "p_transaction_type" "text", "p_description" "text", "p_related_prediction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_category_from_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.community_slug IS NOT NULL AND NEW.category_id IS NULL THEN
    SELECT id INTO NEW.category_id 
    FROM public.categories 
    WHERE slug = NEW.community_slug;
  END IF;
  
  IF NEW.category_id IS NOT NULL AND NEW.community_slug IS NULL THEN
    SELECT slug INTO NEW.community_slug 
    FROM public.categories 
    WHERE id = NEW.category_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_category_from_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_commission_used_slots"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  target_package_id uuid;
BEGIN
  target_package_id := COALESCE(NEW.package_id, OLD.package_id);
  UPDATE commission_packages
  SET used_slots = (
    SELECT COUNT(*) FROM commission_orders
    WHERE package_id = target_package_id
    AND status NOT IN ('cancelled', 'rejected', 'completed')
  ),
  updated_at = now()
  WHERE id = target_package_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_commission_used_slots"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_live_room_status"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- scheduled → waiting: 경기 시작 30분 전
  UPDATE live_rooms lr
  SET status = 'waiting'
  FROM betman_games bg
  WHERE lr.game_id = bg.id
    AND lr.status = 'scheduled'
    AND bg.match_time <= now() + interval '30 minutes';

  -- waiting → live: 경기가 시작됨 (in_progress)
  UPDATE live_rooms lr
  SET status = 'live'
  FROM betman_games bg
  WHERE lr.game_id = bg.id
    AND lr.status = 'waiting'
    AND bg.status = 'in_progress';

  -- live → ended: 경기가 완료됨 (completed/cancelled)
  UPDATE live_rooms lr
  SET status = 'ended'
  FROM betman_games bg
  WHERE lr.game_id = bg.id
    AND lr.status = 'live'
    AND bg.status IN ('completed', 'cancelled');

  -- live → ended: 시작 후 4시간 경과 (결과 미수신 안전장치)
  UPDATE live_rooms lr
  SET status = 'ended'
  FROM betman_games bg
  WHERE lr.game_id = bg.id
    AND lr.status = 'live'
    AND bg.match_time < now() - interval '4 hours';

  -- waiting → ended: 시작 시간 5시간 지났는데 아직 waiting (비정상)
  UPDATE live_rooms lr
  SET status = 'ended'
  FROM betman_games bg
  WHERE lr.game_id = bg.id
    AND lr.status = 'waiting'
    AND bg.match_time < now() - interval '5 hours';

  -- ended → closed: 경기 종료 후 30분 경과
  UPDATE live_rooms
  SET status = 'closed', closed_at = now()
  WHERE status = 'ended'
    AND game_id IN (
      SELECT bg.id FROM betman_games bg
      WHERE bg.status IN ('completed', 'cancelled')
        AND bg.updated_at < now() - interval '30 minutes'
    );

  -- ended → closed: ended 상태로 30분 경과 (결과 무관 안전장치)
  UPDATE live_rooms
  SET status = 'closed', closed_at = now()
  WHERE status = 'ended'
    AND game_id IN (
      SELECT bg.id FROM betman_games bg
      WHERE bg.match_time < now() - interval '5 hours'
    );

  -- 게임 없이 생성된 방: 24시간 후 자동 닫힘
  UPDATE live_rooms
  SET status = 'closed', closed_at = now()
  WHERE game_id IS NULL
    AND status NOT IN ('closed')
    AND created_at < now() - interval '24 hours';

  -- closed 후 30분 경과한 방 삭제 (DB 정리)
  DELETE FROM live_rooms
  WHERE status = 'closed'
    AND closed_at < now() - interval '30 minutes';
END;
$$;


ALTER FUNCTION "public"."sync_live_room_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_post_vote_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_post_id uuid;
BEGIN
  target_post_id := COALESCE(NEW.post_id, OLD.post_id);
  
  -- vote_count 동기화
  UPDATE public.posts
  SET vote_count = (
    SELECT COUNT(*) FROM public.post_votes
    WHERE post_id = target_post_id AND vote_type = 'up'
  )
  WHERE id = target_post_id;
  
  -- 온도 업데이트 큐에 추가 (기존에 누락되었던 부분)
  PERFORM enqueue_temperature_update(target_post_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_post_vote_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_stadium_contribution"("p_user_id" "text", "p_team_id" "text", "p_new_points" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_old_points bigint;
  v_delta bigint;
  v_new_total bigint;
  v_new_level int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM team_map_pins WHERE team_id = p_team_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error_message', '존재하지 않는 팀입니다.');
  END IF;

  INSERT INTO stadium_contributions (user_id, team_id, points_contributed, last_synced_at)
  VALUES (p_user_id, p_team_id, 0, now())
  ON CONFLICT (user_id, team_id) DO NOTHING;

  SELECT points_contributed INTO v_old_points
  FROM stadium_contributions
  WHERE user_id = p_user_id AND team_id = p_team_id
  FOR UPDATE;

  v_delta := GREATEST(0, p_new_points - COALESCE(v_old_points, 0));

  IF v_delta = 0 THEN
    RETURN jsonb_build_object('success', true, 'delta', 0, 'message', '변화 없음');
  END IF;

  UPDATE stadium_contributions
  SET points_contributed = p_new_points, last_synced_at = now()
  WHERE user_id = p_user_id AND team_id = p_team_id;

  UPDATE team_stadiums
  SET total_points = total_points + v_delta, updated_at = now()
  WHERE team_id = p_team_id
  RETURNING total_points INTO v_new_total;

  SELECT COALESCE(MAX(level), 1) INTO v_new_level
  FROM stadium_level_thresholds
  WHERE required_points <= COALESCE(v_new_total, 0);

  UPDATE team_stadiums
  SET level = v_new_level
  WHERE team_id = p_team_id AND level < v_new_level;

  RETURN jsonb_build_object(
    'success', true,
    'delta', v_delta,
    'new_total', v_new_total,
    'new_level', v_new_level
  );
END;
$$;


ALTER FUNCTION "public"."sync_stadium_contribution"("p_user_id" "text", "p_team_id" "text", "p_new_points" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_auto_assign_daily_round_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_daily_id DATE;
  v_daily_round_id UUID;
BEGIN
  -- Only process if match_time is set and daily_round_id is null
  IF NEW.match_time IS NOT NULL AND NEW.daily_round_id IS NULL THEN
    v_daily_id := compute_daily_id(NEW.match_time);
    
    -- Get or create daily round
    INSERT INTO betman_daily_rounds (daily_id, bet_open_at, bet_close_at)
    VALUES (
      v_daily_id,
      (v_daily_id || 'T08:00:00+09:00')::timestamptz,
      (v_daily_id || 'T23:00:00+09:00')::timestamptz
    )
    ON CONFLICT (daily_id) DO NOTHING;
    
    SELECT id INTO v_daily_round_id
    FROM betman_daily_rounds
    WHERE daily_id = v_daily_id;
    
    NEW.daily_round_id := v_daily_round_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_auto_assign_daily_round_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_comments_flair_score"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_flair_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT flair_id INTO v_flair_id FROM posts WHERE id = NEW.post_id AND deleted_at IS NULL;
    IF v_flair_id IS NOT NULL THEN
      PERFORM apply_flair_score(NEW.user_id, v_flair_id, 1);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT flair_id INTO v_flair_id FROM posts WHERE id = OLD.post_id;
    IF v_flair_id IS NOT NULL THEN
      PERFORM apply_flair_score(OLD.user_id, v_flair_id, -1);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- soft delete
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      SELECT flair_id INTO v_flair_id FROM posts WHERE id = OLD.post_id;
      IF v_flair_id IS NOT NULL THEN
        PERFORM apply_flair_score(OLD.user_id, v_flair_id, -1);
      END IF;
    ELSIF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
      SELECT flair_id INTO v_flair_id FROM posts WHERE id = NEW.post_id;
      IF v_flair_id IS NOT NULL THEN
        PERFORM apply_flair_score(NEW.user_id, v_flair_id, 1);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trg_comments_flair_score"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_posts_flair_score"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.flair_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
      PERFORM apply_flair_score(NEW.user_id, NEW.flair_id, 10);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.flair_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
      PERFORM apply_flair_score(OLD.user_id, OLD.flair_id, -10);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- soft delete
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND OLD.flair_id IS NOT NULL THEN
      PERFORM apply_flair_score(OLD.user_id, OLD.flair_id, -10);
    -- 복원
    ELSIF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL AND NEW.flair_id IS NOT NULL THEN
      PERFORM apply_flair_score(NEW.user_id, NEW.flair_id, 10);
    -- flair 변경
    ELSIF NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL
          AND COALESCE(OLD.flair_id::text,'') <> COALESCE(NEW.flair_id::text,'') THEN
      IF OLD.flair_id IS NOT NULL THEN
        PERFORM apply_flair_score(OLD.user_id, OLD.flair_id, -10);
      END IF;
      IF NEW.flair_id IS NOT NULL THEN
        PERFORM apply_flair_score(NEW.user_id, NEW.flair_id, 10);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trg_posts_flair_score"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_update_daily_round_game_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_dr_id UUID;
BEGIN
  -- Determine which daily_round_id to update
  IF TG_OP = 'DELETE' THEN
    v_dr_id := OLD.daily_round_id;
  ELSE
    v_dr_id := NEW.daily_round_id;
  END IF;
  
  IF v_dr_id IS NOT NULL THEN
    UPDATE betman_daily_rounds
    SET game_count = (
      SELECT COUNT(*) FROM betman_games WHERE daily_round_id = v_dr_id
    ), updated_at = now()
    WHERE id = v_dr_id;
  END IF;
  
  -- Also update old daily_round on UPDATE if changed
  IF TG_OP = 'UPDATE' AND OLD.daily_round_id IS DISTINCT FROM NEW.daily_round_id AND OLD.daily_round_id IS NOT NULL THEN
    UPDATE betman_daily_rounds
    SET game_count = (
      SELECT COUNT(*) FROM betman_games WHERE daily_round_id = OLD.daily_round_id
    ), updated_at = now()
    WHERE id = OLD.daily_round_id;
  END IF;
  
  RETURN NULL; -- AFTER trigger
END;
$$;


ALTER FUNCTION "public"."trg_update_daily_round_game_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_votes_flair_score"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_flair_id   uuid;
  v_post_owner text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.vote_type = 'up' THEN
    SELECT flair_id, user_id INTO v_flair_id, v_post_owner
      FROM posts WHERE id = NEW.post_id AND deleted_at IS NULL;
    IF v_flair_id IS NOT NULL AND v_post_owner IS NOT NULL AND v_post_owner <> NEW.user_id THEN
      PERFORM apply_flair_score(v_post_owner, v_flair_id, 1);
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.vote_type = 'up' THEN
    SELECT flair_id, user_id INTO v_flair_id, v_post_owner
      FROM posts WHERE id = OLD.post_id;
    IF v_flair_id IS NOT NULL AND v_post_owner IS NOT NULL AND v_post_owner <> OLD.user_id THEN
      PERFORM apply_flair_score(v_post_owner, v_flair_id, -1);
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.vote_type <> NEW.vote_type THEN
    SELECT flair_id, user_id INTO v_flair_id, v_post_owner
      FROM posts WHERE id = NEW.post_id AND deleted_at IS NULL;
    IF v_flair_id IS NOT NULL AND v_post_owner IS NOT NULL AND v_post_owner <> NEW.user_id THEN
      IF OLD.vote_type = 'up' THEN
        PERFORM apply_flair_score(v_post_owner, v_flair_id, -1);
      END IF;
      IF NEW.vote_type = 'up' THEN
        PERFORM apply_flair_score(v_post_owner, v_flair_id, 1);
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trg_votes_flair_score"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_on_comment_for_temp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- comment_count는 이미 다른 곳에서 관리될 수 있으므로, 
    -- 여기서는 온도 점수 업데이트만 큐에 추가
    PERFORM enqueue_temperature_update(NEW.post_id);
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_on_comment_for_temp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_on_post_created"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.temperature := (
      SELECT new_boost_max FROM scoring_config WHERE is_active = true LIMIT 1
    );
    NEW.temp_score_updated_at := now();
    NEW.scoring_version := 'v1';
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_on_post_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_on_vote_for_temp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- votes 테이블은 polymorphic: target_type = 'post' 일 때만 처리
    IF NEW.target_type = 'post' THEN
        -- vote_count 증가 (upvote만 카운트, vote_value = 1)
        IF NEW.vote_value = 1 THEN
            UPDATE posts SET vote_count = vote_count + 1 WHERE id = NEW.target_id;
        ELSIF NEW.vote_value = -1 THEN
            UPDATE posts SET vote_count = GREATEST(0, vote_count - 1) WHERE id = NEW.target_id;
        END IF;
        
        -- 온도 점수 업데이트 큐에 추가
        PERFORM enqueue_temperature_update(NEW.target_id);
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_on_vote_for_temp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_user_temp_on_comment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM update_user_temperature(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."trigger_update_user_temp_on_comment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_user_temp_on_post"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM update_user_temperature(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."trigger_update_user_temp_on_post"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_user_temp_on_vote"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_post_author text;
BEGIN
  PERFORM update_user_temperature(COALESCE(NEW.user_id, OLD.user_id));
  
  SELECT user_id INTO v_post_author
  FROM posts WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  
  IF v_post_author IS NOT NULL AND v_post_author != COALESCE(NEW.user_id, OLD.user_id) THEN
    PERFORM update_user_temperature(v_post_author);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."trigger_update_user_temp_on_vote"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trip_update_recommendation_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE public.trip_itineraries SET recommendation_count = COALESCE(recommendation_count, 0) + 1 WHERE id = NEW.itinerary_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE public.trip_itineraries SET recommendation_count = GREATEST(COALESCE(recommendation_count, 0) - 1, 0) WHERE id = OLD.itinerary_id;
  END IF; RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trip_update_recommendation_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trip_update_save_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE public.trip_itineraries SET save_count = COALESCE(save_count, 0) + 1 WHERE id = NEW.itinerary_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE public.trip_itineraries SET save_count = GREATEST(COALESCE(save_count, 0) - 1, 0) WHERE id = OLD.itinerary_id;
  END IF; RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trip_update_save_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trip_update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."trip_update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_active_post_temperatures"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  updated_count int := 0;
BEGIN
  -- 7일 이내 게시물 온도 재계산
  UPDATE posts
  SET temperature = calculate_post_temperature(id)
  WHERE deleted_at IS NULL
    AND created_at > now() - INTERVAL '7 days';

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- 7일 초과 게시물 중 온도 > 0인 것만 리셋
  UPDATE posts
  SET temperature = 0
  WHERE deleted_at IS NULL
    AND created_at <= now() - INTERVAL '7 days'
    AND temperature > 0;

  RETURN updated_count;
END;
$$;


ALTER FUNCTION "public"."update_active_post_temperatures"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_active_rounds"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_active_rounds jsonb;
BEGIN
  SELECT jsonb_agg(DISTINCT r.gm_ts)
  INTO v_active_rounds
  FROM betman_rounds r
  WHERE r.status IN ('open', 'scheduled')
    AND EXISTS (
      SELECT 1 FROM betman_games g
      WHERE g.round_id = r.id
        AND g.status = 'scheduled'
    );

  UPDATE betman_sync_state
  SET active_rounds = COALESCE(v_active_rounds, '[]'::jsonb),
      updated_at = now()
  WHERE id = (SELECT id FROM betman_sync_state ORDER BY updated_at DESC LIMIT 1);
END;
$$;


ALTER FUNCTION "public"."update_active_rounds"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_comment_cooldown"("user_id_param" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO comment_cooldowns (user_id, last_comment_at, updated_at)
  VALUES (user_id_param, now(), now())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    last_comment_at = now(),
    updated_at = now();
END;
$$;


ALTER FUNCTION "public"."update_comment_cooldown"("user_id_param" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_commission_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_commission_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_match_prediction_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE matches SET prediction_count = prediction_count + 1 WHERE id = NEW.match_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE matches SET prediction_count = prediction_count - 1 WHERE id = OLD.match_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_match_prediction_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_post_comment_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL) THEN
    UPDATE public.posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_post_comment_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_post_last_comment_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_post_id uuid;
BEGIN
  target_post_id := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE posts SET last_comment_at = (
    SELECT MAX(created_at) FROM comments
    WHERE post_id = target_post_id AND deleted_at IS NULL
  ) WHERE id = target_post_id;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_post_last_comment_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_stadium_fan_counts"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE team_stadiums ts
  SET fan_count = sub.cnt, updated_at = now()
  FROM (
    SELECT team_id, COUNT(DISTINCT user_id) AS cnt
    FROM stadium_contributions
    WHERE points_contributed > 0
    GROUP BY team_id
  ) sub
  WHERE ts.team_id = sub.team_id AND ts.fan_count != sub.cnt;
END;
$$;


ALTER FUNCTION "public"."update_stadium_fan_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_temp_after_comment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_post_id uuid;
BEGIN
  target_post_id := COALESCE(NEW.post_id, OLD.post_id);
  PERFORM update_temperature_score(target_post_id);
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_temp_after_comment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_temp_after_vote"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_post_id uuid;
BEGIN
  target_post_id := COALESCE(NEW.post_id, OLD.post_id);
  PERFORM update_temperature_score(target_post_id);
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_temp_after_vote"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_temperature_score"("p_post_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE posts
  SET temperature = calculate_post_temperature(p_post_id)
  WHERE id = p_post_id;
END;
$$;


ALTER FUNCTION "public"."update_temperature_score"("p_post_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_content_counts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_TABLE_NAME = 'posts' THEN
    IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
      UPDATE profiles SET post_count = post_count + 1 WHERE user_id = NEW.user_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'comments' THEN
    IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
      UPDATE profiles SET comment_count = comment_count + 1 WHERE user_id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_content_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_stats_on_settlement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only process when status changes from pending
  IF OLD.status = 'pending' AND NEW.status IN ('won', 'lost') THEN
    IF NEW.status = 'won' THEN
      UPDATE user_prediction_stats SET
        pending_predictions = pending_predictions - 1,
        correct_predictions = correct_predictions + 1,
        points_won = points_won + NEW.points_won,
        total_points = total_points + NEW.points_won,
        current_streak = CASE WHEN current_streak >= 0 THEN current_streak + 1 ELSE 1 END,
        best_win_streak = GREATEST(best_win_streak, CASE WHEN current_streak >= 0 THEN current_streak + 1 ELSE 1 END),
        highest_points = GREATEST(highest_points, total_points + NEW.points_won),
        win_rate = CASE WHEN (correct_predictions + wrong_predictions + 1) > 0 
          THEN ROUND(((correct_predictions + 1)::DECIMAL / (correct_predictions + wrong_predictions + 1)) * 100, 2)
          ELSE 0 END,
        updated_at = NOW()
      WHERE user_id = NEW.user_id;
    ELSE -- lost
      UPDATE user_prediction_stats SET
        pending_predictions = pending_predictions - 1,
        wrong_predictions = wrong_predictions + 1,
        points_lost = points_lost + NEW.points_wagered,
        total_points = total_points - NEW.points_wagered,
        current_streak = CASE WHEN current_streak <= 0 THEN current_streak - 1 ELSE -1 END,
        worst_lose_streak = LEAST(worst_lose_streak, CASE WHEN current_streak <= 0 THEN current_streak - 1 ELSE -1 END),
        win_rate = CASE WHEN (correct_predictions + wrong_predictions + 1) > 0 
          THEN ROUND((correct_predictions::DECIMAL / (correct_predictions + wrong_predictions + 1)) * 100, 2)
          ELSE 0 END,
        updated_at = NOW()
      WHERE user_id = NEW.user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_stats_on_settlement"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_temperature"("p_user_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- 유저 온도 집계는 추후 구현
  RETURN;
END;
$$;


ALTER FUNCTION "public"."update_user_temperature"("p_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_vote_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  delta INTEGER;
  t_type TEXT;
  t_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    t_type := OLD.target_type;
    t_id := OLD.target_id;
    delta := -OLD.vote_value;
  ELSIF TG_OP = 'INSERT' THEN
    t_type := NEW.target_type;
    t_id := NEW.target_id;
    delta := NEW.vote_value;
  ELSIF TG_OP = 'UPDATE' THEN
    t_type := NEW.target_type;
    t_id := NEW.target_id;
    delta := NEW.vote_value - OLD.vote_value;
  END IF;
  
  IF t_type = 'post' THEN
    UPDATE public.posts SET vote_count = vote_count + delta WHERE id = t_id;
  ELSIF t_type = 'comment' THEN
    UPDATE public.comments SET vote_count = vote_count + delta WHERE id = t_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_vote_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vote_sticker"("p_sticker_id" "uuid", "p_user_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_exists BOOLEAN;
  v_new_count INT;
  v_threshold INT;
  v_status TEXT;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM sticker_votes WHERE sticker_id = p_sticker_id AND user_id = p_user_id
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_voted');
  END IF;

  SELECT status, vote_threshold INTO v_status, v_threshold
  FROM stickers WHERE id = p_sticker_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending');
  END IF;

  INSERT INTO sticker_votes (sticker_id, user_id) VALUES (p_sticker_id, p_user_id);

  UPDATE stickers SET vote_count = vote_count + 1 WHERE id = p_sticker_id
  RETURNING vote_count INTO v_new_count;

  IF v_new_count >= v_threshold THEN
    UPDATE stickers SET status = 'approved', approved_at = now() WHERE id = p_sticker_id;
    RETURN jsonb_build_object('success', true, 'vote_count', v_new_count, 'auto_approved', true);
  END IF;

  RETURN jsonb_build_object('success', true, 'vote_count', v_new_count, 'auto_approved', false);
END;
$$;


ALTER FUNCTION "public"."vote_sticker"("p_sticker_id" "uuid", "p_user_id" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."adj_titles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "rarity" "text" DEFAULT 'common'::"text" NOT NULL,
    "board_slug" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."adj_titles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_user_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "text" NOT NULL,
    "persona_id" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "target_id" "text",
    "parent_id" "text",
    "content_preview" "text",
    "success" boolean DEFAULT true NOT NULL,
    "error" "text",
    "latency_ms" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_actions_action_type_check" CHECK (("action_type" = ANY (ARRAY['post'::"text", 'comment'::"text", 'reply'::"text", 'upvote'::"text", 'downvote'::"text", 'oembed_test'::"text"])))
);


ALTER TABLE "public"."agent_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_personas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "persona_id" "text" NOT NULL,
    "nickname" "text" NOT NULL,
    "clerk_user_id" "text",
    "role_type" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_personas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "summary" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_runs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."agent_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcement_banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "link_url" "text",
    "gradient" "text" DEFAULT 'from-blue-600 to-indigo-700'::"text",
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."announcement_banners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text",
    "is_pinned" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "view_count" integer DEFAULT 0,
    "created_by" "text",
    "published_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "announcements_category_check" CHECK (("category" = ANY (ARRAY['general'::"text", 'update'::"text", 'event'::"text", 'maintenance'::"text", 'important'::"text"])))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "image_url" "text" NOT NULL,
    "link_url" "text",
    "position" "text" DEFAULT 'home_hero'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "starts_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "click_count" integer DEFAULT 0,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "banners_position_check" CHECK (("position" = ANY (ARRAY['home_hero'::"text", 'home_mid'::"text", 'gallery_top'::"text", 'sidebar'::"text"])))
);


ALTER TABLE "public"."banners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."battle_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "battle_id" "uuid" NOT NULL,
    "side_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "nickname" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."battle_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."battle_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "battle_id" "uuid" NOT NULL,
    "side_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."battle_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."battle_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "mode" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "category" "text",
    "thumbnail_url" "text",
    "created_by" "text" NOT NULL,
    "approved_by" "text",
    "approved_at" timestamp with time zone,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "bracket_size" integer,
    "total_participants" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "battle_rooms_mode_check" CHECK (("mode" = ANY (ARRAY['cheer'::"text", 'worldcup'::"text"]))),
    CONSTRAINT "battle_rooms_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'upcoming'::"text", 'active'::"text", 'ended'::"text"])))
);


ALTER TABLE "public"."battle_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."battle_sides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "battle_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "image_url" "text",
    "color" "text" DEFAULT '#10b981'::"text" NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."battle_sides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."betman_daily_rounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "daily_id" "date" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "bet_open_at" timestamp with time zone NOT NULL,
    "bet_close_at" timestamp with time zone NOT NULL,
    "game_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "betman_daily_rounds_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text", 'settled'::"text"])))
);


ALTER TABLE "public"."betman_daily_rounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."betman_games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "round_id" "uuid" NOT NULL,
    "game_no" integer NOT NULL,
    "match_time" timestamp with time zone NOT NULL,
    "sport" "text" NOT NULL,
    "league_code" "text" NOT NULL,
    "game_type" "text" NOT NULL,
    "home_team_name" "text" NOT NULL,
    "away_team_name" "text" NOT NULL,
    "handicap" numeric,
    "venue" "text",
    "home_score" integer,
    "away_score" integer,
    "result" "text",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "mapped_match_id" "text",
    "mapped_home_team_id" "text",
    "mapped_away_team_id" "text",
    "mapped_league_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "home_win_odds" numeric(5,2),
    "away_win_odds" numeric(5,2),
    "draw_odds" numeric(5,2),
    "over_odds" numeric(5,2),
    "under_odds" numeric(5,2),
    "odd_odds" numeric(5,2),
    "even_odds" numeric(5,2),
    "over_under_line" numeric,
    "daily_round_id" "uuid",
    CONSTRAINT "betman_games_result_check" CHECK (("result" = ANY (ARRAY['home'::"text", 'draw'::"text", 'away'::"text", 'over'::"text", 'under'::"text", 'odd'::"text", 'even'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "betman_games_sport_check" CHECK (("sport" = ANY (ARRAY['축구'::"text", '농구'::"text", '야구'::"text", '배구'::"text", '하키'::"text"]))),
    CONSTRAINT "betman_games_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text", 'postponed'::"text"])))
);


ALTER TABLE "public"."betman_games" OWNER TO "postgres";


COMMENT ON TABLE "public"."betman_games" IS 'Betman 개별 경기 데이터 (일반, 핸디캡, 언더오버, SUM 등)';



COMMENT ON COLUMN "public"."betman_games"."handicap" IS '핸디캡 스프레드 (홈팀 기준). 예: -4.5는 홈팀이 4.5점 핸디 부여, +2.5는 홈팀이 2.5점 핸디 받음';



COMMENT ON COLUMN "public"."betman_games"."home_win_odds" IS '홈팀 승리 배당률 (일반/핸디캡)';



COMMENT ON COLUMN "public"."betman_games"."away_win_odds" IS '원정팀 승리 배당률 (일반/핸디캡)';



COMMENT ON COLUMN "public"."betman_games"."draw_odds" IS '무승부 배당률 (축구 일반)';



COMMENT ON COLUMN "public"."betman_games"."over_odds" IS '오버 배당률 (언더오버)';



COMMENT ON COLUMN "public"."betman_games"."under_odds" IS '언더 배당률 (언더오버)';



COMMENT ON COLUMN "public"."betman_games"."odd_odds" IS '홀수 배당률 (SUM)';



COMMENT ON COLUMN "public"."betman_games"."even_odds" IS '짝수 배당률 (SUM)';



COMMENT ON COLUMN "public"."betman_games"."over_under_line" IS '언오버 기준선. 예: 218.5는 총점 218.5점 기준으로 오버/언더';



CREATE TABLE IF NOT EXISTS "public"."betman_predictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "prediction" "text" NOT NULL,
    "is_correct" boolean,
    "points_earned" numeric(10,2) DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "settled_at" timestamp with time zone,
    "round_id" "uuid",
    "daily_round_id" "uuid",
    "stake" integer DEFAULT 1 NOT NULL,
    "slip_id" "uuid",
    "locked_odds" numeric,
    CONSTRAINT "betman_predictions_prediction_check" CHECK (("prediction" = ANY (ARRAY['home'::"text", 'draw'::"text", 'away'::"text", 'over'::"text", 'under'::"text"]))),
    CONSTRAINT "betman_predictions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'settled'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "chk_prediction_locked_odds_non_negative" CHECK ((("locked_odds" IS NULL) OR ("locked_odds" >= (0)::numeric)))
);


ALTER TABLE "public"."betman_predictions" OWNER TO "postgres";


COMMENT ON TABLE "public"."betman_predictions" IS 'Betman 경기에 대한 사용자 예측';



COMMENT ON COLUMN "public"."betman_predictions"."stake" IS '베팅 금액 (볼 단위)';



COMMENT ON COLUMN "public"."betman_predictions"."locked_odds" IS '베팅 시점에 잠긴 배당률 (정산 시 이 값 우선 사용)';



CREATE TABLE IF NOT EXISTS "public"."betman_rounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "year" integer NOT NULL,
    "round" integer NOT NULL,
    "deadline" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "gm_ts" "text",
    CONSTRAINT "betman_rounds_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text", 'settled'::"text"])))
);


ALTER TABLE "public"."betman_rounds" OWNER TO "postgres";


COMMENT ON TABLE "public"."betman_rounds" IS 'Betman 회차 정보';



CREATE TABLE IF NOT EXISTS "public"."betman_sync_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "latest_gm_ts" "text" DEFAULT ''::"text" NOT NULL,
    "active_rounds" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "last_checked_at" timestamp with time zone,
    "last_sync_action" "text",
    "last_sync_games_count" integer DEFAULT 0,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_score_sync_at" timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone
);


ALTER TABLE "public"."betman_sync_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."betman_unknown_games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "gm_ts" "text" NOT NULL,
    "game_no" integer DEFAULT '-1'::integer NOT NULL,
    "bet_typ_id" "text" DEFAULT ''::"text" NOT NULL,
    "handi_val" integer DEFAULT '-1'::integer NOT NULL,
    "game_result" "text",
    "mch_score" "text",
    "home_score" integer,
    "away_score" integer,
    "sport" "text",
    "league_code" "text",
    "home_team_name" "text",
    "away_team_name" "text",
    "match_time" timestamp with time zone,
    "raw_data" "jsonb" NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "betman_unknown_games_source_check" CHECK (("source" = ANY (ARRAY['game'::"text", 'result'::"text"])))
);


ALTER TABLE "public"."betman_unknown_games" OWNER TO "postgres";


COMMENT ON TABLE "public"."betman_unknown_games" IS 'BET_TYPE_MAP/RESULT_HANDI_MAP 에 없는 betman 게임/결과 raw 캡처. 신규 베팅 유형(전반전 등) 식별용. 정산/UI 미사용.';



CREATE TABLE IF NOT EXISTS "public"."betman_user_sport_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "sport" "text" NOT NULL,
    "total_predictions" integer DEFAULT 0,
    "correct_predictions" integer DEFAULT 0,
    "wrong_predictions" integer DEFAULT 0,
    "cancelled_predictions" integer DEFAULT 0,
    "accuracy" numeric(5,2) DEFAULT 0,
    "total_wagered" integer DEFAULT 0,
    "total_returns" numeric(10,2) DEFAULT 0,
    "net_profit" numeric(10,2) DEFAULT 0,
    "profit_rate" numeric(7,2) DEFAULT 0,
    "current_streak" integer DEFAULT 0,
    "best_win_streak" integer DEFAULT 0,
    "worst_lose_streak" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "betman_user_sport_stats_sport_check" CHECK (("sport" = ANY (ARRAY['축구'::"text", '농구'::"text", '배구'::"text", '야구'::"text", '하키'::"text", '전체'::"text"])))
);


ALTER TABLE "public"."betman_user_sport_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true NOT NULL,
    "description" "text",
    "parent_slug" "text"
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."categories" IS '커뮤니티 게시판 카테고리 (탐색 페이지 카드 표시용)';



COMMENT ON COLUMN "public"."categories"."is_active" IS '탐색 페이지에 표시 여부';



COMMENT ON COLUMN "public"."categories"."description" IS '게시판 설명';



CREATE TABLE IF NOT EXISTS "public"."comment_cooldowns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "last_comment_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."comment_cooldowns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comment_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "vote_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "comment_votes_vote_type_check" CHECK (("vote_type" = ANY (ARRAY['up'::"text", 'down'::"text"])))
);


ALTER TABLE "public"."comment_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "parent_id" "uuid",
    "content" "text" NOT NULL,
    "vote_count" integer DEFAULT 0,
    "depth" integer DEFAULT 0,
    "path" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "sticker_id" "uuid"
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commission_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "sender_id" "text" NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "attachments" "text"[] DEFAULT '{}'::"text"[],
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "commission_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'file'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."commission_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commission_milestones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "milestone_number" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "deliverable_images" "text"[] DEFAULT '{}'::"text"[],
    "deliverable_note" "text",
    "submitted_at" timestamp with time zone,
    "feedback" "text",
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "commission_milestones_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'submitted'::"text", 'approved'::"text", 'revision_requested'::"text"])))
);


ALTER TABLE "public"."commission_milestones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commission_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" "text" NOT NULL,
    "package_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "artist_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "reference_images" "text"[] DEFAULT '{}'::"text"[],
    "price_gold" integer NOT NULL,
    "platform_fee_gold" integer DEFAULT 0 NOT NULL,
    "delivery_days" integer NOT NULL,
    "max_revisions" integer DEFAULT 2 NOT NULL,
    "revisions_used" integer DEFAULT 0 NOT NULL,
    "escrow_held" boolean DEFAULT false NOT NULL,
    "escrow_released_at" timestamp with time zone,
    "escrow_refunded_at" timestamp with time zone,
    "deadline_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "text",
    "cancel_reason" "text",
    "auto_release_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "client_not_artist" CHECK (("client_id" <> "artist_id")),
    CONSTRAINT "commission_orders_price_gold_check" CHECK (("price_gold" > 0)),
    CONSTRAINT "commission_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'in_progress'::"text", 'review'::"text", 'revision'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."commission_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commission_packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artist_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "features" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "price_gold" integer NOT NULL,
    "delivery_days" integer NOT NULL,
    "max_revisions" integer DEFAULT 2 NOT NULL,
    "example_images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "max_slots" integer DEFAULT 3 NOT NULL,
    "used_slots" integer DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "commission_packages_delivery_days_check" CHECK (("delivery_days" > 0)),
    CONSTRAINT "commission_packages_max_slots_check" CHECK (("max_slots" > 0)),
    CONSTRAINT "commission_packages_price_gold_check" CHECK (("price_gold" > 0)),
    CONSTRAINT "commission_packages_type_check" CHECK (("type" = ANY (ARRAY['illustration'::"text", 'character-design'::"text", 'portrait'::"text", 'logo'::"text", 'comic-page'::"text", 'animation'::"text", 'concept-art'::"text", 'custom'::"text"]))),
    CONSTRAINT "commission_packages_used_slots_check" CHECK (("used_slots" >= 0)),
    CONSTRAINT "slots_check" CHECK (("used_slots" <= "max_slots"))
);


ALTER TABLE "public"."commission_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "community_slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."community_follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "text" NOT NULL,
    "is_test_data" boolean DEFAULT true NOT NULL,
    "generator" "text" DEFAULT 'agent_test'::"text" NOT NULL,
    "run_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "content_flags_target_type_check" CHECK (("target_type" = ANY (ARRAY['post'::"text", 'comment'::"text", 'profile'::"text"])))
);


ALTER TABLE "public"."content_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "assigned_to" "text",
    "resolved_at" timestamp with time zone,
    "resolution" "text",
    "resolved_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "content_reports_reason_check" CHECK (("reason" = ANY (ARRAY['discrimination'::"text", 'advertising'::"text", 'profanity'::"text", 'abuse'::"text", 'political'::"text"]))),
    CONSTRAINT "content_reports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reviewing'::"text", 'resolved'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "content_reports_target_type_check" CHECK (("target_type" = ANY (ARRAY['post'::"text", 'comment'::"text", 'ticker'::"text"])))
);


ALTER TABLE "public"."content_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crawler_run_log" (
    "id" bigint NOT NULL,
    "source_id" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "items_fetched" integer DEFAULT 0,
    "items_saved" integer DEFAULT 0,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crawler_run_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."crawler_run_log" IS 'Internal crawler logging. RLS enabled, no policies = service_role only access.';



ALTER TABLE "public"."crawler_run_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."crawler_run_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cron_run_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_name" "text" NOT NULL,
    "status" "text" NOT NULL,
    "http_status" integer,
    "error_message" "text",
    "duration_ms" integer,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cron_run_log_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."cron_run_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_point_caps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "board_slug" "text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "earned_today" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."daily_point_caps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."direct_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "text" NOT NULL,
    "receiver_id" "text" NOT NULL,
    "content" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted_by_sender" boolean DEFAULT false,
    "deleted_by_receiver" boolean DEFAULT false
);


ALTER TABLE "public"."direct_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "commission_id" "uuid" NOT NULL,
    "raised_by" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "description" "text" NOT NULL,
    "evidence_urls" "text"[] DEFAULT '{}'::"text"[],
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "resolution" "text",
    "refund_amount" numeric,
    "admin_id" "text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "disputes_reason_check" CHECK (("reason" = ANY (ARRAY['quality'::"text", 'delay'::"text", 'communication'::"text", 'not_as_described'::"text", 'cancellation'::"text", 'other'::"text"]))),
    CONSTRAINT "disputes_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'investigating'::"text", 'mediation'::"text", 'resolved_client'::"text", 'resolved_artist'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."disputes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."draft_participants" (
    "id" bigint NOT NULL,
    "room_id" bigint NOT NULL,
    "user_id" "text" NOT NULL,
    "seat_index" integer NOT NULL,
    "display_name" "text" NOT NULL,
    "avatar_url" "text",
    "is_ready" boolean DEFAULT false NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "draft_participants_seat_index_check" CHECK ((("seat_index" >= 0) AND ("seat_index" <= 3)))
);


ALTER TABLE "public"."draft_participants" OWNER TO "postgres";


ALTER TABLE "public"."draft_participants" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."draft_participants_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."draft_picks" (
    "id" bigint NOT NULL,
    "room_id" bigint NOT NULL,
    "pick_number" integer NOT NULL,
    "seat_index" integer NOT NULL,
    "player_id" "text" NOT NULL,
    "is_auto_pick" boolean DEFAULT false NOT NULL,
    "picked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "draft_picks_seat_index_check" CHECK ((("seat_index" >= 0) AND ("seat_index" <= 3)))
);


ALTER TABLE "public"."draft_picks" OWNER TO "postgres";


ALTER TABLE "public"."draft_picks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."draft_picks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."draft_results" (
    "id" bigint NOT NULL,
    "room_id" bigint NOT NULL,
    "user_id" "text" NOT NULL,
    "seat_index" integer NOT NULL,
    "total_cost" numeric(6,1) DEFAULT 0 NOT NULL,
    "player_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "gold_rewarded" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "draft_results_seat_index_check" CHECK ((("seat_index" >= 0) AND ("seat_index" <= 3)))
);


ALTER TABLE "public"."draft_results" OWNER TO "postgres";


ALTER TABLE "public"."draft_results" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."draft_results_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."draft_rooms" (
    "id" bigint NOT NULL,
    "room_code" "text" NOT NULL,
    "game_mode_id" "text" DEFAULT 'epl'::"text" NOT NULL,
    "host_user_id" "text" NOT NULL,
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "current_pick" integer DEFAULT 0 NOT NULL,
    "pick_deadline_at" timestamp with time zone,
    "snake_order" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "draft_rooms_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'drafting'::"text", 'completed'::"text", 'abandoned'::"text"])))
);


ALTER TABLE "public"."draft_rooms" OWNER TO "postgres";


ALTER TABLE "public"."draft_rooms" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."draft_rooms_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."event_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "club_kor" "text",
    "color" "text" NOT NULL,
    "motto" "text",
    "source_channel" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_leaderboard_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accuracy" numeric(5,2),
    "profit_rate" numeric(7,2),
    "rank_in_group" integer,
    "total_in_group" integer
);


ALTER TABLE "public"."event_leaderboard_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "traffic_source" "text",
    "registered_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "prize_description" "text",
    "start_at" timestamp with time zone NOT NULL,
    "end_at" timestamp with time zone NOT NULL,
    "registration_closes_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "league_codes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "events_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'live'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "faqs_category_check" CHECK (("category" = ANY (ARRAY['general'::"text", 'commission'::"text", 'payment'::"text", 'artist'::"text", 'delivery'::"text", 'refund'::"text"])))
);


ALTER TABLE "public"."faqs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_test_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "target_id" "text",
    "target_url" "text",
    "success" boolean NOT NULL,
    "error" "text",
    "latency_ms" integer,
    "response_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feature_test_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flair_titles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "flair_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "threshold" integer NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."flair_titles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gold_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "amount" integer NOT NULL,
    "balance_after" integer NOT NULL,
    "description" "text",
    "related_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "idempotency_key" "uuid",
    CONSTRAINT "gold_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['purchase'::"text", 'prediction_purchase'::"text", 'reward'::"text", 'admin_adjustment'::"text", 'commission_escrow_hold'::"text", 'commission_escrow_release'::"text", 'commission_escrow_refund'::"text", 'commission_fee'::"text", 'onboarding_reward'::"text", 'mini_game_reward'::"text", 'purchase_refund'::"text", 'analysis_sale_revenue'::"text"])))
);


ALTER TABLE "public"."gold_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "view_count" integer DEFAULT 0,
    "vote_count" integer DEFAULT 0,
    "comment_count" integer DEFAULT 0,
    "temperature" double precision DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "image" "text",
    "community_slug" "text",
    "content" "jsonb" NOT NULL,
    "is_notice" boolean DEFAULT false,
    "view_count_unique" integer DEFAULT 0 NOT NULL,
    "temp_score_updated_at" timestamp with time zone,
    "scoring_version" "text" DEFAULT 'v1'::"text",
    "flair_id" "uuid",
    "last_comment_at" timestamp with time zone,
    "flair_team_id" "text"
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."hot_feed" AS
 SELECT "id",
    "title",
    "user_id",
    "category_id",
    "content",
    "image",
    "community_slug",
    "created_at",
    "vote_count",
    "comment_count",
    "view_count",
    "view_count_unique",
    "temperature",
    "temp_score_updated_at",
    "scoring_version"
   FROM "public"."posts" "p"
  WHERE (("deleted_at" IS NULL) AND ("created_at" >= ("now"() - '24:00:00'::interval)))
  ORDER BY "temperature" DESC
 LIMIT 200
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."hot_feed" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inquiries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text",
    "category" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "content" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "commission_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text",
    "admin_reply" "text",
    "replied_by" "text",
    "replied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inquiries_category_check" CHECK (("category" = ANY (ARRAY['general'::"text", 'commission'::"text", 'payment'::"text", 'refund'::"text", 'artist'::"text", 'technical'::"text", 'other'::"text"]))),
    CONSTRAINT "inquiries_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "inquiries_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'resolved'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."inquiries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."league_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "text",
    "alias" "text" NOT NULL,
    "source" "text" DEFAULT 'betman'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."league_aliases" OWNER TO "postgres";


COMMENT ON TABLE "public"."league_aliases" IS '리그 이름 별칭 (Betman 리그코드 등)';



CREATE TABLE IF NOT EXISTS "public"."leagues" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "country_code" "text",
    "sport_type" "text" DEFAULT 'football'::"text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "name_ko" "text"
);


ALTER TABLE "public"."leagues" OWNER TO "postgres";


COMMENT ON TABLE "public"."leagues" IS 'Sports leagues from bet365 API';



COMMENT ON COLUMN "public"."leagues"."name_ko" IS 'Korean display name for the league';



CREATE TABLE IF NOT EXISTS "public"."live_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid",
    "name" "text" NOT NULL,
    "sport" "text" DEFAULT 'football'::"text" NOT NULL,
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone
);


ALTER TABLE "public"."live_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_odds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "text" NOT NULL,
    "fi" "text",
    "event_id" "text",
    "full_time_result" "jsonb",
    "double_chance" "jsonb",
    "both_teams_to_score" "jsonb",
    "goals_over_under" "jsonb",
    "asian_handicap" "jsonb",
    "goal_line" "jsonb",
    "half_time_result" "jsonb",
    "half_time_over_under" "jsonb",
    "correct_score" "jsonb",
    "first_goal_scorer" "jsonb",
    "last_goal_scorer" "jsonb",
    "raw_odds" "jsonb",
    "odds_updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."match_odds" OWNER TO "postgres";


COMMENT ON TABLE "public"."match_odds" IS 'Betting odds for matches from bet365 API';



CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "text" NOT NULL,
    "league_id" "text",
    "home_team_id" "text",
    "away_team_id" "text",
    "match_time" timestamp with time zone NOT NULL,
    "time_status" smallint DEFAULT 0 NOT NULL,
    "score_home" integer,
    "score_away" integer,
    "scores" "jsonb",
    "stats" "jsonb",
    "events" "jsonb",
    "extra" "jsonb",
    "is_prediction_open" boolean DEFAULT true,
    "prediction_close_time" timestamp with time zone,
    "prediction_count" integer DEFAULT 0,
    "sport_type" "text" DEFAULT 'football'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


COMMENT ON TABLE "public"."matches" IS 'Sports matches from bet365 API with prediction game settings';



CREATE TABLE IF NOT EXISTS "public"."metaverse_avatar_inventory" (
    "user_id" "text" NOT NULL,
    "avatar_key" "text" NOT NULL,
    "acquired_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'purchase'::"text" NOT NULL,
    "price_paid_gold" integer
);


ALTER TABLE "public"."metaverse_avatar_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."metaverse_avatar_items" (
    "avatar_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "price_gold" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "metaverse_avatar_items_price_gold_check" CHECK (("price_gold" >= 0))
);


ALTER TABLE "public"."metaverse_avatar_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."metaverse_chat_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plot_id" "uuid" NOT NULL,
    "owner_user_id" "text" NOT NULL,
    "sign_text" character varying(20) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone
);


ALTER TABLE "public"."metaverse_chat_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."metaverse_fandom_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "team_id" "text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "joined_with_points" integer NOT NULL
);


ALTER TABLE "public"."metaverse_fandom_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."metaverse_user_activity_balance" (
    "user_id" "text" NOT NULL,
    "spendable_points" integer DEFAULT 0 NOT NULL,
    "lifetime_earned" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "metaverse_user_activity_balance_lifetime_earned_check" CHECK (("lifetime_earned" >= 0)),
    CONSTRAINT "metaverse_user_activity_balance_spendable_points_check" CHECK (("spendable_points" >= 0))
);


ALTER TABLE "public"."metaverse_user_activity_balance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."metaverse_user_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_user_id" "text" NOT NULL,
    "reported_user_id" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "note" "text",
    "context_scope" "text",
    "context_room_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "text",
    CONSTRAINT "metaverse_user_reports_check" CHECK (("reporter_user_id" <> "reported_user_id")),
    CONSTRAINT "metaverse_user_reports_context_scope_check" CHECK (("context_scope" = ANY (ARRAY['world'::"text", 'room'::"text", 'local'::"text", 'other'::"text"]))),
    CONSTRAINT "metaverse_user_reports_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 500))),
    CONSTRAINT "metaverse_user_reports_reason_check" CHECK ((("char_length"("reason") >= 1) AND ("char_length"("reason") <= 40))),
    CONSTRAINT "metaverse_user_reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewed'::"text", 'dismissed'::"text", 'actioned'::"text"])))
);


ALTER TABLE "public"."metaverse_user_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."metaverse_world_plots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plot_code" "text" NOT NULL,
    "plaza_name" "text" NOT NULL,
    "pin_x" numeric NOT NULL,
    "pin_y" numeric NOT NULL,
    "width_units" integer DEFAULT 6 NOT NULL,
    "height_units" integer DEFAULT 6 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "metaverse_world_plots_pin_x_check" CHECK ((("pin_x" >= (0)::numeric) AND ("pin_x" <= (100)::numeric))),
    CONSTRAINT "metaverse_world_plots_pin_y_check" CHECK ((("pin_y" >= (0)::numeric) AND ("pin_y" <= (100)::numeric)))
);


ALTER TABLE "public"."metaverse_world_plots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movie_quiz_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "quiz_id" "uuid" NOT NULL,
    "selected_answer" integer NOT NULL,
    "is_correct" boolean NOT NULL,
    "points_earned" integer DEFAULT 0 NOT NULL,
    "time_taken_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."movie_quiz_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movie_quizzes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "difficulty" "text" DEFAULT 'normal'::"text" NOT NULL,
    "question" "text" NOT NULL,
    "image_url" "text",
    "choices" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "correct_answer" integer NOT NULL,
    "explanation" "text",
    "movie_title" "text",
    "movie_year" integer,
    "points" integer DEFAULT 10 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "movie_quizzes_category_check" CHECK (("category" = ANY (ARRAY['scene'::"text", 'quote'::"text", 'actor'::"text", 'ost'::"text", 'poster'::"text", 'trivia'::"text"]))),
    CONSTRAINT "movie_quizzes_correct_answer_check" CHECK ((("correct_answer" >= 0) AND ("correct_answer" <= 3))),
    CONSTRAINT "movie_quizzes_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['easy'::"text", 'normal'::"text", 'hard'::"text"])))
);


ALTER TABLE "public"."movie_quizzes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news_alias_dictionary" (
    "id" "text" NOT NULL,
    "category" "text" NOT NULL,
    "preferred_ko" "text" NOT NULL,
    "romanized" "text" NOT NULL,
    "surfaces" "text"[] NOT NULL,
    "hangul_alts" "text"[],
    "disambiguation" "text",
    "confidence" double precision NOT NULL,
    "ko_first_seen" "text",
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "news_alias_dictionary_category_check" CHECK (("category" = ANY (ARRAY['player'::"text", 'team'::"text", 'coach'::"text", 'competition'::"text"]))),
    CONSTRAINT "news_alias_dictionary_confidence_check" CHECK ((("confidence" >= (0)::double precision) AND ("confidence" <= (1)::double precision)))
);


ALTER TABLE "public"."news_alias_dictionary" OWNER TO "postgres";


COMMENT ON TABLE "public"."news_alias_dictionary" IS '선수/팀/감독/대회의 한국어 표기 마스터. Naming Resolver가 READ-ONLY로 사용. 수정은 admin 작업.';



CREATE TABLE IF NOT EXISTS "public"."news_reservoir" (
    "id" "text" NOT NULL,
    "source" "jsonb" NOT NULL,
    "urls" "jsonb" NOT NULL,
    "raw" "jsonb" NOT NULL,
    "normalized" "jsonb",
    "entities" "jsonb",
    "unresolved" "jsonb",
    "tags" "text"[],
    "issue_type" "text",
    "scores" "jsonb" NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "status" "text" NOT NULL,
    "decision" "jsonb",
    "assignment" "jsonb",
    "draft" "jsonb",
    "publish" "jsonb",
    "external_key" "text",
    "audit" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."news_reservoir" OWNER TO "postgres";


COMMENT ON TABLE "public"."news_reservoir" IS 'Newsroom 파이프라인 중앙 reservoir. 모든 뉴스 에이전트는 이 테이블의 status 컬럼을 전이시키며 동작한다. data/agents/ 참조.';



CREATE OR REPLACE VIEW "public"."news_reservoir_queue_lengths" WITH ("security_invoker"='on') AS
 SELECT "status",
    "count"(*) AS "count"
   FROM "public"."news_reservoir"
  GROUP BY "status"
  ORDER BY ("count"(*)) DESC;


ALTER VIEW "public"."news_reservoir_queue_lengths" OWNER TO "postgres";


COMMENT ON VIEW "public"."news_reservoir_queue_lengths" IS '단계별 reservoir 큐 길이. desk_held가 비정상적으로 크면 alias dictionary 확장이 필요한 신호.';



CREATE TABLE IF NOT EXISTS "public"."news_ticker_items" (
    "id" bigint NOT NULL,
    "source_id" "text" NOT NULL,
    "community_slug" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "external_url" "text" NOT NULL,
    "original_title" "text" NOT NULL,
    "link_url" "text",
    "score" integer DEFAULT 0,
    "num_comments" integer DEFAULT 0,
    "flair" "text",
    "author" "text",
    "posted_at" timestamp with time zone NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "importance" smallint DEFAULT 3,
    "headline_kr" "text" NOT NULL,
    "summary_kr" "text" NOT NULL,
    "ticker_tag" "text" DEFAULT 'breaking'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "thumbnail_url" "text",
    "media_type" "text",
    CONSTRAINT "news_ticker_items_importance_check" CHECK ((("importance" >= 1) AND ("importance" <= 5))),
    CONSTRAINT "news_ticker_items_media_type_check" CHECK (("media_type" = ANY (ARRAY['youtube'::"text", 'image'::"text", 'article'::"text"])))
);


ALTER TABLE "public"."news_ticker_items" OWNER TO "postgres";


ALTER TABLE "public"."news_ticker_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."news_ticker_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "actor_id" "text" NOT NULL,
    "related_post_id" "uuid",
    "related_comment_id" "uuid",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['comment'::"text", 'reply'::"text", 'new_post_by_followed'::"text", 'expert_prediction'::"text", 'settlement_result'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."noun_titles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_slug" "text" NOT NULL,
    "required_level" integer NOT NULL,
    "title" "text" NOT NULL,
    "price" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "required_points" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."noun_titles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "amount" integer NOT NULL,
    "description" "text",
    "source" "text" NOT NULL,
    "related_slip_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    CONSTRAINT "pending_refunds_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'resolved'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."pending_refunds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_seller_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "text" NOT NULL,
    "buyer_id" "text" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "purchase_id" "uuid",
    "amount" integer NOT NULL,
    "description" "text",
    "transaction_type" "text" DEFAULT 'analysis_sale_revenue'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    CONSTRAINT "pending_seller_rewards_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'resolved'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."pending_seller_rewards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pixel_art_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "image_url" "text" NOT NULL,
    "category" "text" NOT NULL,
    "price" integer NOT NULL,
    "board_slug" "text",
    "is_limited" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pixel_art_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."point_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "board_slug" "text" NOT NULL,
    "amount" integer NOT NULL,
    "transaction_type" "text" NOT NULL,
    "description" "text",
    "related_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."point_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_flairs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6b7280'::"text",
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "text"
);


ALTER TABLE "public"."post_flairs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "ip_hash" "text" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."post_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "vote_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "post_votes_vote_type_check" CHECK (("vote_type" = ANY (ARRAY['up'::"text", 'down'::"text"])))
);


ALTER TABLE "public"."post_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prediction_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "round_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "prediction_count" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "daily_round_id" "uuid"
);


ALTER TABLE "public"."prediction_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prediction_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "buyer_id" "text" NOT NULL,
    "seller_id" "text" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "gold_spent" integer DEFAULT 500 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."prediction_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prediction_seasons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "start_date" timestamp with time zone NOT NULL,
    "end_date" timestamp with time zone NOT NULL,
    "sport_type" "text" DEFAULT 'football'::"text",
    "league_id" "text",
    "is_active" boolean DEFAULT true,
    "prize_pool" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."prediction_seasons" OWNER TO "postgres";


COMMENT ON TABLE "public"."prediction_seasons" IS 'Seasonal competitions for prediction game';



CREATE TABLE IF NOT EXISTS "public"."prediction_slips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "daily_round_id" "uuid",
    "sport" "text" NOT NULL,
    "stake" integer DEFAULT 1 NOT NULL,
    "total_odds" numeric DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "analysis_text" "text",
    "analysis_title" character varying(100),
    "idempotency_key" "uuid",
    "event_id" "uuid",
    CONSTRAINT "chk_slip_stake_positive" CHECK (("stake" > 0)),
    CONSTRAINT "chk_slip_total_odds_positive" CHECK (("total_odds" > (0)::numeric))
);


ALTER TABLE "public"."prediction_slips" OWNER TO "postgres";


COMMENT ON TABLE "public"."prediction_slips" IS '���� ���� - �� ���� ���� ����(����)�� �׷�ȭ';



COMMENT ON COLUMN "public"."prediction_slips"."stake" IS '���� �ݾ� (�� ����)';



COMMENT ON COLUMN "public"."prediction_slips"."total_odds" IS '���� �� ����';



COMMENT ON COLUMN "public"."prediction_slips"."analysis_text" IS '기자 분석글 (슬립 단위, 기자만 작성 가능)';



COMMENT ON COLUMN "public"."prediction_slips"."analysis_title" IS '기자 분석글 제목 (최대 100자)';



CREATE TABLE IF NOT EXISTS "public"."predictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "match_id" "text" NOT NULL,
    "prediction_type" "text" NOT NULL,
    "prediction_value" "text" NOT NULL,
    "odds_at_prediction" numeric(6,2),
    "points_wagered" integer DEFAULT 1,
    "potential_win" integer,
    "is_correct" boolean,
    "points_won" integer DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "settled_at" timestamp with time zone,
    CONSTRAINT "predictions_points_wagered_range" CHECK ((("points_wagered" >= 1) AND ("points_wagered" <= 10)))
);


ALTER TABLE "public"."predictions" OWNER TO "postgres";


COMMENT ON TABLE "public"."predictions" IS 'User predictions for matches with point wagering';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "nickname" "text" NOT NULL,
    "avatar_url" "text",
    "temperature" numeric(5,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "role" "text" DEFAULT 'user'::"text",
    "is_artist" boolean DEFAULT false NOT NULL,
    "artist_bio" "text",
    "specialties" "text"[] DEFAULT '{}'::"text"[],
    "commission_status" "text" DEFAULT 'closed'::"text" NOT NULL,
    "is_expert" boolean DEFAULT false,
    "expert_certified_at" timestamp with time zone,
    "is_journalist" boolean DEFAULT false,
    "journalist_certified_at" timestamp with time zone,
    "bio" "text",
    "onboarding_completed" boolean DEFAULT false,
    "nickname_changed_at" timestamp with time zone,
    "equipped_pixel_art_id" "uuid",
    "deleted_at" timestamp with time zone,
    "grade" "text" DEFAULT 'regular'::"text",
    "post_count" integer DEFAULT 0,
    "comment_count" integer DEFAULT 0,
    "favorite_team" "text",
    "favorite_player" "text",
    "metaverse_avatar_key" "text",
    "display_title_id" "uuid",
    CONSTRAINT "profiles_commission_status_check" CHECK (("commission_status" = ANY (ARRAY['open'::"text", 'closed'::"text", 'limited'::"text"]))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'moderator'::"text", 'user'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."is_journalist" IS '기자 여부 (true일 경우 분석글 작성 및 팔로우 대상)';



COMMENT ON COLUMN "public"."profiles"."journalist_certified_at" IS '기자 인증 시각';



CREATE TABLE IF NOT EXISTS "public"."purchased_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "prediction_id" "uuid" NOT NULL,
    "purchase_price" integer NOT NULL,
    "purchased_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."purchased_content" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "commission_id" "uuid" NOT NULL,
    "reviewer_id" "text" NOT NULL,
    "artist_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "content" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scoring_config" (
    "version" "text" NOT NULL,
    "w_up" double precision NOT NULL,
    "w_comment" double precision NOT NULL,
    "w_view" double precision NOT NULL,
    "decay_half_life" double precision NOT NULL,
    "new_boost_max" double precision NOT NULL,
    "is_active" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."scoring_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seeded_reddit_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reddit_id" "text" NOT NULL,
    "subreddit" "text" NOT NULL,
    "community_slug" "text" NOT NULL,
    "post_id" "uuid",
    "original_title" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."seeded_reddit_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "description" "text",
    "updated_by" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."site_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stadium_contributions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "team_id" "text" NOT NULL,
    "points_contributed" bigint DEFAULT 0 NOT NULL,
    "last_synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stadium_contributions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stadium_investments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "team_id" "text" NOT NULL,
    "points_invested" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stadium_investments_points_invested_check" CHECK (("points_invested" > 0))
);


ALTER TABLE "public"."stadium_investments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stadium_level_thresholds" (
    "level" integer NOT NULL,
    "required_points" bigint NOT NULL,
    "name_ko" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "description" "text",
    "unlocked_features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "stadium_level_thresholds_level_check" CHECK ((("level" >= 1) AND ("level" <= 10)))
);


ALTER TABLE "public"."stadium_level_thresholds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."standings_cache" (
    "league_id" "text" NOT NULL,
    "data" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."standings_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."standings_cache" IS '네이버 스포츠 순위표 크롤 결과 (VPS cron + Playwright)';



CREATE TABLE IF NOT EXISTS "public"."sticker_packs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "board_slug" "text",
    "icon_url" "text",
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sticker_packs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sticker_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sticker_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sticker_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stickers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pack_id" "uuid",
    "creator_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "image_url" "text" NOT NULL,
    "media_type" "text" DEFAULT 'image'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "price" integer DEFAULT 100,
    "creator_cut" integer DEFAULT 50,
    "vote_count" integer DEFAULT 0,
    "vote_threshold" integer DEFAULT 10,
    "purchase_count" integer DEFAULT 0,
    "use_count" integer DEFAULT 0,
    "board_slug" "text",
    "tags" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "approved_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    CONSTRAINT "stickers_media_type_check" CHECK (("media_type" = ANY (ARRAY['image'::"text", 'animated'::"text"]))),
    CONSTRAINT "stickers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."stickers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "text",
    "alias" "text" NOT NULL,
    "source" "text" DEFAULT 'betman'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."team_aliases" OWNER TO "postgres";


COMMENT ON TABLE "public"."team_aliases" IS '팀 이름 별칭 (Betman 축약명 등)';



CREATE TABLE IF NOT EXISTS "public"."team_map_pins" (
    "team_id" "text" NOT NULL,
    "team_name" "text" NOT NULL,
    "team_short_name" "text" NOT NULL,
    "sport" "text" NOT NULL,
    "league_id" "text" NOT NULL,
    "city" "text" NOT NULL,
    "country" "text" DEFAULT 'GB'::"text" NOT NULL,
    "pin_x" numeric NOT NULL,
    "pin_y" numeric NOT NULL,
    "color" "text",
    "stadium_name" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "team_map_pins_pin_x_check" CHECK ((("pin_x" >= (0)::numeric) AND ("pin_x" <= (100)::numeric))),
    CONSTRAINT "team_map_pins_pin_y_check" CHECK ((("pin_y" >= (0)::numeric) AND ("pin_y" <= (100)::numeric))),
    CONSTRAINT "team_map_pins_sport_check" CHECK (("sport" = ANY (ARRAY['football'::"text", 'baseball'::"text", 'basketball'::"text", 'volleyball'::"text"])))
);


ALTER TABLE "public"."team_map_pins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_stadiums" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "text" NOT NULL,
    "level" integer DEFAULT 1 NOT NULL,
    "total_points" bigint DEFAULT 0 NOT NULL,
    "fan_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "team_stadiums_level_check" CHECK ((("level" >= 1) AND ("level" <= 10)))
);


ALTER TABLE "public"."team_stadiums" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "image_id" "text",
    "country_code" "text",
    "sport_type" "text" DEFAULT 'football'::"text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "name_ko" "text"
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


COMMENT ON TABLE "public"."teams" IS 'Sports teams from bet365 API';



COMMENT ON COLUMN "public"."teams"."name_ko" IS 'Korean display name for the team';



CREATE TABLE IF NOT EXISTS "public"."temperature_update_queue" (
    "id" bigint NOT NULL,
    "post_id" "uuid" NOT NULL,
    "queued_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."temperature_update_queue" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."temperature_update_queue_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."temperature_update_queue_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."temperature_update_queue_id_seq" OWNED BY "public"."temperature_update_queue"."id";



CREATE TABLE IF NOT EXISTS "public"."ticker_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticker_item_id" bigint NOT NULL,
    "user_id" "text" NOT NULL,
    "nickname" "text" NOT NULL,
    "content" "text" NOT NULL,
    "likes" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ticker_comments_content_check" CHECK ((("char_length"("content") >= 1) AND ("char_length"("content") <= 300)))
);


ALTER TABLE "public"."ticker_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."token_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "amount" integer NOT NULL,
    "balance_after" integer NOT NULL,
    "description" "text",
    "related_prediction_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "idempotency_key" "uuid",
    CONSTRAINT "token_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['daily_reset'::"text", 'prediction_spent'::"text", 'reward_earned'::"text", 'admin_adjustment'::"text", 'refund'::"text"])))
);


ALTER TABLE "public"."token_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_adj_titles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "adj_title_id" "uuid" NOT NULL,
    "board_slug" "text",
    "earned_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_adj_titles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "blocker_id" "text" NOT NULL,
    "blocked_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_board_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "board_slug" "text" NOT NULL,
    "total_points" integer DEFAULT 0 NOT NULL,
    "available_points" integer DEFAULT 0 NOT NULL,
    "level" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_board_points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "card_type" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "report_id" "uuid",
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_cards_card_type_check" CHECK (("card_type" = ANY (ARRAY['red'::"text", 'yellow'::"text"])))
);


ALTER TABLE "public"."user_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_equipped_titles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "board_slug" "text" NOT NULL,
    "adj_title_id" "uuid",
    "noun_title_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_equipped_titles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_flair_scores" (
    "user_id" "text" NOT NULL,
    "flair_id" "uuid" NOT NULL,
    "score_total" integer DEFAULT 0 NOT NULL,
    "score_balance" integer DEFAULT 0 NOT NULL,
    "last_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_flair_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "follower_id" "text" NOT NULL,
    "followed_user_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_gold" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "gold_balance" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_gold" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_noun_titles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "noun_title_id" "uuid" NOT NULL,
    "purchased_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_noun_titles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_pixel_arts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "pixel_art_id" "uuid" NOT NULL,
    "purchased_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_pixel_arts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_prediction_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "total_predictions" integer DEFAULT 0,
    "correct_predictions" integer DEFAULT 0,
    "wrong_predictions" integer DEFAULT 0,
    "pending_predictions" integer DEFAULT 0,
    "total_points" integer DEFAULT 1000,
    "points_won" integer DEFAULT 0,
    "points_lost" integer DEFAULT 0,
    "highest_points" integer DEFAULT 1000,
    "current_streak" integer DEFAULT 0,
    "best_win_streak" integer DEFAULT 0,
    "worst_lose_streak" integer DEFAULT 0,
    "win_rate" numeric(5,2) DEFAULT 0,
    "rank_overall" integer,
    "rank_weekly" integer,
    "rank_monthly" integer,
    "level" integer DEFAULT 1,
    "experience_points" integer DEFAULT 0,
    "badges" "jsonb" DEFAULT '[]'::"jsonb",
    "last_prediction_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_prediction_stats" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_prediction_stats" IS 'User statistics for prediction game';



CREATE TABLE IF NOT EXISTS "public"."user_sanctions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "issued_by" "text" NOT NULL,
    "evidence" "jsonb" DEFAULT '[]'::"jsonb",
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "lifted_at" timestamp with time zone,
    "lifted_by" "text",
    "lift_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_sanctions_type_check" CHECK (("type" = ANY (ARRAY['warning'::"text", 'timeout'::"text", 'ban'::"text", 'shadowban'::"text", 'content_restrict'::"text"])))
);


ALTER TABLE "public"."user_sanctions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_season_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "predictions_count" integer DEFAULT 0,
    "correct_count" integer DEFAULT 0,
    "points_earned" integer DEFAULT 0,
    "rank_in_season" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_season_stats" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_season_stats" IS 'User statistics per season';



CREATE TABLE IF NOT EXISTS "public"."user_stickers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "sticker_id" "uuid" NOT NULL,
    "purchased_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_stickers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_suspensions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "suspended_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "suspended_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_suspensions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "token_balance" integer DEFAULT 10 NOT NULL,
    "last_reset_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_tokens_earned" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_unlocked_titles" (
    "user_id" "text" NOT NULL,
    "title_id" "uuid" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_unlocked_titles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."virtual_casting_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "casting_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "actor_name" "text" NOT NULL,
    "reason" "text",
    "vote_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."virtual_casting_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."virtual_casting_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "suggestion_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."virtual_casting_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."virtual_castings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "movie_title" "text" NOT NULL,
    "role_name" "text" NOT NULL,
    "role_description" "text",
    "original_actor" "text",
    "image_url" "text",
    "vote_count" integer DEFAULT 0 NOT NULL,
    "suggestion_count" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."virtual_castings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "vote_value" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "votes_target_type_check" CHECK (("target_type" = ANY (ARRAY['post'::"text", 'comment'::"text"]))),
    CONSTRAINT "votes_vote_value_check" CHECK (("vote_value" = ANY (ARRAY['-1'::integer, 1])))
);


ALTER TABLE "public"."votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_analytics_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "report_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "summary" "text",
    "generated_by" "text" DEFAULT 'cron'::"text" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "generation_duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."weekly_analytics_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worldcup_candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "battle_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "image_url" "text",
    "description" "text",
    "seed" integer DEFAULT 0 NOT NULL,
    "win_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."worldcup_candidates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worldcup_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "battle_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "bracket_size" integer NOT NULL,
    "current_round" integer DEFAULT 1 NOT NULL,
    "winner_id" "uuid",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."worldcup_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worldcup_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "round" integer NOT NULL,
    "match_index" integer NOT NULL,
    "candidate_a_id" "uuid" NOT NULL,
    "candidate_b_id" "uuid" NOT NULL,
    "winner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."worldcup_votes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."temperature_update_queue" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."temperature_update_queue_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."adj_titles"
    ADD CONSTRAINT "adj_titles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."adj_titles"
    ADD CONSTRAINT "adj_titles_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."admin_activity_logs"
    ADD CONSTRAINT "admin_activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_notes"
    ADD CONSTRAINT "admin_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_actions"
    ADD CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_personas"
    ADD CONSTRAINT "agent_personas_persona_id_key" UNIQUE ("persona_id");



ALTER TABLE ONLY "public"."agent_personas"
    ADD CONSTRAINT "agent_personas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_run_id_key" UNIQUE ("run_id");



ALTER TABLE ONLY "public"."announcement_banners"
    ADD CONSTRAINT "announcement_banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."banners"
    ADD CONSTRAINT "banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."battle_comments"
    ADD CONSTRAINT "battle_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."battle_participants"
    ADD CONSTRAINT "battle_participants_battle_id_user_id_key" UNIQUE ("battle_id", "user_id");



ALTER TABLE ONLY "public"."battle_participants"
    ADD CONSTRAINT "battle_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."battle_rooms"
    ADD CONSTRAINT "battle_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."battle_sides"
    ADD CONSTRAINT "battle_sides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."betman_daily_rounds"
    ADD CONSTRAINT "betman_daily_rounds_daily_id_key" UNIQUE ("daily_id");



ALTER TABLE ONLY "public"."betman_daily_rounds"
    ADD CONSTRAINT "betman_daily_rounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."betman_games"
    ADD CONSTRAINT "betman_games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."betman_games"
    ADD CONSTRAINT "betman_games_round_id_game_no_key" UNIQUE ("round_id", "game_no");



ALTER TABLE ONLY "public"."betman_predictions"
    ADD CONSTRAINT "betman_predictions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."betman_rounds"
    ADD CONSTRAINT "betman_rounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."betman_rounds"
    ADD CONSTRAINT "betman_rounds_year_round_key" UNIQUE ("year", "round");



ALTER TABLE ONLY "public"."betman_sync_state"
    ADD CONSTRAINT "betman_sync_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."betman_unknown_games"
    ADD CONSTRAINT "betman_unknown_games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."betman_unknown_games"
    ADD CONSTRAINT "betman_unknown_games_uniq" UNIQUE ("source", "gm_ts", "game_no", "bet_typ_id", "handi_val");



ALTER TABLE ONLY "public"."betman_user_sport_stats"
    ADD CONSTRAINT "betman_user_sport_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."betman_user_sport_stats"
    ADD CONSTRAINT "betman_user_sport_stats_user_id_sport_key" UNIQUE ("user_id", "sport");



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_user_id_post_id_key" UNIQUE ("user_id", "post_id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."comment_cooldowns"
    ADD CONSTRAINT "comment_cooldowns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comment_votes"
    ADD CONSTRAINT "comment_votes_comment_id_user_id_key" UNIQUE ("comment_id", "user_id");



ALTER TABLE ONLY "public"."comment_votes"
    ADD CONSTRAINT "comment_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commission_messages"
    ADD CONSTRAINT "commission_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commission_milestones"
    ADD CONSTRAINT "commission_milestones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commission_orders"
    ADD CONSTRAINT "commission_orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."commission_orders"
    ADD CONSTRAINT "commission_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commission_packages"
    ADD CONSTRAINT "commission_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_follows"
    ADD CONSTRAINT "community_follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_follows"
    ADD CONSTRAINT "community_follows_user_id_community_slug_key" UNIQUE ("user_id", "community_slug");



ALTER TABLE ONLY "public"."content_flags"
    ADD CONSTRAINT "content_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_flags"
    ADD CONSTRAINT "content_flags_target_type_target_id_key" UNIQUE ("target_type", "target_id");



ALTER TABLE ONLY "public"."content_reports"
    ADD CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crawler_run_log"
    ADD CONSTRAINT "crawler_run_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cron_run_log"
    ADD CONSTRAINT "cron_run_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_point_caps"
    ADD CONSTRAINT "daily_point_caps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_point_caps"
    ADD CONSTRAINT "daily_point_caps_user_id_board_slug_date_key" UNIQUE ("user_id", "board_slug", "date");



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draft_participants"
    ADD CONSTRAINT "draft_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draft_participants"
    ADD CONSTRAINT "draft_participants_room_id_seat_index_key" UNIQUE ("room_id", "seat_index");



ALTER TABLE ONLY "public"."draft_participants"
    ADD CONSTRAINT "draft_participants_room_id_user_id_key" UNIQUE ("room_id", "user_id");



ALTER TABLE ONLY "public"."draft_picks"
    ADD CONSTRAINT "draft_picks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draft_picks"
    ADD CONSTRAINT "draft_picks_room_id_pick_number_key" UNIQUE ("room_id", "pick_number");



ALTER TABLE ONLY "public"."draft_picks"
    ADD CONSTRAINT "draft_picks_room_id_player_id_key" UNIQUE ("room_id", "player_id");



ALTER TABLE ONLY "public"."draft_results"
    ADD CONSTRAINT "draft_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draft_results"
    ADD CONSTRAINT "draft_results_room_id_user_id_key" UNIQUE ("room_id", "user_id");



ALTER TABLE ONLY "public"."draft_rooms"
    ADD CONSTRAINT "draft_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draft_rooms"
    ADD CONSTRAINT "draft_rooms_room_code_key" UNIQUE ("room_code");



ALTER TABLE ONLY "public"."event_groups"
    ADD CONSTRAINT "event_groups_event_id_slug_key" UNIQUE ("event_id", "slug");



ALTER TABLE ONLY "public"."event_groups"
    ADD CONSTRAINT "event_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_leaderboard_snapshots"
    ADD CONSTRAINT "event_leaderboard_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_user_id_key" UNIQUE ("event_id", "user_id");



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."faqs"
    ADD CONSTRAINT "faqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_artist_id_key" UNIQUE ("user_id", "artist_id");



ALTER TABLE ONLY "public"."feature_test_logs"
    ADD CONSTRAINT "feature_test_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flair_titles"
    ADD CONSTRAINT "flair_titles_flair_id_name_key" UNIQUE ("flair_id", "name");



ALTER TABLE ONLY "public"."flair_titles"
    ADD CONSTRAINT "flair_titles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gold_transactions"
    ADD CONSTRAINT "gold_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inquiries"
    ADD CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."league_aliases"
    ADD CONSTRAINT "league_aliases_alias_source_key" UNIQUE ("alias", "source");



ALTER TABLE ONLY "public"."league_aliases"
    ADD CONSTRAINT "league_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leagues"
    ADD CONSTRAINT "leagues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_rooms"
    ADD CONSTRAINT "live_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_odds"
    ADD CONSTRAINT "match_odds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metaverse_avatar_inventory"
    ADD CONSTRAINT "metaverse_avatar_inventory_pkey" PRIMARY KEY ("user_id", "avatar_key");



ALTER TABLE ONLY "public"."metaverse_avatar_items"
    ADD CONSTRAINT "metaverse_avatar_items_pkey" PRIMARY KEY ("avatar_key");



ALTER TABLE ONLY "public"."metaverse_chat_rooms"
    ADD CONSTRAINT "metaverse_chat_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metaverse_fandom_memberships"
    ADD CONSTRAINT "metaverse_fandom_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metaverse_fandom_memberships"
    ADD CONSTRAINT "metaverse_fandom_memberships_user_id_team_id_key" UNIQUE ("user_id", "team_id");



ALTER TABLE ONLY "public"."metaverse_user_activity_balance"
    ADD CONSTRAINT "metaverse_user_activity_balance_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."metaverse_user_reports"
    ADD CONSTRAINT "metaverse_user_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metaverse_world_plots"
    ADD CONSTRAINT "metaverse_world_plots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metaverse_world_plots"
    ADD CONSTRAINT "metaverse_world_plots_plot_code_key" UNIQUE ("plot_code");



ALTER TABLE ONLY "public"."movie_quiz_results"
    ADD CONSTRAINT "movie_quiz_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movie_quizzes"
    ADD CONSTRAINT "movie_quizzes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_alias_dictionary"
    ADD CONSTRAINT "news_alias_dictionary_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_reservoir"
    ADD CONSTRAINT "news_reservoir_external_key_key" UNIQUE ("external_key");



ALTER TABLE ONLY "public"."news_reservoir"
    ADD CONSTRAINT "news_reservoir_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_ticker_items"
    ADD CONSTRAINT "news_ticker_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_ticker_items"
    ADD CONSTRAINT "news_ticker_items_source_id_external_id_key" UNIQUE ("source_id", "external_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."noun_titles"
    ADD CONSTRAINT "noun_titles_board_slug_required_level_key" UNIQUE ("board_slug", "required_level");



ALTER TABLE ONLY "public"."noun_titles"
    ADD CONSTRAINT "noun_titles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_refunds"
    ADD CONSTRAINT "pending_refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_seller_rewards"
    ADD CONSTRAINT "pending_seller_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pixel_art_items"
    ADD CONSTRAINT "pixel_art_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pixel_art_items"
    ADD CONSTRAINT "pixel_art_items_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."point_transactions"
    ADD CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_flairs"
    ADD CONSTRAINT "post_flairs_community_slug_name_key" UNIQUE ("community_slug", "name");



ALTER TABLE ONLY "public"."post_flairs"
    ADD CONSTRAINT "post_flairs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_views"
    ADD CONSTRAINT "post_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_votes"
    ADD CONSTRAINT "post_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_votes"
    ADD CONSTRAINT "post_votes_post_id_user_id_key" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prediction_activities"
    ADD CONSTRAINT "prediction_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prediction_activities"
    ADD CONSTRAINT "prediction_activities_user_id_round_id_sport_key" UNIQUE ("user_id", "round_id", "sport");



ALTER TABLE ONLY "public"."prediction_purchases"
    ADD CONSTRAINT "prediction_purchases_buyer_id_activity_id_key" UNIQUE ("buyer_id", "activity_id");



ALTER TABLE ONLY "public"."prediction_purchases"
    ADD CONSTRAINT "prediction_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prediction_seasons"
    ADD CONSTRAINT "prediction_seasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prediction_slips"
    ADD CONSTRAINT "prediction_slips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."purchased_content"
    ADD CONSTRAINT "purchased_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchased_content"
    ADD CONSTRAINT "purchased_content_user_id_prediction_id_key" UNIQUE ("user_id", "prediction_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_commission_id_key" UNIQUE ("commission_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scoring_config"
    ADD CONSTRAINT "scoring_config_pkey" PRIMARY KEY ("version");



ALTER TABLE ONLY "public"."seeded_reddit_posts"
    ADD CONSTRAINT "seeded_reddit_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seeded_reddit_posts"
    ADD CONSTRAINT "seeded_reddit_posts_reddit_id_key" UNIQUE ("reddit_id");



ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stadium_contributions"
    ADD CONSTRAINT "stadium_contributions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stadium_contributions"
    ADD CONSTRAINT "stadium_contributions_user_id_team_id_key" UNIQUE ("user_id", "team_id");



ALTER TABLE ONLY "public"."stadium_investments"
    ADD CONSTRAINT "stadium_investments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stadium_level_thresholds"
    ADD CONSTRAINT "stadium_level_thresholds_pkey" PRIMARY KEY ("level");



ALTER TABLE ONLY "public"."standings_cache"
    ADD CONSTRAINT "standings_cache_pkey" PRIMARY KEY ("league_id");



ALTER TABLE ONLY "public"."sticker_packs"
    ADD CONSTRAINT "sticker_packs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sticker_votes"
    ADD CONSTRAINT "sticker_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sticker_votes"
    ADD CONSTRAINT "sticker_votes_sticker_id_user_id_key" UNIQUE ("sticker_id", "user_id");



ALTER TABLE ONLY "public"."stickers"
    ADD CONSTRAINT "stickers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_aliases"
    ADD CONSTRAINT "team_aliases_alias_source_key" UNIQUE ("alias", "source");



ALTER TABLE ONLY "public"."team_aliases"
    ADD CONSTRAINT "team_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_map_pins"
    ADD CONSTRAINT "team_map_pins_pkey" PRIMARY KEY ("team_id");



ALTER TABLE ONLY "public"."team_stadiums"
    ADD CONSTRAINT "team_stadiums_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_stadiums"
    ADD CONSTRAINT "team_stadiums_team_id_key" UNIQUE ("team_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."temperature_update_queue"
    ADD CONSTRAINT "temperature_update_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."temperature_update_queue"
    ADD CONSTRAINT "temperature_update_queue_post_id_key" UNIQUE ("post_id");



ALTER TABLE ONLY "public"."ticker_comments"
    ADD CONSTRAINT "ticker_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."token_transactions"
    ADD CONSTRAINT "token_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commission_milestones"
    ADD CONSTRAINT "unique_milestone" UNIQUE ("order_id", "milestone_number");



ALTER TABLE ONLY "public"."virtual_casting_suggestions"
    ADD CONSTRAINT "unique_user_casting_actor" UNIQUE ("casting_id", "user_id", "actor_name");



ALTER TABLE ONLY "public"."movie_quiz_results"
    ADD CONSTRAINT "unique_user_quiz" UNIQUE ("user_id", "quiz_id");



ALTER TABLE ONLY "public"."virtual_casting_votes"
    ADD CONSTRAINT "unique_user_suggestion_vote" UNIQUE ("suggestion_id", "user_id");



ALTER TABLE ONLY "public"."weekly_analytics_reports"
    ADD CONSTRAINT "unique_weekly_period" UNIQUE ("period_start", "period_end");



ALTER TABLE ONLY "public"."prediction_purchases"
    ADD CONSTRAINT "uq_prediction_purchases_buyer_activity" UNIQUE ("buyer_id", "activity_id");



ALTER TABLE ONLY "public"."user_adj_titles"
    ADD CONSTRAINT "user_adj_titles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_adj_titles"
    ADD CONSTRAINT "user_adj_titles_user_id_adj_title_id_key" UNIQUE ("user_id", "adj_title_id");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_id_blocked_id_key" UNIQUE ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_board_points"
    ADD CONSTRAINT "user_board_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_board_points"
    ADD CONSTRAINT "user_board_points_user_id_board_slug_key" UNIQUE ("user_id", "board_slug");



ALTER TABLE ONLY "public"."user_cards"
    ADD CONSTRAINT "user_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_equipped_titles"
    ADD CONSTRAINT "user_equipped_titles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_equipped_titles"
    ADD CONSTRAINT "user_equipped_titles_user_id_board_slug_key" UNIQUE ("user_id", "board_slug");



ALTER TABLE ONLY "public"."user_flair_scores"
    ADD CONSTRAINT "user_flair_scores_pkey" PRIMARY KEY ("user_id", "flair_id");



ALTER TABLE ONLY "public"."user_follows"
    ADD CONSTRAINT "user_follows_follower_id_followed_user_id_key" UNIQUE ("follower_id", "followed_user_id");



ALTER TABLE ONLY "public"."user_follows"
    ADD CONSTRAINT "user_follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_gold"
    ADD CONSTRAINT "user_gold_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_gold"
    ADD CONSTRAINT "user_gold_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_noun_titles"
    ADD CONSTRAINT "user_noun_titles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_noun_titles"
    ADD CONSTRAINT "user_noun_titles_user_id_noun_title_id_key" UNIQUE ("user_id", "noun_title_id");



ALTER TABLE ONLY "public"."user_pixel_arts"
    ADD CONSTRAINT "user_pixel_arts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_pixel_arts"
    ADD CONSTRAINT "user_pixel_arts_user_id_pixel_art_id_key" UNIQUE ("user_id", "pixel_art_id");



ALTER TABLE ONLY "public"."user_prediction_stats"
    ADD CONSTRAINT "user_prediction_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_prediction_stats"
    ADD CONSTRAINT "user_prediction_stats_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_sanctions"
    ADD CONSTRAINT "user_sanctions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_season_stats"
    ADD CONSTRAINT "user_season_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_season_stats"
    ADD CONSTRAINT "user_season_stats_user_id_season_id_key" UNIQUE ("user_id", "season_id");



ALTER TABLE ONLY "public"."user_stickers"
    ADD CONSTRAINT "user_stickers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_stickers"
    ADD CONSTRAINT "user_stickers_user_id_sticker_id_key" UNIQUE ("user_id", "sticker_id");



ALTER TABLE ONLY "public"."user_suspensions"
    ADD CONSTRAINT "user_suspensions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_tokens"
    ADD CONSTRAINT "user_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_tokens"
    ADD CONSTRAINT "user_tokens_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_unlocked_titles"
    ADD CONSTRAINT "user_unlocked_titles_pkey" PRIMARY KEY ("user_id", "title_id");



ALTER TABLE ONLY "public"."virtual_casting_suggestions"
    ADD CONSTRAINT "virtual_casting_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."virtual_casting_votes"
    ADD CONSTRAINT "virtual_casting_votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."virtual_castings"
    ADD CONSTRAINT "virtual_castings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."votes"
    ADD CONSTRAINT "votes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."votes"
    ADD CONSTRAINT "votes_user_id_target_type_target_id_key" UNIQUE ("user_id", "target_type", "target_id");



ALTER TABLE ONLY "public"."weekly_analytics_reports"
    ADD CONSTRAINT "weekly_analytics_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worldcup_candidates"
    ADD CONSTRAINT "worldcup_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worldcup_sessions"
    ADD CONSTRAINT "worldcup_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worldcup_votes"
    ADD CONSTRAINT "worldcup_votes_pkey" PRIMARY KEY ("id");



CREATE INDEX "betman_games_league_code_idx" ON "public"."betman_games" USING "btree" ("league_code") WHERE ("league_code" IS NOT NULL);



CREATE INDEX "event_groups_event_idx" ON "public"."event_groups" USING "btree" ("event_id");



CREATE INDEX "event_lb_snap_group_idx" ON "public"."event_leaderboard_snapshots" USING "btree" ("group_id", "captured_at" DESC);



CREATE INDEX "event_lb_snap_user_idx" ON "public"."event_leaderboard_snapshots" USING "btree" ("event_id", "user_id", "captured_at" DESC);



CREATE INDEX "event_reg_event_user_idx" ON "public"."event_registrations" USING "btree" ("event_id", "user_id");



CREATE INDEX "event_reg_group_idx" ON "public"."event_registrations" USING "btree" ("group_id");



CREATE INDEX "event_reg_traffic_idx" ON "public"."event_registrations" USING "btree" ("event_id", "traffic_source");



CREATE INDEX "events_status_idx" ON "public"."events" USING "btree" ("status");



CREATE INDEX "idx_admin_audit_logs_admin" ON "public"."admin_audit_logs" USING "btree" ("admin_user_id");



CREATE INDEX "idx_admin_audit_logs_created" ON "public"."admin_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_admin_logs_action" ON "public"."admin_activity_logs" USING "btree" ("action");



CREATE INDEX "idx_admin_logs_admin" ON "public"."admin_activity_logs" USING "btree" ("admin_id");



CREATE INDEX "idx_admin_logs_created" ON "public"."admin_activity_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_admin_logs_target" ON "public"."admin_activity_logs" USING "btree" ("target_type", "target_id");



CREATE INDEX "idx_agent_actions_created" ON "public"."agent_actions" USING "btree" ("created_at");



CREATE INDEX "idx_agent_actions_persona" ON "public"."agent_actions" USING "btree" ("persona_id", "action_type");



CREATE INDEX "idx_agent_actions_run" ON "public"."agent_actions" USING "btree" ("run_id");



CREATE INDEX "idx_announcement_banners_active" ON "public"."announcement_banners" USING "btree" ("is_active", "sort_order") WHERE ("is_active" = true);



CREATE INDEX "idx_announcements_active" ON "public"."announcements" USING "btree" ("is_active", "is_pinned", "published_at" DESC);



CREATE INDEX "idx_banners_active" ON "public"."banners" USING "btree" ("is_active", "position", "sort_order");



CREATE INDEX "idx_battle_comments_battle" ON "public"."battle_comments" USING "btree" ("battle_id", "created_at" DESC);



CREATE INDEX "idx_battle_comments_side" ON "public"."battle_comments" USING "btree" ("side_id", "created_at" DESC);



CREATE INDEX "idx_battle_participants_battle" ON "public"."battle_participants" USING "btree" ("battle_id");



CREATE INDEX "idx_battle_participants_user" ON "public"."battle_participants" USING "btree" ("user_id");



CREATE INDEX "idx_battle_rooms_mode" ON "public"."battle_rooms" USING "btree" ("mode", "status");



CREATE INDEX "idx_battle_rooms_status" ON "public"."battle_rooms" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_battle_sides_battle" ON "public"."battle_sides" USING "btree" ("battle_id", "sort_order");



CREATE INDEX "idx_betman_games_game_type" ON "public"."betman_games" USING "btree" ("game_type");



CREATE INDEX "idx_betman_games_league_code" ON "public"."betman_games" USING "btree" ("league_code");



CREATE INDEX "idx_betman_games_mapped_away_team_id" ON "public"."betman_games" USING "btree" ("mapped_away_team_id");



CREATE INDEX "idx_betman_games_mapped_home_team_id" ON "public"."betman_games" USING "btree" ("mapped_home_team_id");



CREATE INDEX "idx_betman_games_mapped_league_id" ON "public"."betman_games" USING "btree" ("mapped_league_id");



CREATE INDEX "idx_betman_games_mapped_match_id" ON "public"."betman_games" USING "btree" ("mapped_match_id");



CREATE INDEX "idx_betman_games_match_time" ON "public"."betman_games" USING "btree" ("match_time");



CREATE INDEX "idx_betman_games_round_id" ON "public"."betman_games" USING "btree" ("round_id");



CREATE INDEX "idx_betman_games_sport" ON "public"."betman_games" USING "btree" ("sport");



CREATE INDEX "idx_betman_games_status" ON "public"."betman_games" USING "btree" ("status");



CREATE INDEX "idx_betman_predictions_daily_round_user" ON "public"."betman_predictions" USING "btree" ("daily_round_id", "user_id");



CREATE INDEX "idx_betman_predictions_game_id" ON "public"."betman_predictions" USING "btree" ("game_id");



CREATE INDEX "idx_betman_predictions_round_id" ON "public"."betman_predictions" USING "btree" ("round_id");



CREATE INDEX "idx_betman_predictions_round_user" ON "public"."betman_predictions" USING "btree" ("round_id", "user_id");



CREATE INDEX "idx_betman_predictions_status" ON "public"."betman_predictions" USING "btree" ("status");



CREATE INDEX "idx_betman_predictions_user_game" ON "public"."betman_predictions" USING "btree" ("user_id", "game_id");



CREATE INDEX "idx_betman_predictions_user_id" ON "public"."betman_predictions" USING "btree" ("user_id");



CREATE INDEX "idx_betman_predictions_user_round" ON "public"."betman_predictions" USING "btree" ("user_id", "round_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_betman_rounds_gm_ts" ON "public"."betman_rounds" USING "btree" ("gm_ts") WHERE ("gm_ts" IS NOT NULL);



CREATE INDEX "idx_betman_rounds_status" ON "public"."betman_rounds" USING "btree" ("status");



CREATE INDEX "idx_betman_rounds_year_round" ON "public"."betman_rounds" USING "btree" ("year", "round");



CREATE INDEX "idx_betman_unknown_games_bet_typ_id" ON "public"."betman_unknown_games" USING "btree" ("bet_typ_id") WHERE ("bet_typ_id" <> ''::"text");



CREATE INDEX "idx_betman_unknown_games_first_seen" ON "public"."betman_unknown_games" USING "btree" ("first_seen_at" DESC);



CREATE INDEX "idx_betman_unknown_games_handi_val" ON "public"."betman_unknown_games" USING "btree" ("handi_val") WHERE ("handi_val" <> '-1'::integer);



CREATE INDEX "idx_bookmarks_post_id" ON "public"."bookmarks" USING "btree" ("post_id");



CREATE INDEX "idx_bookmarks_user_id" ON "public"."bookmarks" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_buss_accuracy" ON "public"."betman_user_sport_stats" USING "btree" ("sport", "accuracy" DESC);



CREATE INDEX "idx_buss_net_profit" ON "public"."betman_user_sport_stats" USING "btree" ("sport", "net_profit" DESC);



CREATE INDEX "idx_buss_profit_rate" ON "public"."betman_user_sport_stats" USING "btree" ("sport", "profit_rate" DESC);



CREATE INDEX "idx_buss_sport" ON "public"."betman_user_sport_stats" USING "btree" ("sport");



CREATE INDEX "idx_buss_sport_profit" ON "public"."betman_user_sport_stats" USING "btree" ("sport", "profit_rate" DESC) WHERE ("total_wagered" > 0);



CREATE INDEX "idx_buss_user" ON "public"."betman_user_sport_stats" USING "btree" ("user_id");



CREATE INDEX "idx_casting_votes_user" ON "public"."virtual_casting_votes" USING "btree" ("user_id");



CREATE INDEX "idx_castings_active" ON "public"."virtual_castings" USING "btree" ("is_active", "created_at" DESC);



CREATE INDEX "idx_castings_popular" ON "public"."virtual_castings" USING "btree" ("vote_count" DESC) WHERE ("is_active" = true);



CREATE INDEX "idx_categories_parent_slug" ON "public"."categories" USING "btree" ("parent_slug") WHERE ("parent_slug" IS NOT NULL);



CREATE UNIQUE INDEX "idx_comment_cooldowns_user_id" ON "public"."comment_cooldowns" USING "btree" ("user_id");



CREATE INDEX "idx_comment_votes_comment_id" ON "public"."comment_votes" USING "btree" ("comment_id");



CREATE INDEX "idx_comment_votes_comment_type" ON "public"."comment_votes" USING "btree" ("comment_id", "vote_type");



CREATE INDEX "idx_comment_votes_user_id" ON "public"."comment_votes" USING "btree" ("user_id");



CREATE INDEX "idx_comments_created_at_desc" ON "public"."comments" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_comments_parent_id" ON "public"."comments" USING "btree" ("parent_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_comments_path" ON "public"."comments" USING "gin" ("path");



CREATE INDEX "idx_comments_post_created" ON "public"."comments" USING "btree" ("post_id", "created_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_comments_post_id" ON "public"."comments" USING "btree" ("post_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_comments_post_id_active" ON "public"."comments" USING "btree" ("post_id", "created_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_comments_user_id" ON "public"."comments" USING "btree" ("user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_commission_orders_package_id" ON "public"."commission_orders" USING "btree" ("package_id");



CREATE INDEX "idx_commission_packages_active" ON "public"."commission_packages" USING "btree" ("is_active", "type");



CREATE INDEX "idx_commission_packages_artist" ON "public"."commission_packages" USING "btree" ("artist_id");



CREATE INDEX "idx_community_follows_community" ON "public"."community_follows" USING "btree" ("community_slug");



CREATE INDEX "idx_community_follows_user" ON "public"."community_follows" USING "btree" ("user_id");



CREATE INDEX "idx_content_flags_run" ON "public"."content_flags" USING "btree" ("run_id");



CREATE INDEX "idx_content_flags_target" ON "public"."content_flags" USING "btree" ("target_type", "target_id");



CREATE INDEX "idx_content_reports_created" ON "public"."content_reports" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_content_reports_reporter" ON "public"."content_reports" USING "btree" ("reporter_id");



CREATE INDEX "idx_content_reports_status" ON "public"."content_reports" USING "btree" ("status");



CREATE INDEX "idx_content_reports_target" ON "public"."content_reports" USING "btree" ("target_type", "target_id");



CREATE INDEX "idx_cron_run_log_job" ON "public"."cron_run_log" USING "btree" ("job_name", "started_at" DESC);



CREATE INDEX "idx_daily_rounds_daily_id" ON "public"."betman_daily_rounds" USING "btree" ("daily_id" DESC);



CREATE INDEX "idx_daily_rounds_status" ON "public"."betman_daily_rounds" USING "btree" ("status");



CREATE INDEX "idx_disputes_commission" ON "public"."disputes" USING "btree" ("commission_id");



CREATE INDEX "idx_disputes_status" ON "public"."disputes" USING "btree" ("status");



CREATE INDEX "idx_dm_conversation" ON "public"."direct_messages" USING "btree" (LEAST("sender_id", "receiver_id"), GREATEST("sender_id", "receiver_id"), "created_at" DESC);



CREATE INDEX "idx_dm_receiver" ON "public"."direct_messages" USING "btree" ("receiver_id", "created_at" DESC) WHERE ("deleted_by_receiver" = false);



CREATE INDEX "idx_dm_sender" ON "public"."direct_messages" USING "btree" ("sender_id", "created_at" DESC) WHERE ("deleted_by_sender" = false);



CREATE INDEX "idx_draft_participants_room" ON "public"."draft_participants" USING "btree" ("room_id");



CREATE INDEX "idx_draft_participants_user" ON "public"."draft_participants" USING "btree" ("user_id");



CREATE INDEX "idx_draft_picks_room" ON "public"."draft_picks" USING "btree" ("room_id", "pick_number");



CREATE INDEX "idx_draft_results_user" ON "public"."draft_results" USING "btree" ("user_id");



CREATE INDEX "idx_draft_rooms_code" ON "public"."draft_rooms" USING "btree" ("room_code");



CREATE INDEX "idx_draft_rooms_host" ON "public"."draft_rooms" USING "btree" ("host_user_id");



CREATE INDEX "idx_draft_rooms_status" ON "public"."draft_rooms" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['waiting'::"text", 'drafting'::"text"]));



CREATE INDEX "idx_faqs_category" ON "public"."faqs" USING "btree" ("category", "sort_order");



CREATE INDEX "idx_favorites_artist" ON "public"."favorites" USING "btree" ("artist_id");



CREATE INDEX "idx_favorites_user" ON "public"."favorites" USING "btree" ("user_id");



CREATE INDEX "idx_feature_test_logs_action" ON "public"."feature_test_logs" USING "btree" ("action_type", "success");



CREATE INDEX "idx_feature_test_logs_run" ON "public"."feature_test_logs" USING "btree" ("run_id");



CREATE INDEX "idx_flair_titles_flair" ON "public"."flair_titles" USING "btree" ("flair_id", "threshold");



CREATE INDEX "idx_games_daily_round" ON "public"."betman_games" USING "btree" ("daily_round_id");



CREATE INDEX "idx_gold_transactions_user_id" ON "public"."gold_transactions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_gold_tx_idempotency" ON "public"."gold_transactions" USING "btree" ("user_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_hot_feed_category" ON "public"."hot_feed" USING "btree" ("category_id", "temperature" DESC);



CREATE UNIQUE INDEX "idx_hot_feed_id" ON "public"."hot_feed" USING "btree" ("id");



CREATE INDEX "idx_hot_feed_score" ON "public"."hot_feed" USING "btree" ("temperature" DESC);



CREATE INDEX "idx_inquiries_category" ON "public"."inquiries" USING "btree" ("category");



CREATE INDEX "idx_inquiries_status" ON "public"."inquiries" USING "btree" ("status");



CREATE INDEX "idx_inquiries_user" ON "public"."inquiries" USING "btree" ("user_id");



CREATE INDEX "idx_league_aliases_league_id" ON "public"."league_aliases" USING "btree" ("league_id");



CREATE INDEX "idx_live_rooms_game" ON "public"."live_rooms" USING "btree" ("game_id");



CREATE UNIQUE INDEX "idx_live_rooms_game_unique" ON "public"."live_rooms" USING "btree" ("game_id") WHERE ("game_id" IS NOT NULL);



CREATE INDEX "idx_live_rooms_status" ON "public"."live_rooms" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_match_odds_unique" ON "public"."match_odds" USING "btree" ("match_id");



CREATE INDEX "idx_matches_away_team" ON "public"."matches" USING "btree" ("away_team_id");



CREATE INDEX "idx_matches_home_team" ON "public"."matches" USING "btree" ("home_team_id");



CREATE INDEX "idx_matches_league" ON "public"."matches" USING "btree" ("league_id");



CREATE INDEX "idx_matches_prediction_open" ON "public"."matches" USING "btree" ("is_prediction_open") WHERE ("is_prediction_open" = true);



CREATE INDEX "idx_matches_sport_type" ON "public"."matches" USING "btree" ("sport_type");



CREATE INDEX "idx_matches_status" ON "public"."matches" USING "btree" ("time_status");



CREATE INDEX "idx_matches_time" ON "public"."matches" USING "btree" ("match_time" DESC);



CREATE INDEX "idx_messages_order" ON "public"."commission_messages" USING "btree" ("order_id", "created_at");



CREATE INDEX "idx_metaverse_avatar_inv_user" ON "public"."metaverse_avatar_inventory" USING "btree" ("user_id");



CREATE INDEX "idx_metaverse_avatar_items_active" ON "public"."metaverse_avatar_items" USING "btree" ("sort_order") WHERE ("is_active" = true);



CREATE INDEX "idx_metaverse_chat_rooms_cleanup" ON "public"."metaverse_chat_rooms" USING "btree" ("last_activity_at") WHERE ("closed_at" IS NULL);



CREATE INDEX "idx_metaverse_fandom_team" ON "public"."metaverse_fandom_memberships" USING "btree" ("team_id");



CREATE INDEX "idx_metaverse_fandom_user" ON "public"."metaverse_fandom_memberships" USING "btree" ("user_id");



CREATE INDEX "idx_metaverse_plots_plaza" ON "public"."metaverse_world_plots" USING "btree" ("plaza_name") WHERE ("is_active" = true);



CREATE INDEX "idx_metaverse_reports_reported" ON "public"."metaverse_user_reports" USING "btree" ("reported_user_id", "created_at" DESC);



CREATE INDEX "idx_metaverse_reports_status" ON "public"."metaverse_user_reports" USING "btree" ("status", "created_at" DESC) WHERE ("status" = 'open'::"text");



CREATE INDEX "idx_milestones_order" ON "public"."commission_milestones" USING "btree" ("order_id");



CREATE INDEX "idx_movie_quiz_results_quiz_id" ON "public"."movie_quiz_results" USING "btree" ("quiz_id");



CREATE INDEX "idx_movie_quizzes_category" ON "public"."movie_quizzes" USING "btree" ("category", "is_active");



CREATE INDEX "idx_movie_quizzes_difficulty" ON "public"."movie_quizzes" USING "btree" ("difficulty", "is_active");



CREATE INDEX "idx_news_alias_category" ON "public"."news_alias_dictionary" USING "btree" ("category");



CREATE INDEX "idx_news_alias_surfaces" ON "public"."news_alias_dictionary" USING "gin" ("surfaces");



CREATE INDEX "idx_news_reservoir_created_at" ON "public"."news_reservoir" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_news_reservoir_dedupe_key" ON "public"."news_reservoir" USING "btree" ("dedupe_key");



CREATE INDEX "idx_news_reservoir_issue_type" ON "public"."news_reservoir" USING "btree" ("issue_type") WHERE ("issue_type" IS NOT NULL);



CREATE INDEX "idx_news_reservoir_status" ON "public"."news_reservoir" USING "btree" ("status");



CREATE INDEX "idx_notifications_comment" ON "public"."notifications" USING "btree" ("related_comment_id");



CREATE INDEX "idx_notifications_post" ON "public"."notifications" USING "btree" ("related_post_id");



CREATE INDEX "idx_notifications_settlement" ON "public"."notifications" USING "btree" ("user_id", "type") WHERE ("type" = 'settlement_result'::"text");



CREATE INDEX "idx_notifications_type_expert" ON "public"."notifications" USING "btree" ("type", "created_at" DESC) WHERE ("type" = 'expert_prediction'::"text");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("is_read" = false);



CREATE INDEX "idx_notifications_user_read" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_orders_artist" ON "public"."commission_orders" USING "btree" ("artist_id", "status");



CREATE INDEX "idx_orders_auto_release" ON "public"."commission_orders" USING "btree" ("auto_release_at") WHERE (("auto_release_at" IS NOT NULL) AND ("status" = 'review'::"text"));



CREATE INDEX "idx_orders_client" ON "public"."commission_orders" USING "btree" ("client_id", "status");



CREATE INDEX "idx_pending_refunds_status" ON "public"."pending_refunds" USING "btree" ("status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_pending_refunds_user" ON "public"."pending_refunds" USING "btree" ("user_id");



CREATE INDEX "idx_pending_seller_rewards_seller" ON "public"."pending_seller_rewards" USING "btree" ("seller_id");



CREATE INDEX "idx_pending_seller_rewards_status" ON "public"."pending_seller_rewards" USING "btree" ("status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_point_tx_created" ON "public"."point_transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_point_tx_user_board" ON "public"."point_transactions" USING "btree" ("user_id", "board_slug");



CREATE INDEX "idx_post_flairs_community" ON "public"."post_flairs" USING "btree" ("community_slug", "sort_order") WHERE ("is_active" = true);



CREATE INDEX "idx_post_views_ip_hash" ON "public"."post_views" USING "btree" ("ip_hash");



CREATE INDEX "idx_post_views_post_id" ON "public"."post_views" USING "btree" ("post_id");



CREATE INDEX "idx_post_views_post_iphash_time" ON "public"."post_views" USING "btree" ("post_id", "ip_hash", "viewed_at" DESC);



CREATE INDEX "idx_post_votes_post_id" ON "public"."post_votes" USING "btree" ("post_id");



CREATE INDEX "idx_post_votes_post_type" ON "public"."post_votes" USING "btree" ("post_id", "vote_type");



CREATE INDEX "idx_post_votes_post_user" ON "public"."post_votes" USING "btree" ("post_id", "user_id");



CREATE INDEX "idx_post_votes_user_id" ON "public"."post_votes" USING "btree" ("user_id");



CREATE INDEX "idx_posts_category" ON "public"."posts" USING "btree" ("category_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_posts_comment_count" ON "public"."posts" USING "btree" ("comment_count" DESC, "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_posts_community_created" ON "public"."posts" USING "btree" ("community_slug", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_posts_community_date" ON "public"."posts" USING "btree" ("community_slug", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_posts_community_slug" ON "public"."posts" USING "btree" ("community_slug");



CREATE INDEX "idx_posts_content_gin" ON "public"."posts" USING "gin" ("content");



CREATE INDEX "idx_posts_created_at" ON "public"."posts" USING "btree" ("created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_posts_flair" ON "public"."posts" USING "btree" ("community_slug", "flair_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_posts_flair_team" ON "public"."posts" USING "btree" ("flair_team_id") WHERE ("flair_team_id" IS NOT NULL);



CREATE INDEX "idx_posts_last_comment_at" ON "public"."posts" USING "btree" ("last_comment_at" DESC NULLS LAST) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_posts_notice" ON "public"."posts" USING "btree" ("is_notice" DESC, "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_posts_temp_created" ON "public"."posts" USING "btree" ("temperature" DESC, "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_posts_temperature" ON "public"."posts" USING "btree" ("temperature" DESC, "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_posts_user" ON "public"."posts" USING "btree" ("user_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_posts_vote_count" ON "public"."posts" USING "btree" ("vote_count" DESC, "created_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_prediction_activities_created_at" ON "public"."prediction_activities" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_prediction_activities_daily_round_id" ON "public"."prediction_activities" USING "btree" ("daily_round_id");



CREATE INDEX "idx_prediction_activities_round_id" ON "public"."prediction_activities" USING "btree" ("round_id");



CREATE INDEX "idx_prediction_activities_user_created" ON "public"."prediction_activities" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_prediction_activities_user_id" ON "public"."prediction_activities" USING "btree" ("user_id");



CREATE INDEX "idx_prediction_activities_user_round" ON "public"."prediction_activities" USING "btree" ("user_id", "round_id");



CREATE INDEX "idx_prediction_purchases_activity_id" ON "public"."prediction_purchases" USING "btree" ("activity_id");



CREATE INDEX "idx_prediction_purchases_buyer_id" ON "public"."prediction_purchases" USING "btree" ("buyer_id");



CREATE INDEX "idx_prediction_seasons_league_id" ON "public"."prediction_seasons" USING "btree" ("league_id");



CREATE UNIQUE INDEX "idx_prediction_slips_idempotency" ON "public"."prediction_slips" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_prediction_slips_user_daily" ON "public"."prediction_slips" USING "btree" ("user_id", "daily_round_id");



CREATE INDEX "idx_predictions_created" ON "public"."predictions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_predictions_daily_round" ON "public"."betman_predictions" USING "btree" ("daily_round_id");



CREATE INDEX "idx_predictions_match" ON "public"."predictions" USING "btree" ("match_id");



CREATE INDEX "idx_predictions_slip_id" ON "public"."betman_predictions" USING "btree" ("slip_id");



CREATE INDEX "idx_predictions_status" ON "public"."predictions" USING "btree" ("status");



CREATE INDEX "idx_predictions_user" ON "public"."predictions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_predictions_user_match_type" ON "public"."predictions" USING "btree" ("user_id", "match_id", "prediction_type");



CREATE INDEX "idx_profiles_is_journalist" ON "public"."profiles" USING "btree" ("is_journalist") WHERE ("is_journalist" = true);



CREATE UNIQUE INDEX "idx_profiles_nickname_unique" ON "public"."profiles" USING "btree" ("lower"("nickname")) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_profiles_user_id" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "idx_purchased_content_prediction_id" ON "public"."purchased_content" USING "btree" ("prediction_id");



CREATE INDEX "idx_purchased_content_user_id" ON "public"."purchased_content" USING "btree" ("user_id", "purchased_at" DESC);



CREATE INDEX "idx_quiz_results_user" ON "public"."movie_quiz_results" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_reviews_artist" ON "public"."reviews" USING "btree" ("artist_id");



CREATE INDEX "idx_reviews_rating" ON "public"."reviews" USING "btree" ("rating");



CREATE INDEX "idx_run_log_source" ON "public"."crawler_run_log" USING "btree" ("source_id", "started_at" DESC);



CREATE INDEX "idx_stadium_contributions_team" ON "public"."stadium_contributions" USING "btree" ("team_id");



CREATE INDEX "idx_stadium_contributions_user" ON "public"."stadium_contributions" USING "btree" ("user_id");



CREATE INDEX "idx_stadium_investments_team" ON "public"."stadium_investments" USING "btree" ("team_id");



CREATE INDEX "idx_stadium_investments_time" ON "public"."stadium_investments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_stadium_investments_user" ON "public"."stadium_investments" USING "btree" ("user_id");



CREATE INDEX "idx_stats_rank" ON "public"."user_prediction_stats" USING "btree" ("rank_overall");



CREATE INDEX "idx_stats_total_points" ON "public"."user_prediction_stats" USING "btree" ("total_points" DESC);



CREATE INDEX "idx_stats_win_rate" ON "public"."user_prediction_stats" USING "btree" ("win_rate" DESC);



CREATE INDEX "idx_stickers_board" ON "public"."stickers" USING "btree" ("board_slug");



CREATE INDEX "idx_stickers_creator" ON "public"."stickers" USING "btree" ("creator_id");



CREATE INDEX "idx_stickers_pack" ON "public"."stickers" USING "btree" ("pack_id");



CREATE INDEX "idx_stickers_popular" ON "public"."stickers" USING "btree" ("purchase_count" DESC) WHERE ("status" = 'approved'::"text");



CREATE INDEX "idx_stickers_status" ON "public"."stickers" USING "btree" ("status");



CREATE INDEX "idx_suggestions_casting" ON "public"."virtual_casting_suggestions" USING "btree" ("casting_id", "vote_count" DESC);



CREATE INDEX "idx_team_aliases_team_id" ON "public"."team_aliases" USING "btree" ("team_id");



CREATE INDEX "idx_team_stadiums_team" ON "public"."team_stadiums" USING "btree" ("team_id");



CREATE INDEX "idx_temp_queue_unprocessed" ON "public"."temperature_update_queue" USING "btree" ("queued_at") WHERE ("processed_at" IS NULL);



CREATE INDEX "idx_ticker_comments_expire" ON "public"."ticker_comments" USING "btree" ("created_at");



CREATE INDEX "idx_ticker_comments_item" ON "public"."ticker_comments" USING "btree" ("ticker_item_id", "created_at" DESC);



CREATE INDEX "idx_ticker_items_community" ON "public"."news_ticker_items" USING "btree" ("community_slug", "importance" DESC, "posted_at" DESC);



CREATE INDEX "idx_ticker_items_posted" ON "public"."news_ticker_items" USING "btree" ("posted_at" DESC);



CREATE INDEX "idx_ticker_items_source" ON "public"."news_ticker_items" USING "btree" ("source_id", "posted_at" DESC);



CREATE INDEX "idx_token_transactions_created_at" ON "public"."token_transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_token_transactions_type" ON "public"."token_transactions" USING "btree" ("transaction_type");



CREATE INDEX "idx_token_transactions_user_id" ON "public"."token_transactions" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_token_tx_idempotency" ON "public"."token_transactions" USING "btree" ("user_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_ufs_flair_top" ON "public"."user_flair_scores" USING "btree" ("flair_id", "score_total" DESC);



CREATE INDEX "idx_ufs_user_total" ON "public"."user_flair_scores" USING "btree" ("user_id", "score_total" DESC);



CREATE UNIQUE INDEX "idx_unique_user_game_active_prediction" ON "public"."betman_predictions" USING "btree" ("user_id", "game_id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'settled'::"text"]));



CREATE INDEX "idx_user_adj_titles_user" ON "public"."user_adj_titles" USING "btree" ("user_id");



CREATE INDEX "idx_user_blocks_blocked" ON "public"."user_blocks" USING "btree" ("blocked_id");



CREATE INDEX "idx_user_blocks_blocker" ON "public"."user_blocks" USING "btree" ("blocker_id");



CREATE INDEX "idx_user_board_points_board" ON "public"."user_board_points" USING "btree" ("board_slug");



CREATE INDEX "idx_user_board_points_user" ON "public"."user_board_points" USING "btree" ("user_id");



CREATE INDEX "idx_user_cards_active" ON "public"."user_cards" USING "btree" ("user_id", "card_type", "expires_at");



CREATE INDEX "idx_user_cards_user_id" ON "public"."user_cards" USING "btree" ("user_id");



CREATE INDEX "idx_user_follows_both" ON "public"."user_follows" USING "btree" ("follower_id", "followed_user_id");



CREATE INDEX "idx_user_follows_followed" ON "public"."user_follows" USING "btree" ("followed_user_id");



CREATE INDEX "idx_user_follows_follower" ON "public"."user_follows" USING "btree" ("follower_id");



CREATE INDEX "idx_user_noun_titles_user" ON "public"."user_noun_titles" USING "btree" ("user_id");



CREATE INDEX "idx_user_pixel_arts_user" ON "public"."user_pixel_arts" USING "btree" ("user_id");



CREATE INDEX "idx_user_sanctions_active" ON "public"."user_sanctions" USING "btree" ("user_id") WHERE ("lifted_at" IS NULL);



CREATE INDEX "idx_user_sanctions_created" ON "public"."user_sanctions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_user_sanctions_type" ON "public"."user_sanctions" USING "btree" ("type");



CREATE INDEX "idx_user_sanctions_user" ON "public"."user_sanctions" USING "btree" ("user_id");



CREATE INDEX "idx_user_season_stats_season_id" ON "public"."user_season_stats" USING "btree" ("season_id");



CREATE INDEX "idx_user_stickers_user" ON "public"."user_stickers" USING "btree" ("user_id");



CREATE INDEX "idx_user_suspensions_active" ON "public"."user_suspensions" USING "btree" ("user_id", "suspended_until");



CREATE INDEX "idx_user_suspensions_user_id" ON "public"."user_suspensions" USING "btree" ("user_id");



CREATE INDEX "idx_user_tokens_last_reset_at" ON "public"."user_tokens" USING "btree" ("last_reset_at");



CREATE INDEX "idx_user_tokens_user_id" ON "public"."user_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_uut_user" ON "public"."user_unlocked_titles" USING "btree" ("user_id", "unlocked_at" DESC);



CREATE INDEX "idx_votes_comment" ON "public"."votes" USING "btree" ("target_id") WHERE ("target_type" = 'comment'::"text");



CREATE INDEX "idx_votes_post" ON "public"."votes" USING "btree" ("target_id") WHERE ("target_type" = 'post'::"text");



CREATE INDEX "idx_votes_target" ON "public"."votes" USING "btree" ("target_type", "target_id");



CREATE INDEX "idx_votes_user_id" ON "public"."votes" USING "btree" ("user_id");



CREATE INDEX "idx_weekly_analytics_period" ON "public"."weekly_analytics_reports" USING "btree" ("period_start" DESC);



CREATE INDEX "idx_worldcup_candidates_battle" ON "public"."worldcup_candidates" USING "btree" ("battle_id", "seed");



CREATE INDEX "idx_worldcup_sessions_battle" ON "public"."worldcup_sessions" USING "btree" ("battle_id");



CREATE INDEX "idx_worldcup_sessions_user" ON "public"."worldcup_sessions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_worldcup_votes_session" ON "public"."worldcup_votes" USING "btree" ("session_id", "round", "match_index");



CREATE INDEX "prediction_slips_event_idx" ON "public"."prediction_slips" USING "btree" ("event_id") WHERE ("event_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_metaverse_chat_rooms_active_plot" ON "public"."metaverse_chat_rooms" USING "btree" ("plot_id") WHERE ("closed_at" IS NULL);



CREATE UNIQUE INDEX "uq_metaverse_reports_pair_daily" ON "public"."metaverse_user_reports" USING "btree" ("reporter_user_id", "reported_user_id", "created_date");



CREATE OR REPLACE TRIGGER "check_prediction_before_insert" BEFORE INSERT ON "public"."predictions" FOR EACH ROW EXECUTE FUNCTION "public"."check_prediction_allowed"();



CREATE OR REPLACE TRIGGER "comments_flair_score" AFTER INSERT OR DELETE OR UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_comments_flair_score"();



CREATE OR REPLACE TRIGGER "commission_milestones_updated_at" BEFORE UPDATE ON "public"."commission_milestones" FOR EACH ROW EXECUTE FUNCTION "public"."update_commission_updated_at"();



CREATE OR REPLACE TRIGGER "commission_orders_updated_at" BEFORE UPDATE ON "public"."commission_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_commission_updated_at"();



CREATE OR REPLACE TRIGGER "commission_packages_updated_at" BEFORE UPDATE ON "public"."commission_packages" FOR EACH ROW EXECUTE FUNCTION "public"."update_commission_updated_at"();



CREATE OR REPLACE TRIGGER "increment_pending_on_insert" AFTER INSERT ON "public"."predictions" FOR EACH ROW EXECUTE FUNCTION "public"."increment_pending_predictions"();



CREATE OR REPLACE TRIGGER "init_stats_on_prediction" BEFORE INSERT ON "public"."predictions" FOR EACH ROW EXECUTE FUNCTION "public"."init_user_prediction_stats"();



CREATE OR REPLACE TRIGGER "news_alias_updated_at" BEFORE UPDATE ON "public"."news_alias_dictionary" FOR EACH ROW EXECUTE FUNCTION "public"."news_reservoir_set_updated_at"();



CREATE OR REPLACE TRIGGER "news_reservoir_updated_at" BEFORE UPDATE ON "public"."news_reservoir" FOR EACH ROW EXECUTE FUNCTION "public"."news_reservoir_set_updated_at"();



CREATE OR REPLACE TRIGGER "posts_flair_score" AFTER INSERT OR DELETE OR UPDATE ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."trg_posts_flair_score"();



CREATE OR REPLACE TRIGGER "set_comment_path_trigger" BEFORE INSERT ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_comment_path"();



CREATE OR REPLACE TRIGGER "sync_category_slug_trigger" BEFORE INSERT OR UPDATE ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."sync_category_from_slug"();



CREATE OR REPLACE TRIGGER "trg_audit_gold_balance_change" AFTER UPDATE OF "gold_balance" ON "public"."user_gold" FOR EACH ROW EXECUTE FUNCTION "public"."audit_gold_balance_change"();



CREATE OR REPLACE TRIGGER "trg_betman_games_auto_daily_round" BEFORE INSERT OR UPDATE ON "public"."betman_games" FOR EACH ROW EXECUTE FUNCTION "public"."trg_auto_assign_daily_round_id"();



CREATE OR REPLACE TRIGGER "trg_betman_games_count_sync" AFTER INSERT OR DELETE OR UPDATE ON "public"."betman_games" FOR EACH ROW EXECUTE FUNCTION "public"."trg_update_daily_round_game_count"();



CREATE OR REPLACE TRIGGER "trg_comment_update_temp" AFTER INSERT ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_on_comment_for_temp"();



CREATE OR REPLACE TRIGGER "trg_comment_vote_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."comment_votes" FOR EACH ROW EXECUTE FUNCTION "public"."recalc_comment_vote_count"();



CREATE OR REPLACE TRIGGER "trg_post_created" BEFORE INSERT ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_on_post_created"();



CREATE OR REPLACE TRIGGER "trg_post_vote_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."post_votes" FOR EACH ROW EXECUTE FUNCTION "public"."recalc_post_vote_count"();



CREATE OR REPLACE TRIGGER "trg_prevent_role_self_change" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_role_self_change"();



CREATE OR REPLACE TRIGGER "trg_sync_commission_used_slots" AFTER INSERT OR DELETE OR UPDATE OF "status" ON "public"."commission_orders" FOR EACH ROW EXECUTE FUNCTION "public"."sync_commission_used_slots"();



CREATE OR REPLACE TRIGGER "trg_sync_post_vote_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."post_votes" FOR EACH ROW EXECUTE FUNCTION "public"."sync_post_vote_count"();



CREATE OR REPLACE TRIGGER "trg_update_comment_count" AFTER INSERT ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_content_counts"();



CREATE OR REPLACE TRIGGER "trg_update_last_comment_at" AFTER INSERT OR DELETE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_post_last_comment_at"();



CREATE OR REPLACE TRIGGER "trg_update_last_comment_at_soft_delete" AFTER UPDATE OF "deleted_at" ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_post_last_comment_at"();



CREATE OR REPLACE TRIGGER "trg_update_post_count" AFTER INSERT ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_content_counts"();



CREATE OR REPLACE TRIGGER "trg_update_temp_after_comment" AFTER INSERT OR DELETE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_temp_after_comment"();



CREATE OR REPLACE TRIGGER "trg_update_temp_after_comment_soft_delete" AFTER UPDATE OF "deleted_at" ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_temp_after_comment"();



CREATE OR REPLACE TRIGGER "trg_update_temp_after_vote" AFTER INSERT OR DELETE OR UPDATE ON "public"."post_votes" FOR EACH ROW EXECUTE FUNCTION "public"."update_temp_after_vote"();



CREATE OR REPLACE TRIGGER "trg_user_temp_on_comment" AFTER INSERT OR DELETE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_user_temp_on_comment"();



CREATE OR REPLACE TRIGGER "trg_user_temp_on_post" AFTER INSERT OR DELETE ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_user_temp_on_post"();



CREATE OR REPLACE TRIGGER "trg_user_temp_on_vote" AFTER INSERT OR DELETE ON "public"."post_votes" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_user_temp_on_vote"();



CREATE OR REPLACE TRIGGER "trg_vote_update_temp" AFTER INSERT ON "public"."votes" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_on_vote_for_temp"();



CREATE OR REPLACE TRIGGER "update_categories_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_comments_updated_at" BEFORE UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_post_comment_count_trigger" AFTER INSERT OR DELETE OR UPDATE OF "deleted_at" ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_post_comment_count"();



CREATE OR REPLACE TRIGGER "update_posts_updated_at" BEFORE UPDATE ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_prediction_count" AFTER INSERT OR DELETE ON "public"."predictions" FOR EACH ROW EXECUTE FUNCTION "public"."update_match_prediction_count"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_stats_on_settlement" AFTER UPDATE ON "public"."predictions" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_stats_on_settlement"();



CREATE OR REPLACE TRIGGER "update_user_tokens_updated_at" BEFORE UPDATE ON "public"."user_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_vote_count_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."votes" FOR EACH ROW EXECUTE FUNCTION "public"."update_vote_count"();



CREATE OR REPLACE TRIGGER "update_votes_updated_at" BEFORE UPDATE ON "public"."votes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "votes_flair_score" AFTER INSERT OR DELETE OR UPDATE ON "public"."post_votes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_votes_flair_score"();



ALTER TABLE ONLY "public"."admin_activity_logs"
    ADD CONSTRAINT "admin_activity_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."agent_actions"
    ADD CONSTRAINT "agent_actions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("run_id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."banners"
    ADD CONSTRAINT "banners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."battle_comments"
    ADD CONSTRAINT "battle_comments_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "public"."battle_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."battle_comments"
    ADD CONSTRAINT "battle_comments_side_id_fkey" FOREIGN KEY ("side_id") REFERENCES "public"."battle_sides"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."battle_participants"
    ADD CONSTRAINT "battle_participants_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "public"."battle_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."battle_participants"
    ADD CONSTRAINT "battle_participants_side_id_fkey" FOREIGN KEY ("side_id") REFERENCES "public"."battle_sides"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."battle_sides"
    ADD CONSTRAINT "battle_sides_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "public"."battle_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."betman_games"
    ADD CONSTRAINT "betman_games_daily_round_id_fkey" FOREIGN KEY ("daily_round_id") REFERENCES "public"."betman_daily_rounds"("id");



ALTER TABLE ONLY "public"."betman_games"
    ADD CONSTRAINT "betman_games_mapped_away_team_id_fkey" FOREIGN KEY ("mapped_away_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."betman_games"
    ADD CONSTRAINT "betman_games_mapped_home_team_id_fkey" FOREIGN KEY ("mapped_home_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."betman_games"
    ADD CONSTRAINT "betman_games_mapped_league_id_fkey" FOREIGN KEY ("mapped_league_id") REFERENCES "public"."leagues"("id");



ALTER TABLE ONLY "public"."betman_games"
    ADD CONSTRAINT "betman_games_mapped_match_id_fkey" FOREIGN KEY ("mapped_match_id") REFERENCES "public"."matches"("id");



ALTER TABLE ONLY "public"."betman_games"
    ADD CONSTRAINT "betman_games_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."betman_rounds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."betman_predictions"
    ADD CONSTRAINT "betman_predictions_daily_round_id_fkey" FOREIGN KEY ("daily_round_id") REFERENCES "public"."betman_daily_rounds"("id");



ALTER TABLE ONLY "public"."betman_predictions"
    ADD CONSTRAINT "betman_predictions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."betman_games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."betman_predictions"
    ADD CONSTRAINT "betman_predictions_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."betman_rounds"("id");



ALTER TABLE ONLY "public"."betman_predictions"
    ADD CONSTRAINT "betman_predictions_slip_id_fkey" FOREIGN KEY ("slip_id") REFERENCES "public"."prediction_slips"("id");



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_slug_fkey" FOREIGN KEY ("parent_slug") REFERENCES "public"."categories"("slug");



ALTER TABLE ONLY "public"."comment_votes"
    ADD CONSTRAINT "comment_votes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_sticker_id_fkey" FOREIGN KEY ("sticker_id") REFERENCES "public"."stickers"("id");



ALTER TABLE ONLY "public"."commission_messages"
    ADD CONSTRAINT "commission_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."commission_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commission_milestones"
    ADD CONSTRAINT "commission_milestones_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."commission_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commission_orders"
    ADD CONSTRAINT "commission_orders_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."commission_packages"("id");



ALTER TABLE ONLY "public"."content_flags"
    ADD CONSTRAINT "content_flags_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("run_id");



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."draft_participants"
    ADD CONSTRAINT "draft_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."draft_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draft_picks"
    ADD CONSTRAINT "draft_picks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."draft_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draft_results"
    ADD CONSTRAINT "draft_results_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."draft_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_groups"
    ADD CONSTRAINT "event_groups_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_leaderboard_snapshots"
    ADD CONSTRAINT "event_leaderboard_snapshots_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_leaderboard_snapshots"
    ADD CONSTRAINT "event_leaderboard_snapshots_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."event_groups"("id");



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."event_groups"("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feature_test_logs"
    ADD CONSTRAINT "feature_test_logs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("run_id");



ALTER TABLE ONLY "public"."flair_titles"
    ADD CONSTRAINT "flair_titles_flair_id_fkey" FOREIGN KEY ("flair_id") REFERENCES "public"."post_flairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gold_transactions"
    ADD CONSTRAINT "gold_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."inquiries"
    ADD CONSTRAINT "inquiries_replied_by_fkey" FOREIGN KEY ("replied_by") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."inquiries"
    ADD CONSTRAINT "inquiries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."league_aliases"
    ADD CONSTRAINT "league_aliases_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_rooms"
    ADD CONSTRAINT "live_rooms_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."betman_games"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."match_odds"
    ADD CONSTRAINT "match_odds_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id");



ALTER TABLE ONLY "public"."metaverse_avatar_inventory"
    ADD CONSTRAINT "metaverse_avatar_inventory_avatar_key_fkey" FOREIGN KEY ("avatar_key") REFERENCES "public"."metaverse_avatar_items"("avatar_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."metaverse_chat_rooms"
    ADD CONSTRAINT "metaverse_chat_rooms_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "public"."metaverse_world_plots"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."metaverse_fandom_memberships"
    ADD CONSTRAINT "metaverse_fandom_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team_map_pins"("team_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."metaverse_user_reports"
    ADD CONSTRAINT "metaverse_user_reports_context_room_id_fkey" FOREIGN KEY ("context_room_id") REFERENCES "public"."metaverse_chat_rooms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."movie_quiz_results"
    ADD CONSTRAINT "movie_quiz_results_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."movie_quizzes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_related_comment_id_fkey" FOREIGN KEY ("related_comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_related_post_id_fkey" FOREIGN KEY ("related_post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_refunds"
    ADD CONSTRAINT "pending_refunds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_seller_rewards"
    ADD CONSTRAINT "pending_seller_rewards_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_seller_rewards"
    ADD CONSTRAINT "pending_seller_rewards_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_flairs"
    ADD CONSTRAINT "post_flairs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team_map_pins"("team_id");



ALTER TABLE ONLY "public"."post_views"
    ADD CONSTRAINT "post_views_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."post_votes"
    ADD CONSTRAINT "post_votes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_flair_id_fkey" FOREIGN KEY ("flair_id") REFERENCES "public"."post_flairs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_flair_team_id_fkey" FOREIGN KEY ("flair_team_id") REFERENCES "public"."team_map_pins"("team_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."prediction_activities"
    ADD CONSTRAINT "prediction_activities_daily_round_id_fkey" FOREIGN KEY ("daily_round_id") REFERENCES "public"."betman_daily_rounds"("id");



ALTER TABLE ONLY "public"."prediction_activities"
    ADD CONSTRAINT "prediction_activities_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."betman_rounds"("id");



ALTER TABLE ONLY "public"."prediction_purchases"
    ADD CONSTRAINT "prediction_purchases_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."prediction_activities"("id");



ALTER TABLE ONLY "public"."prediction_purchases"
    ADD CONSTRAINT "prediction_purchases_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."prediction_seasons"
    ADD CONSTRAINT "prediction_seasons_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id");



ALTER TABLE ONLY "public"."prediction_slips"
    ADD CONSTRAINT "prediction_slips_daily_round_id_fkey" FOREIGN KEY ("daily_round_id") REFERENCES "public"."betman_daily_rounds"("id");



ALTER TABLE ONLY "public"."prediction_slips"
    ADD CONSTRAINT "prediction_slips_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id");



ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_display_title_id_fkey" FOREIGN KEY ("display_title_id") REFERENCES "public"."flair_titles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_equipped_pixel_art_id_fkey" FOREIGN KEY ("equipped_pixel_art_id") REFERENCES "public"."pixel_art_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchased_content"
    ADD CONSTRAINT "purchased_content_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchased_content"
    ADD CONSTRAINT "purchased_content_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."seeded_reddit_posts"
    ADD CONSTRAINT "seeded_reddit_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."stadium_contributions"
    ADD CONSTRAINT "stadium_contributions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team_map_pins"("team_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stadium_investments"
    ADD CONSTRAINT "stadium_investments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team_map_pins"("team_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sticker_votes"
    ADD CONSTRAINT "sticker_votes_sticker_id_fkey" FOREIGN KEY ("sticker_id") REFERENCES "public"."stickers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stickers"
    ADD CONSTRAINT "stickers_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "public"."sticker_packs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_aliases"
    ADD CONSTRAINT "team_aliases_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_stadiums"
    ADD CONSTRAINT "team_stadiums_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."team_map_pins"("team_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."temperature_update_queue"
    ADD CONSTRAINT "temperature_update_queue_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticker_comments"
    ADD CONSTRAINT "ticker_comments_ticker_item_id_fkey" FOREIGN KEY ("ticker_item_id") REFERENCES "public"."news_ticker_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."token_transactions"
    ADD CONSTRAINT "token_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_adj_titles"
    ADD CONSTRAINT "user_adj_titles_adj_title_id_fkey" FOREIGN KEY ("adj_title_id") REFERENCES "public"."adj_titles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_cards"
    ADD CONSTRAINT "user_cards_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."content_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_equipped_titles"
    ADD CONSTRAINT "user_equipped_titles_adj_title_id_fkey" FOREIGN KEY ("adj_title_id") REFERENCES "public"."adj_titles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_equipped_titles"
    ADD CONSTRAINT "user_equipped_titles_noun_title_id_fkey" FOREIGN KEY ("noun_title_id") REFERENCES "public"."noun_titles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_flair_scores"
    ADD CONSTRAINT "user_flair_scores_flair_id_fkey" FOREIGN KEY ("flair_id") REFERENCES "public"."post_flairs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_gold"
    ADD CONSTRAINT "user_gold_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."user_noun_titles"
    ADD CONSTRAINT "user_noun_titles_noun_title_id_fkey" FOREIGN KEY ("noun_title_id") REFERENCES "public"."noun_titles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_pixel_arts"
    ADD CONSTRAINT "user_pixel_arts_pixel_art_id_fkey" FOREIGN KEY ("pixel_art_id") REFERENCES "public"."pixel_art_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_season_stats"
    ADD CONSTRAINT "user_season_stats_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."prediction_seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_stickers"
    ADD CONSTRAINT "user_stickers_sticker_id_fkey" FOREIGN KEY ("sticker_id") REFERENCES "public"."stickers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tokens"
    ADD CONSTRAINT "user_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_unlocked_titles"
    ADD CONSTRAINT "user_unlocked_titles_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "public"."flair_titles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."virtual_casting_suggestions"
    ADD CONSTRAINT "virtual_casting_suggestions_casting_id_fkey" FOREIGN KEY ("casting_id") REFERENCES "public"."virtual_castings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."virtual_casting_votes"
    ADD CONSTRAINT "virtual_casting_votes_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "public"."virtual_casting_suggestions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worldcup_candidates"
    ADD CONSTRAINT "worldcup_candidates_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "public"."battle_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worldcup_sessions"
    ADD CONSTRAINT "worldcup_sessions_battle_id_fkey" FOREIGN KEY ("battle_id") REFERENCES "public"."battle_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worldcup_sessions"
    ADD CONSTRAINT "worldcup_sessions_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."worldcup_candidates"("id");



ALTER TABLE ONLY "public"."worldcup_votes"
    ADD CONSTRAINT "worldcup_votes_candidate_a_id_fkey" FOREIGN KEY ("candidate_a_id") REFERENCES "public"."worldcup_candidates"("id");



ALTER TABLE ONLY "public"."worldcup_votes"
    ADD CONSTRAINT "worldcup_votes_candidate_b_id_fkey" FOREIGN KEY ("candidate_b_id") REFERENCES "public"."worldcup_candidates"("id");



ALTER TABLE ONLY "public"."worldcup_votes"
    ADD CONSTRAINT "worldcup_votes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."worldcup_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worldcup_votes"
    ADD CONSTRAINT "worldcup_votes_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."worldcup_candidates"("id");



CREATE POLICY "Admin only for pending_refunds" ON "public"."pending_refunds" USING (false);



CREATE POLICY "Admin only for pending_seller_rewards" ON "public"."pending_seller_rewards" USING (false);



CREATE POLICY "Admins can create logs" ON "public"."admin_activity_logs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = ("auth"."uid"())::"text") AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage FAQs" ON "public"."faqs" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = ("auth"."uid"())::"text") AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage all predictions" ON "public"."betman_predictions" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'sub'::"text")) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage announcements" ON "public"."announcements" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = ("auth"."uid"())::"text") AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage banners" ON "public"."banners" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = ("auth"."uid"())::"text") AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage betman_games" ON "public"."betman_games" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'sub'::"text")) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage betman_rounds" ON "public"."betman_rounds" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'sub'::"text")) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage disputes" ON "public"."disputes" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = ("auth"."uid"())::"text") AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage inquiries" ON "public"."inquiries" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = ("auth"."uid"())::"text") AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage league_aliases" ON "public"."league_aliases" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'sub'::"text")) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage reviews" ON "public"."reviews" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = ("auth"."uid"())::"text") AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage settings" ON "public"."site_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = ("auth"."uid"())::"text") AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage team_aliases" ON "public"."team_aliases" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'sub'::"text")) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view logs" ON "public"."admin_activity_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = ("auth"."uid"())::"text") AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Allow public read on betman_daily_rounds" ON "public"."betman_daily_rounds" FOR SELECT USING (true);



CREATE POLICY "Anyone can read active banners" ON "public"."announcement_banners" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can read betman_games" ON "public"."betman_games" FOR SELECT USING (true);



CREATE POLICY "Anyone can read betman_rounds" ON "public"."betman_rounds" FOR SELECT USING (true);



CREATE POLICY "Anyone can read comment votes" ON "public"."comment_votes" FOR SELECT USING (true);



CREATE POLICY "Anyone can read league_aliases" ON "public"."league_aliases" FOR SELECT USING (true);



CREATE POLICY "Anyone can read settings" ON "public"."site_settings" FOR SELECT USING (true);



CREATE POLICY "Anyone can read stats" ON "public"."betman_user_sport_stats" FOR SELECT USING (true);



CREATE POLICY "Anyone can read team_aliases" ON "public"."team_aliases" FOR SELECT USING (true);



CREATE POLICY "Anyone can read ticker items" ON "public"."news_ticker_items" FOR SELECT USING (true);



CREATE POLICY "Anyone can view active FAQs" ON "public"."faqs" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view active announcements" ON "public"."announcements" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view active banners" ON "public"."banners" FOR SELECT USING ((("is_active" = true) AND ("starts_at" <= "now"()) AND (("expires_at" IS NULL) OR ("expires_at" > "now"()))));



CREATE POLICY "Anyone can view active packages" ON "public"."commission_packages" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view activities" ON "public"."prediction_activities" FOR SELECT USING (true);



CREATE POLICY "Anyone can view community follows" ON "public"."community_follows" FOR SELECT USING (true);



CREATE POLICY "Anyone can view draft participants" ON "public"."draft_participants" FOR SELECT USING (true);



CREATE POLICY "Anyone can view draft picks" ON "public"."draft_picks" FOR SELECT USING (true);



CREATE POLICY "Anyone can view draft results" ON "public"."draft_results" FOR SELECT USING (true);



CREATE POLICY "Anyone can view draft rooms" ON "public"."draft_rooms" FOR SELECT USING (true);



CREATE POLICY "Anyone can view reviews" ON "public"."reviews" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can create bookmarks" ON "public"."bookmarks" FOR INSERT WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Authenticated users can create comments" ON "public"."comments" FOR INSERT WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Authenticated users can create posts" ON "public"."posts" FOR INSERT WITH CHECK (((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id") AND (("is_notice" = false) OR ("is_notice" IS NULL) OR "public"."is_moderator_or_admin"(( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))));



CREATE POLICY "Authenticated users can create votes" ON "public"."votes" FOR INSERT WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Authenticated users can insert comment votes" ON "public"."comment_votes" FOR INSERT WITH CHECK (true);



CREATE POLICY "Authenticated users can insert post_views" ON "public"."post_views" FOR INSERT WITH CHECK ((( SELECT "auth"."jwt"() AS "jwt") IS NOT NULL));



CREATE POLICY "Authenticated users can manage their own votes" ON "public"."post_votes" USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id")) WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Categories are viewable by everyone" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "Clients can create reviews" ON "public"."reviews" FOR INSERT WITH CHECK (("reviewer_id" = ("auth"."uid"())::"text"));



CREATE POLICY "Comments are viewable by everyone" ON "public"."comments" FOR SELECT USING (("deleted_at" IS NULL));



CREATE POLICY "Flair scores are viewable by everyone" ON "public"."user_flair_scores" FOR SELECT USING (true);



CREATE POLICY "Flair titles are viewable by everyone" ON "public"."flair_titles" FOR SELECT USING (true);



CREATE POLICY "Flairs are viewable by everyone" ON "public"."post_flairs" FOR SELECT USING (true);



CREATE POLICY "Follow relationships are viewable by everyone" ON "public"."user_follows" FOR SELECT USING (true);



CREATE POLICY "Message participants can view" ON "public"."commission_messages" FOR SELECT USING (((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "sender_id") OR (EXISTS ( SELECT 1
   FROM "public"."commission_orders" "o"
  WHERE (("o"."id" = "commission_messages"."order_id") AND ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "o"."client_id") OR (( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "o"."artist_id")))))));



CREATE POLICY "Milestone participants can view" ON "public"."commission_milestones" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."commission_orders" "o"
  WHERE (("o"."id" = "commission_milestones"."order_id") AND ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "o"."client_id") OR (( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "o"."artist_id"))))));



CREATE POLICY "Only admins can modify scoring config" ON "public"."scoring_config" USING (false) WITH CHECK (false);



CREATE POLICY "Order participants can view" ON "public"."commission_orders" FOR SELECT USING (((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "client_id") OR (( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "artist_id")));



CREATE POLICY "Posts are viewable by everyone" ON "public"."posts" FOR SELECT USING (("deleted_at" IS NULL));



CREATE POLICY "Profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Scoring config is viewable by everyone" ON "public"."scoring_config" FOR SELECT USING (true);



CREATE POLICY "Service role can manage comment_cooldowns" ON "public"."comment_cooldowns" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



CREATE POLICY "Service role can manage post_views" ON "public"."post_views" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



CREATE POLICY "Service role full access" ON "public"."crawler_run_log" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



CREATE POLICY "System only access" ON "public"."temperature_update_queue" USING (false) WITH CHECK (false);



CREATE POLICY "Unlocked titles are viewable by everyone" ON "public"."user_unlocked_titles" FOR SELECT USING (true);



CREATE POLICY "Users can create disputes" ON "public"."disputes" FOR INSERT WITH CHECK (("raised_by" = ("auth"."uid"())::"text"));



CREATE POLICY "Users can create inquiries" ON "public"."inquiries" FOR INSERT WITH CHECK ((("user_id" = ("auth"."uid"())::"text") OR ("user_id" IS NULL)));



CREATE POLICY "Users can create own predictions" ON "public"."betman_predictions" FOR INSERT WITH CHECK (("user_id" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'sub'::"text")));



CREATE POLICY "Users can delete own blocks" ON "public"."user_blocks" FOR DELETE USING (true);



CREATE POLICY "Users can delete own comment votes" ON "public"."comment_votes" FOR DELETE USING (true);



CREATE POLICY "Users can delete their own bookmarks" ON "public"."bookmarks" FOR DELETE USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can delete their own comments" ON "public"."comments" FOR DELETE USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can delete their own posts" ON "public"."posts" FOR DELETE USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can delete their own votes" ON "public"."votes" FOR DELETE USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can follow others" ON "public"."user_follows" FOR INSERT WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "follower_id"));



CREATE POLICY "Users can insert messages" ON "public"."direct_messages" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can insert own blocks" ON "public"."user_blocks" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can manage own favorites" ON "public"."favorites" USING (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "Users can manage own follows" ON "public"."community_follows" USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can read own follows" ON "public"."community_follows" FOR SELECT USING (true);



CREATE POLICY "Users can read own predictions" ON "public"."betman_predictions" FOR SELECT USING (("user_id" = (("current_setting"('request.jwt.claims'::"text", true))::json ->> 'sub'::"text")));



CREATE POLICY "Users can unfollow" ON "public"."user_follows" FOR DELETE USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "follower_id"));



CREATE POLICY "Users can update own comment votes" ON "public"."comment_votes" FOR UPDATE USING (true);



CREATE POLICY "Users can update own messages" ON "public"."direct_messages" FOR UPDATE USING (true);



CREATE POLICY "Users can update their own comments" ON "public"."comments" FOR UPDATE USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id")) WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id")) WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can update their own posts" ON "public"."posts" FOR UPDATE USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id")) WITH CHECK (((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id") AND (("is_notice" = false) OR ("is_notice" IS NULL) OR "public"."is_moderator_or_admin"(( SELECT ("auth"."jwt"() ->> 'sub'::"text"))))));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id")) WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can update their own tokens" ON "public"."user_tokens" FOR UPDATE USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id")) WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can update their own votes" ON "public"."votes" FOR UPDATE USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id")) WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can view own blocks" ON "public"."user_blocks" FOR SELECT USING (true);



CREATE POLICY "Users can view own favorites" ON "public"."favorites" FOR SELECT USING (("user_id" = ("auth"."uid"())::"text"));



CREATE POLICY "Users can view own gold" ON "public"."user_gold" FOR SELECT USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can view own gold transactions" ON "public"."gold_transactions" FOR SELECT USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can view own inquiries" ON "public"."inquiries" FOR SELECT USING ((("user_id" = ("auth"."uid"())::"text") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = ("auth"."uid"())::"text") AND ("profiles"."role" = 'admin'::"text"))))));



CREATE POLICY "Users can view own messages" ON "public"."direct_messages" FOR SELECT USING (true);



CREATE POLICY "Users can view own purchases" ON "public"."prediction_purchases" FOR SELECT USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "buyer_id"));



CREATE POLICY "Users can view their own bookmarks" ON "public"."bookmarks" FOR SELECT USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can view their own cooldown" ON "public"."comment_cooldowns" FOR SELECT USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can view their own purchases" ON "public"."purchased_content" FOR SELECT USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can view their own tokens" ON "public"."user_tokens" FOR SELECT USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Users can view their own transactions" ON "public"."token_transactions" FOR SELECT USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "Votes are viewable by everyone" ON "public"."post_votes" FOR SELECT USING (true);



CREATE POLICY "Votes are viewable by everyone" ON "public"."votes" FOR SELECT USING (true);



ALTER TABLE "public"."adj_titles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "adj_titles_read" ON "public"."adj_titles" FOR SELECT USING (true);



ALTER TABLE "public"."admin_activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_read_audit_logs" ON "public"."admin_audit_logs" FOR SELECT USING ("public"."is_admin"(( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));



ALTER TABLE "public"."agent_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_personas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcement_banners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."banners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."battle_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "battle_comments_select" ON "public"."battle_comments" FOR SELECT USING (true);



CREATE POLICY "battle_comments_service" ON "public"."battle_comments" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."battle_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "battle_participants_select" ON "public"."battle_participants" FOR SELECT USING (true);



CREATE POLICY "battle_participants_service" ON "public"."battle_participants" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."battle_rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "battle_rooms_select" ON "public"."battle_rooms" FOR SELECT USING (true);



CREATE POLICY "battle_rooms_service" ON "public"."battle_rooms" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."battle_sides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "battle_sides_select" ON "public"."battle_sides" FOR SELECT USING (true);



CREATE POLICY "battle_sides_service" ON "public"."battle_sides" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."betman_daily_rounds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."betman_games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."betman_predictions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."betman_rounds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."betman_sync_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."betman_unknown_games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."betman_user_sport_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookmarks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "casting_votes_insert" ON "public"."virtual_casting_votes" FOR INSERT WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "casting_votes_read" ON "public"."virtual_casting_votes" FOR SELECT USING (true);



CREATE POLICY "castings_insert" ON "public"."virtual_castings" FOR INSERT WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "created_by"));



CREATE POLICY "castings_read" ON "public"."virtual_castings" FOR SELECT USING (true);



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comment_cooldowns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comment_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commission_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commission_milestones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commission_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commission_packages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crawler_run_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cron_run_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_cap_read_own" ON "public"."daily_point_caps" FOR SELECT USING (("user_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));



ALTER TABLE "public"."daily_point_caps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deny_all_betman_sync_state" ON "public"."betman_sync_state" USING (false);



ALTER TABLE "public"."direct_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."disputes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."draft_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."draft_picks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."draft_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."draft_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_groups_public_read" ON "public"."event_groups" FOR SELECT USING (true);



CREATE POLICY "event_lb_snap_public_read" ON "public"."event_leaderboard_snapshots" FOR SELECT USING (true);



ALTER TABLE "public"."event_leaderboard_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "event_reg_own_insert" ON "public"."event_registrations" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'sub'::"text") = "user_id"));



CREATE POLICY "event_reg_own_read" ON "public"."event_registrations" FOR SELECT USING ((("auth"."jwt"() ->> 'sub'::"text") = "user_id"));



ALTER TABLE "public"."event_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_public_read" ON "public"."events" FOR SELECT USING (("status" = ANY (ARRAY['open'::"text", 'live'::"text", 'closed'::"text"])));



ALTER TABLE "public"."faqs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feature_test_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."flair_titles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gold_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inquiries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."league_aliases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leagues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leagues_admin_all" ON "public"."leagues" USING ("public"."is_admin"(( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));



CREATE POLICY "leagues_select_all" ON "public"."leagues" FOR SELECT USING (true);



ALTER TABLE "public"."live_rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "live_rooms_read" ON "public"."live_rooms" FOR SELECT USING (true);



ALTER TABLE "public"."match_odds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_odds_admin_all" ON "public"."match_odds" USING ("public"."is_admin"(( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));



CREATE POLICY "match_odds_select_all" ON "public"."match_odds" FOR SELECT USING (true);



ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "matches_admin_all" ON "public"."matches" USING ("public"."is_admin"(( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));



CREATE POLICY "matches_select_all" ON "public"."matches" FOR SELECT USING (true);



CREATE POLICY "metaverse_avatar_inv_self_read" ON "public"."metaverse_avatar_inventory" FOR SELECT USING (("user_id" = ("auth"."jwt"() ->> 'sub'::"text")));



ALTER TABLE "public"."metaverse_avatar_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."metaverse_avatar_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "metaverse_avatar_items_read" ON "public"."metaverse_avatar_items" FOR SELECT USING (("is_active" = true));



CREATE POLICY "metaverse_balance_self_read" ON "public"."metaverse_user_activity_balance" FOR SELECT USING (("user_id" = ("auth"."jwt"() ->> 'sub'::"text")));



ALTER TABLE "public"."metaverse_chat_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."metaverse_fandom_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "metaverse_fandom_read" ON "public"."metaverse_fandom_memberships" FOR SELECT USING (true);



CREATE POLICY "metaverse_plots_read" ON "public"."metaverse_world_plots" FOR SELECT USING (("is_active" = true));



CREATE POLICY "metaverse_reports_self_read" ON "public"."metaverse_user_reports" FOR SELECT USING (("reporter_user_id" = ("auth"."jwt"() ->> 'sub'::"text")));



CREATE POLICY "metaverse_rooms_read" ON "public"."metaverse_chat_rooms" FOR SELECT USING (("closed_at" IS NULL));



ALTER TABLE "public"."metaverse_user_activity_balance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."metaverse_user_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."metaverse_world_plots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movie_quiz_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movie_quizzes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "movie_quizzes_read" ON "public"."movie_quizzes" FOR SELECT USING (true);



ALTER TABLE "public"."news_alias_dictionary" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news_reservoir" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."news_ticker_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."noun_titles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "noun_titles_read" ON "public"."noun_titles" FOR SELECT USING (true);



ALTER TABLE "public"."pending_refunds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_seller_rewards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pixel_art_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pixel_art_items_read" ON "public"."pixel_art_items" FOR SELECT USING (true);



ALTER TABLE "public"."point_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "point_tx_read_own" ON "public"."point_transactions" FOR SELECT USING (("user_id" = ( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));



ALTER TABLE "public"."post_flairs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prediction_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prediction_purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prediction_seasons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prediction_slips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."predictions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "predictions_insert_own" ON "public"."predictions" FOR INSERT WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "predictions_select_own" ON "public"."predictions" FOR SELECT USING ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "predictions_select_settled" ON "public"."predictions" FOR SELECT USING (("status" <> 'pending'::"text"));



CREATE POLICY "predictions_update_admin" ON "public"."predictions" FOR UPDATE USING ("public"."is_admin"(( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchased_content" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quiz_results_insert" ON "public"."movie_quiz_results" FOR INSERT WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "quiz_results_read" ON "public"."movie_quiz_results" FOR SELECT USING (true);



ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scoring_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "season_stats_admin_all" ON "public"."user_season_stats" USING ("public"."is_admin"(( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));



CREATE POLICY "season_stats_select_all" ON "public"."user_season_stats" FOR SELECT USING (true);



CREATE POLICY "seasons_admin_all" ON "public"."prediction_seasons" USING ("public"."is_admin"(( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));



CREATE POLICY "seasons_select_all" ON "public"."prediction_seasons" FOR SELECT USING (true);



ALTER TABLE "public"."seeded_reddit_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_all_reports" ON "public"."content_reports" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



CREATE POLICY "service_role_all_sanctions" ON "public"."user_sanctions" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



ALTER TABLE "public"."site_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stadium_contributions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stadium_contributions_read" ON "public"."stadium_contributions" FOR SELECT USING (true);



ALTER TABLE "public"."stadium_investments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stadium_investments_read" ON "public"."stadium_investments" FOR SELECT USING (true);



ALTER TABLE "public"."stadium_level_thresholds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stadium_level_thresholds_read" ON "public"."stadium_level_thresholds" FOR SELECT USING (true);



ALTER TABLE "public"."standings_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "standings_cache_public_read" ON "public"."standings_cache" FOR SELECT USING (true);



CREATE POLICY "stats_admin_all" ON "public"."user_prediction_stats" USING ("public"."is_admin"(( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));



CREATE POLICY "stats_select_all" ON "public"."user_prediction_stats" FOR SELECT USING (true);



ALTER TABLE "public"."sticker_packs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sticker_packs_select" ON "public"."sticker_packs" FOR SELECT USING (true);



CREATE POLICY "sticker_packs_service" ON "public"."sticker_packs" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."sticker_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sticker_votes_select" ON "public"."sticker_votes" FOR SELECT USING (true);



CREATE POLICY "sticker_votes_service" ON "public"."sticker_votes" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."stickers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stickers_select" ON "public"."stickers" FOR SELECT USING (true);



CREATE POLICY "stickers_service" ON "public"."stickers" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "suggestions_insert" ON "public"."virtual_casting_suggestions" FOR INSERT WITH CHECK ((( SELECT ("auth"."jwt"() ->> 'sub'::"text")) = "user_id"));



CREATE POLICY "suggestions_read" ON "public"."virtual_casting_suggestions" FOR SELECT USING (true);



ALTER TABLE "public"."team_aliases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_map_pins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_map_pins_read" ON "public"."team_map_pins" FOR SELECT USING (true);



ALTER TABLE "public"."team_stadiums" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_stadiums_read" ON "public"."team_stadiums" FOR SELECT USING (true);



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_admin_all" ON "public"."teams" USING ("public"."is_admin"(( SELECT ("auth"."jwt"() ->> 'sub'::"text"))));



CREATE POLICY "teams_select_all" ON "public"."teams" FOR SELECT USING (true);



ALTER TABLE "public"."temperature_update_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticker_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticker_comments_insert" ON "public"."ticker_comments" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'sub'::"text") = "user_id"));



CREATE POLICY "ticker_comments_read" ON "public"."ticker_comments" FOR SELECT USING (true);



ALTER TABLE "public"."token_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_adj_titles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_adj_titles_read" ON "public"."user_adj_titles" FOR SELECT USING (true);



ALTER TABLE "public"."user_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_board_points" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_board_points_read" ON "public"."user_board_points" FOR SELECT USING (true);



ALTER TABLE "public"."user_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_equipped_titles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_equipped_titles_read" ON "public"."user_equipped_titles" FOR SELECT USING (true);



ALTER TABLE "public"."user_flair_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_gold" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_noun_titles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_noun_titles_read" ON "public"."user_noun_titles" FOR SELECT USING (true);



ALTER TABLE "public"."user_pixel_arts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_pixel_arts_read" ON "public"."user_pixel_arts" FOR SELECT USING (true);



ALTER TABLE "public"."user_prediction_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_sanctions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_season_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_stickers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_stickers_select" ON "public"."user_stickers" FOR SELECT USING (true);



CREATE POLICY "user_stickers_service" ON "public"."user_stickers" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."user_suspensions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_unlocked_titles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."virtual_casting_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."virtual_casting_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."virtual_castings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_analytics_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."worldcup_candidates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worldcup_candidates_select" ON "public"."worldcup_candidates" FOR SELECT USING (true);



CREATE POLICY "worldcup_candidates_service" ON "public"."worldcup_candidates" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."worldcup_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worldcup_sessions_select" ON "public"."worldcup_sessions" FOR SELECT USING (true);



CREATE POLICY "worldcup_sessions_service" ON "public"."worldcup_sessions" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."worldcup_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worldcup_votes_select" ON "public"."worldcup_votes" FOR SELECT USING (true);



CREATE POLICY "worldcup_votes_service" ON "public"."worldcup_votes" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_adjust_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_adjust_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_adjust_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_adjust_tokens"("p_user_id" "text", "p_amount" integer, "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_adjust_tokens"("p_user_id" "text", "p_amount" integer, "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_adjust_tokens"("p_user_id" "text", "p_amount" integer, "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_flair_score"("p_user_id" "text", "p_flair_id" "uuid", "p_delta" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."apply_flair_score"("p_user_id" "text", "p_flair_id" "uuid", "p_delta" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_flair_score"("p_user_id" "text", "p_flair_id" "uuid", "p_delta" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_daily_round"("p_daily_id" "date", "p_daily_round_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_daily_round"("p_daily_id" "date", "p_daily_round_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_daily_round"("p_daily_id" "date", "p_daily_round_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_gold_balance_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_gold_balance_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_gold_balance_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."award_points"("p_user_id" "text", "p_board_slug" "text", "p_amount" integer, "p_type" "text", "p_description" "text", "p_related_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."award_points"("p_user_id" "text", "p_board_slug" "text", "p_amount" integer, "p_type" "text", "p_description" "text", "p_related_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_points"("p_user_id" "text", "p_board_slug" "text", "p_amount" integer, "p_type" "text", "p_description" "text", "p_related_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."betman_check_sync_health"() TO "anon";
GRANT ALL ON FUNCTION "public"."betman_check_sync_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."betman_check_sync_health"() TO "service_role";



GRANT ALL ON FUNCTION "public"."betman_update_sync_state"("new_gm_ts" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."betman_update_sync_state"("new_gm_ts" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."betman_update_sync_state"("new_gm_ts" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calc_streaks"("p_user_id" "text", "p_sport" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."calc_streaks"("p_user_id" "text", "p_sport" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_streaks"("p_user_id" "text", "p_sport" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_post_temperature"("p_post_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_post_temperature"("p_post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_post_temperature"("p_post_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_increment_view_count"("post_id_param" "uuid", "ip_address_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_increment_view_count"("post_id_param" "uuid", "ip_address_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_increment_view_count"("post_id_param" "uuid", "ip_address_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_post_comment"("user_id_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_post_comment"("user_id_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_post_comment"("user_id_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_achievements"("p_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_achievements"("p_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_achievements"("p_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_character_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_character_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_character_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_prediction_allowed"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_prediction_allowed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_prediction_allowed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_total_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_total_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_total_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_ticker_comments"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_ticker_comments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_ticker_comments"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_ticker_items"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_ticker_items"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_ticker_items"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_temperature_queue"("days_old" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_temperature_queue"("days_old" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_temperature_queue"("days_old" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_daily_id"("match_time" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."compute_daily_id"("match_time" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_daily_id"("match_time" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_comment_count_on_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_comment_count_on_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_comment_count_on_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."deduct_board_points"("p_user_id" "text", "p_board_slug" "text", "p_amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_board_points"("p_user_id" "text", "p_board_slug" "text", "p_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_board_points"("p_user_id" "text", "p_board_slug" "text", "p_amount" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."donate_flair_score_to_team"("p_user_id" "text", "p_flair_id" "uuid", "p_amount" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."donate_flair_score_to_team"("p_user_id" "text", "p_flair_id" "uuid", "p_amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."donate_flair_score_to_team"("p_user_id" "text", "p_flair_id" "uuid", "p_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."donate_flair_score_to_team"("p_user_id" "text", "p_flair_id" "uuid", "p_amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_temperature_update"("p_post_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_temperature_update"("p_post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_temperature_update"("p_post_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_daily_token_reset"("target_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_daily_token_reset"("target_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_daily_token_reset"("target_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."escrow_hold_gold"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."escrow_hold_gold"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."escrow_hold_gold"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."escrow_hold_gold"("p_user_id" "text", "p_order_id" "uuid", "p_amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."escrow_hold_gold"("p_user_id" "text", "p_order_id" "uuid", "p_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."escrow_hold_gold"("p_user_id" "text", "p_order_id" "uuid", "p_amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."escrow_refund_gold"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."escrow_refund_gold"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."escrow_refund_gold"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."escrow_refund_gold"("p_order_id" "uuid", "p_refund_percent" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."escrow_refund_gold"("p_order_id" "uuid", "p_refund_percent" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."escrow_refund_gold"("p_order_id" "uuid", "p_refund_percent" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."escrow_release_gold"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."escrow_release_gold"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."escrow_release_gold"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_stale_pending_predictions"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_stale_pending_predictions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_stale_pending_predictions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_league_id_by_alias"("p_alias" "text", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_league_id_by_alias"("p_alias" "text", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_league_id_by_alias"("p_alias" "text", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_level_for_points"("p_total_points" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_level_for_points"("p_total_points" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_level_for_points"("p_total_points" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_commented_posts"("p_limit" integer, "p_community_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_commented_posts"("p_limit" integer, "p_community_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_commented_posts"("p_limit" integer, "p_community_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_team_id_by_alias"("p_alias" "text", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_team_id_by_alias"("p_alias" "text", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_id_by_alias"("p_alias" "text", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_token_reset_date"("check_time" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_token_reset_date"("check_time" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_token_reset_date"("check_time" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_vote"("p_user_id" "text", "p_target_type" "text", "p_target_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_vote"("p_user_id" "text", "p_target_type" "text", "p_target_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_vote"("p_user_id" "text", "p_target_type" "text", "p_target_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."import_betman_round"("data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."import_betman_round"("data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_betman_round"("data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_battle_participants"("p_battle_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_battle_participants"("p_battle_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_battle_participants"("p_battle_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_battle_side_score"("p_side_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_battle_side_score"("p_side_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_battle_side_score"("p_side_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_comment_count_on_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_comment_count_on_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_comment_count_on_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_pending_predictions"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_pending_predictions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_pending_predictions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_post_comment_count"("post_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_post_comment_count"("post_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_post_comment_count"("post_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_post_view_count"("post_id_param" "uuid", "ip_address_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_post_view_count"("post_id_param" "uuid", "ip_address_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_post_view_count"("post_id_param" "uuid", "ip_address_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_prediction_count"("match_id_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_prediction_count"("match_id_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_prediction_count"("match_id_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_sticker_use"("p_sticker_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_sticker_use"("p_sticker_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_sticker_use"("p_sticker_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_worldcup_win"("p_candidate_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_worldcup_win"("p_candidate_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_worldcup_win"("p_candidate_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."init_user_prediction_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."init_user_prediction_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."init_user_prediction_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_bookmarked"("p_user_id" "text", "p_post_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_bookmarked"("p_user_id" "text", "p_post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_bookmarked"("p_user_id" "text", "p_post_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_content_purchased"("p_user_id" "text", "p_prediction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_content_purchased"("p_user_id" "text", "p_prediction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_content_purchased"("p_user_id" "text", "p_prediction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_moderator_or_admin"("p_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_moderator_or_admin"("p_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_moderator_or_admin"("p_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_subscription_active"("p_subscriber_id" "text", "p_expert_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_subscription_active"("p_subscriber_id" "text", "p_expert_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_subscription_active"("p_subscriber_id" "text", "p_expert_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."metaverse_award_flair_karma"("p_user_id" "text", "p_team_id" "text", "p_delta" integer, "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."metaverse_award_flair_karma"("p_user_id" "text", "p_team_id" "text", "p_delta" integer, "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."metaverse_award_flair_karma"("p_user_id" "text", "p_team_id" "text", "p_delta" integer, "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."metaverse_cleanup_empty_chat_rooms"() TO "anon";
GRANT ALL ON FUNCTION "public"."metaverse_cleanup_empty_chat_rooms"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."metaverse_cleanup_empty_chat_rooms"() TO "service_role";



GRANT ALL ON FUNCTION "public"."metaverse_create_chat_room"("p_user_id" "text", "p_plot_id" "uuid", "p_sign_text" "text", "p_cost" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."metaverse_create_chat_room"("p_user_id" "text", "p_plot_id" "uuid", "p_sign_text" "text", "p_cost" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."metaverse_create_chat_room"("p_user_id" "text", "p_plot_id" "uuid", "p_sign_text" "text", "p_cost" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."metaverse_equip_avatar"("p_user_id" "text", "p_avatar_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."metaverse_equip_avatar"("p_user_id" "text", "p_avatar_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."metaverse_equip_avatar"("p_user_id" "text", "p_avatar_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."metaverse_purchase_avatar"("p_user_id" "text", "p_avatar_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."metaverse_purchase_avatar"("p_user_id" "text", "p_avatar_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."metaverse_purchase_avatar"("p_user_id" "text", "p_avatar_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."metaverse_spend_activity_points"("p_user_id" "text", "p_amount" integer, "p_purpose" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."metaverse_spend_activity_points"("p_user_id" "text", "p_amount" integer, "p_purpose" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."metaverse_spend_activity_points"("p_user_id" "text", "p_amount" integer, "p_purpose" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."news_reservoir_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."news_reservoir_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."news_reservoir_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_role_self_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_role_self_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_role_self_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_temperature_queue"("batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."process_temperature_queue"("batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_temperature_queue"("batch_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."purchase_noun_title"("p_user_id" "text", "p_noun_title_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."purchase_noun_title"("p_user_id" "text", "p_noun_title_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."purchase_noun_title"("p_user_id" "text", "p_noun_title_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."purchase_sticker"("p_user_id" "text", "p_sticker_id" "uuid", "p_board_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."purchase_sticker"("p_user_id" "text", "p_sticker_id" "uuid", "p_board_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."purchase_sticker"("p_user_id" "text", "p_sticker_id" "uuid", "p_board_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_all_user_temperatures"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_all_user_temperatures"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_all_user_temperatures"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_comment_vote_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_comment_vote_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_comment_vote_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_post_vote_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_post_vote_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_post_vote_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_user_sport_stats"("p_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_user_sport_stats"("p_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_user_sport_stats"("p_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_all_comment_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_all_comment_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_all_comment_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_post_comment_count"("post_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_post_comment_count"("post_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_post_comment_count"("post_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_unique_view"("p_post_id" "uuid", "p_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_unique_view"("p_post_id" "uuid", "p_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_unique_view"("p_post_id" "uuid", "p_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_hot_feed"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_hot_feed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_hot_feed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refund_tokens"("p_user_id" "text", "p_amount" integer, "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."refund_tokens"("p_user_id" "text", "p_amount" integer, "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refund_tokens"("p_user_id" "text", "p_amount" integer, "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_expired_temperatures"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_expired_temperatures"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_expired_temperatures"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_expired_temperatures"("days_old" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."reset_expired_temperatures"("days_old" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_expired_temperatures"("days_old" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_user_daily_tokens"("target_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_user_daily_tokens"("target_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_user_daily_tokens"("target_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reward_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text", "p_transaction_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reward_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text", "p_transaction_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reward_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text", "p_transaction_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_comment_path"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_comment_path"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_comment_path"() TO "service_role";



GRANT ALL ON FUNCTION "public"."settle_betman_game"("p_game_id" "uuid", "p_home_score" integer, "p_away_score" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."settle_betman_game"("p_game_id" "uuid", "p_home_score" integer, "p_away_score" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."settle_betman_game"("p_game_id" "uuid", "p_home_score" integer, "p_away_score" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."settle_predictions_by_round"("p_gm_ts" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."settle_predictions_by_round"("p_gm_ts" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."settle_predictions_by_round"("p_gm_ts" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."settle_round"("p_gm_ts" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."settle_round"("p_gm_ts" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."settle_round"("p_gm_ts" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."spend_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."spend_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spend_gold"("p_user_id" "text", "p_amount" integer, "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."spend_tokens"("p_user_id" "text", "p_amount" integer, "p_transaction_type" "text", "p_description" "text", "p_related_prediction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."spend_tokens"("p_user_id" "text", "p_amount" integer, "p_transaction_type" "text", "p_description" "text", "p_related_prediction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spend_tokens"("p_user_id" "text", "p_amount" integer, "p_transaction_type" "text", "p_description" "text", "p_related_prediction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_category_from_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_category_from_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_category_from_slug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_commission_used_slots"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_commission_used_slots"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_commission_used_slots"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_live_room_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_live_room_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_live_room_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_post_vote_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_post_vote_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_post_vote_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_stadium_contribution"("p_user_id" "text", "p_team_id" "text", "p_new_points" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."sync_stadium_contribution"("p_user_id" "text", "p_team_id" "text", "p_new_points" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_stadium_contribution"("p_user_id" "text", "p_team_id" "text", "p_new_points" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_auto_assign_daily_round_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_auto_assign_daily_round_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_auto_assign_daily_round_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_comments_flair_score"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_comments_flair_score"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_comments_flair_score"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_posts_flair_score"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_posts_flair_score"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_posts_flair_score"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_update_daily_round_game_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_update_daily_round_game_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_update_daily_round_game_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_votes_flair_score"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_votes_flair_score"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_votes_flair_score"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_on_comment_for_temp"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_on_comment_for_temp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_on_comment_for_temp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_on_post_created"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_on_post_created"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_on_post_created"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_on_vote_for_temp"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_on_vote_for_temp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_on_vote_for_temp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_user_temp_on_comment"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_user_temp_on_comment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_user_temp_on_comment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_user_temp_on_post"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_user_temp_on_post"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_user_temp_on_post"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_user_temp_on_vote"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_user_temp_on_vote"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_user_temp_on_vote"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trip_update_recommendation_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."trip_update_recommendation_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trip_update_recommendation_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trip_update_save_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."trip_update_save_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trip_update_save_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trip_update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."trip_update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trip_update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_active_post_temperatures"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_active_post_temperatures"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_active_post_temperatures"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_active_rounds"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_active_rounds"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_active_rounds"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_comment_cooldown"("user_id_param" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_comment_cooldown"("user_id_param" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_comment_cooldown"("user_id_param" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_commission_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_commission_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_commission_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_match_prediction_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_match_prediction_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_match_prediction_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_post_comment_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_post_comment_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_post_comment_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_post_last_comment_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_post_last_comment_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_post_last_comment_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_stadium_fan_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_stadium_fan_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_stadium_fan_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_temp_after_comment"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_temp_after_comment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_temp_after_comment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_temp_after_vote"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_temp_after_vote"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_temp_after_vote"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_temperature_score"("p_post_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_temperature_score"("p_post_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_temperature_score"("p_post_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_content_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_content_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_content_counts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_stats_on_settlement"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_stats_on_settlement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_stats_on_settlement"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_temperature"("p_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_temperature"("p_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_temperature"("p_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_vote_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_vote_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_vote_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vote_sticker"("p_sticker_id" "uuid", "p_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."vote_sticker"("p_sticker_id" "uuid", "p_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vote_sticker"("p_sticker_id" "uuid", "p_user_id" "text") TO "service_role";



GRANT ALL ON TABLE "public"."adj_titles" TO "anon";
GRANT ALL ON TABLE "public"."adj_titles" TO "authenticated";
GRANT ALL ON TABLE "public"."adj_titles" TO "service_role";



GRANT ALL ON TABLE "public"."admin_activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_notes" TO "anon";
GRANT ALL ON TABLE "public"."admin_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notes" TO "service_role";



GRANT ALL ON TABLE "public"."agent_actions" TO "anon";
GRANT ALL ON TABLE "public"."agent_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_actions" TO "service_role";



GRANT ALL ON TABLE "public"."agent_personas" TO "anon";
GRANT ALL ON TABLE "public"."agent_personas" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_personas" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runs" TO "anon";
GRANT ALL ON TABLE "public"."agent_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."announcement_banners" TO "anon";
GRANT ALL ON TABLE "public"."announcement_banners" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_banners" TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."banners" TO "anon";
GRANT ALL ON TABLE "public"."banners" TO "authenticated";
GRANT ALL ON TABLE "public"."banners" TO "service_role";



GRANT ALL ON TABLE "public"."battle_comments" TO "anon";
GRANT ALL ON TABLE "public"."battle_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."battle_comments" TO "service_role";



GRANT ALL ON TABLE "public"."battle_participants" TO "anon";
GRANT ALL ON TABLE "public"."battle_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."battle_participants" TO "service_role";



GRANT ALL ON TABLE "public"."battle_rooms" TO "anon";
GRANT ALL ON TABLE "public"."battle_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."battle_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."battle_sides" TO "anon";
GRANT ALL ON TABLE "public"."battle_sides" TO "authenticated";
GRANT ALL ON TABLE "public"."battle_sides" TO "service_role";



GRANT ALL ON TABLE "public"."betman_daily_rounds" TO "anon";
GRANT ALL ON TABLE "public"."betman_daily_rounds" TO "authenticated";
GRANT ALL ON TABLE "public"."betman_daily_rounds" TO "service_role";



GRANT ALL ON TABLE "public"."betman_games" TO "anon";
GRANT ALL ON TABLE "public"."betman_games" TO "authenticated";
GRANT ALL ON TABLE "public"."betman_games" TO "service_role";



GRANT ALL ON TABLE "public"."betman_predictions" TO "anon";
GRANT ALL ON TABLE "public"."betman_predictions" TO "authenticated";
GRANT ALL ON TABLE "public"."betman_predictions" TO "service_role";



GRANT ALL ON TABLE "public"."betman_rounds" TO "anon";
GRANT ALL ON TABLE "public"."betman_rounds" TO "authenticated";
GRANT ALL ON TABLE "public"."betman_rounds" TO "service_role";



GRANT ALL ON TABLE "public"."betman_sync_state" TO "anon";
GRANT ALL ON TABLE "public"."betman_sync_state" TO "authenticated";
GRANT ALL ON TABLE "public"."betman_sync_state" TO "service_role";



GRANT ALL ON TABLE "public"."betman_unknown_games" TO "anon";
GRANT ALL ON TABLE "public"."betman_unknown_games" TO "authenticated";
GRANT ALL ON TABLE "public"."betman_unknown_games" TO "service_role";



GRANT ALL ON TABLE "public"."betman_user_sport_stats" TO "anon";
GRANT ALL ON TABLE "public"."betman_user_sport_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."betman_user_sport_stats" TO "service_role";



GRANT ALL ON TABLE "public"."bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."comment_cooldowns" TO "anon";
GRANT ALL ON TABLE "public"."comment_cooldowns" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_cooldowns" TO "service_role";



GRANT ALL ON TABLE "public"."comment_votes" TO "anon";
GRANT ALL ON TABLE "public"."comment_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."comment_votes" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."commission_messages" TO "anon";
GRANT ALL ON TABLE "public"."commission_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_messages" TO "service_role";



GRANT ALL ON TABLE "public"."commission_milestones" TO "anon";
GRANT ALL ON TABLE "public"."commission_milestones" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_milestones" TO "service_role";



GRANT ALL ON TABLE "public"."commission_orders" TO "anon";
GRANT ALL ON TABLE "public"."commission_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_orders" TO "service_role";



GRANT ALL ON TABLE "public"."commission_packages" TO "anon";
GRANT ALL ON TABLE "public"."commission_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_packages" TO "service_role";



GRANT ALL ON TABLE "public"."community_follows" TO "anon";
GRANT ALL ON TABLE "public"."community_follows" TO "authenticated";
GRANT ALL ON TABLE "public"."community_follows" TO "service_role";



GRANT ALL ON TABLE "public"."content_flags" TO "anon";
GRANT ALL ON TABLE "public"."content_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."content_flags" TO "service_role";



GRANT ALL ON TABLE "public"."content_reports" TO "anon";
GRANT ALL ON TABLE "public"."content_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."content_reports" TO "service_role";



GRANT ALL ON TABLE "public"."crawler_run_log" TO "anon";
GRANT ALL ON TABLE "public"."crawler_run_log" TO "authenticated";
GRANT ALL ON TABLE "public"."crawler_run_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."crawler_run_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."crawler_run_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."crawler_run_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cron_run_log" TO "anon";
GRANT ALL ON TABLE "public"."cron_run_log" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_run_log" TO "service_role";



GRANT ALL ON TABLE "public"."daily_point_caps" TO "anon";
GRANT ALL ON TABLE "public"."daily_point_caps" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_point_caps" TO "service_role";



GRANT ALL ON TABLE "public"."direct_messages" TO "anon";
GRANT ALL ON TABLE "public"."direct_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."direct_messages" TO "service_role";



GRANT ALL ON TABLE "public"."disputes" TO "anon";
GRANT ALL ON TABLE "public"."disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."disputes" TO "service_role";



GRANT ALL ON TABLE "public"."draft_participants" TO "anon";
GRANT ALL ON TABLE "public"."draft_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_participants" TO "service_role";



GRANT ALL ON SEQUENCE "public"."draft_participants_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."draft_participants_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."draft_participants_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."draft_picks" TO "anon";
GRANT ALL ON TABLE "public"."draft_picks" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_picks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."draft_picks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."draft_picks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."draft_picks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."draft_results" TO "anon";
GRANT ALL ON TABLE "public"."draft_results" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_results" TO "service_role";



GRANT ALL ON SEQUENCE "public"."draft_results_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."draft_results_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."draft_results_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."draft_rooms" TO "anon";
GRANT ALL ON TABLE "public"."draft_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_rooms" TO "service_role";



GRANT ALL ON SEQUENCE "public"."draft_rooms_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."draft_rooms_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."draft_rooms_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."event_groups" TO "anon";
GRANT ALL ON TABLE "public"."event_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."event_groups" TO "service_role";



GRANT ALL ON TABLE "public"."event_leaderboard_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."event_leaderboard_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."event_leaderboard_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."event_registrations" TO "anon";
GRANT ALL ON TABLE "public"."event_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."event_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."faqs" TO "anon";
GRANT ALL ON TABLE "public"."faqs" TO "authenticated";
GRANT ALL ON TABLE "public"."faqs" TO "service_role";



GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON TABLE "public"."feature_test_logs" TO "anon";
GRANT ALL ON TABLE "public"."feature_test_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_test_logs" TO "service_role";



GRANT ALL ON TABLE "public"."flair_titles" TO "anon";
GRANT ALL ON TABLE "public"."flair_titles" TO "authenticated";
GRANT ALL ON TABLE "public"."flair_titles" TO "service_role";



GRANT ALL ON TABLE "public"."gold_transactions" TO "anon";
GRANT ALL ON TABLE "public"."gold_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."gold_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."hot_feed" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."hot_feed" TO "authenticated";
GRANT ALL ON TABLE "public"."hot_feed" TO "service_role";



GRANT ALL ON TABLE "public"."inquiries" TO "anon";
GRANT ALL ON TABLE "public"."inquiries" TO "authenticated";
GRANT ALL ON TABLE "public"."inquiries" TO "service_role";



GRANT ALL ON TABLE "public"."league_aliases" TO "anon";
GRANT ALL ON TABLE "public"."league_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."league_aliases" TO "service_role";



GRANT ALL ON TABLE "public"."leagues" TO "anon";
GRANT ALL ON TABLE "public"."leagues" TO "authenticated";
GRANT ALL ON TABLE "public"."leagues" TO "service_role";



GRANT ALL ON TABLE "public"."live_rooms" TO "anon";
GRANT ALL ON TABLE "public"."live_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."live_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."match_odds" TO "anon";
GRANT ALL ON TABLE "public"."match_odds" TO "authenticated";
GRANT ALL ON TABLE "public"."match_odds" TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



GRANT ALL ON TABLE "public"."metaverse_avatar_inventory" TO "anon";
GRANT ALL ON TABLE "public"."metaverse_avatar_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."metaverse_avatar_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."metaverse_avatar_items" TO "anon";
GRANT ALL ON TABLE "public"."metaverse_avatar_items" TO "authenticated";
GRANT ALL ON TABLE "public"."metaverse_avatar_items" TO "service_role";



GRANT ALL ON TABLE "public"."metaverse_chat_rooms" TO "anon";
GRANT ALL ON TABLE "public"."metaverse_chat_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."metaverse_chat_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."metaverse_fandom_memberships" TO "anon";
GRANT ALL ON TABLE "public"."metaverse_fandom_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."metaverse_fandom_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."metaverse_user_activity_balance" TO "anon";
GRANT ALL ON TABLE "public"."metaverse_user_activity_balance" TO "authenticated";
GRANT ALL ON TABLE "public"."metaverse_user_activity_balance" TO "service_role";



GRANT ALL ON TABLE "public"."metaverse_user_reports" TO "anon";
GRANT ALL ON TABLE "public"."metaverse_user_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."metaverse_user_reports" TO "service_role";



GRANT ALL ON TABLE "public"."metaverse_world_plots" TO "anon";
GRANT ALL ON TABLE "public"."metaverse_world_plots" TO "authenticated";
GRANT ALL ON TABLE "public"."metaverse_world_plots" TO "service_role";



GRANT ALL ON TABLE "public"."movie_quiz_results" TO "anon";
GRANT ALL ON TABLE "public"."movie_quiz_results" TO "authenticated";
GRANT ALL ON TABLE "public"."movie_quiz_results" TO "service_role";



GRANT ALL ON TABLE "public"."movie_quizzes" TO "anon";
GRANT ALL ON TABLE "public"."movie_quizzes" TO "authenticated";
GRANT ALL ON TABLE "public"."movie_quizzes" TO "service_role";



GRANT ALL ON TABLE "public"."news_alias_dictionary" TO "anon";
GRANT ALL ON TABLE "public"."news_alias_dictionary" TO "authenticated";
GRANT ALL ON TABLE "public"."news_alias_dictionary" TO "service_role";



GRANT ALL ON TABLE "public"."news_reservoir" TO "anon";
GRANT ALL ON TABLE "public"."news_reservoir" TO "authenticated";
GRANT ALL ON TABLE "public"."news_reservoir" TO "service_role";



GRANT ALL ON TABLE "public"."news_reservoir_queue_lengths" TO "anon";
GRANT ALL ON TABLE "public"."news_reservoir_queue_lengths" TO "authenticated";
GRANT ALL ON TABLE "public"."news_reservoir_queue_lengths" TO "service_role";



GRANT ALL ON TABLE "public"."news_ticker_items" TO "anon";
GRANT ALL ON TABLE "public"."news_ticker_items" TO "authenticated";
GRANT ALL ON TABLE "public"."news_ticker_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."news_ticker_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."news_ticker_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."news_ticker_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."noun_titles" TO "anon";
GRANT ALL ON TABLE "public"."noun_titles" TO "authenticated";
GRANT ALL ON TABLE "public"."noun_titles" TO "service_role";



GRANT ALL ON TABLE "public"."pending_refunds" TO "anon";
GRANT ALL ON TABLE "public"."pending_refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_refunds" TO "service_role";



GRANT ALL ON TABLE "public"."pending_seller_rewards" TO "anon";
GRANT ALL ON TABLE "public"."pending_seller_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_seller_rewards" TO "service_role";



GRANT ALL ON TABLE "public"."pixel_art_items" TO "anon";
GRANT ALL ON TABLE "public"."pixel_art_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pixel_art_items" TO "service_role";



GRANT ALL ON TABLE "public"."point_transactions" TO "anon";
GRANT ALL ON TABLE "public"."point_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."point_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."post_flairs" TO "anon";
GRANT ALL ON TABLE "public"."post_flairs" TO "authenticated";
GRANT ALL ON TABLE "public"."post_flairs" TO "service_role";



GRANT ALL ON TABLE "public"."post_views" TO "anon";
GRANT ALL ON TABLE "public"."post_views" TO "authenticated";
GRANT ALL ON TABLE "public"."post_views" TO "service_role";



GRANT ALL ON TABLE "public"."post_votes" TO "anon";
GRANT ALL ON TABLE "public"."post_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."post_votes" TO "service_role";



GRANT ALL ON TABLE "public"."prediction_activities" TO "anon";
GRANT ALL ON TABLE "public"."prediction_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."prediction_activities" TO "service_role";



GRANT ALL ON TABLE "public"."prediction_purchases" TO "anon";
GRANT ALL ON TABLE "public"."prediction_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."prediction_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."prediction_seasons" TO "anon";
GRANT ALL ON TABLE "public"."prediction_seasons" TO "authenticated";
GRANT ALL ON TABLE "public"."prediction_seasons" TO "service_role";



GRANT ALL ON TABLE "public"."prediction_slips" TO "anon";
GRANT ALL ON TABLE "public"."prediction_slips" TO "authenticated";
GRANT ALL ON TABLE "public"."prediction_slips" TO "service_role";



GRANT ALL ON TABLE "public"."predictions" TO "anon";
GRANT ALL ON TABLE "public"."predictions" TO "authenticated";
GRANT ALL ON TABLE "public"."predictions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."purchased_content" TO "anon";
GRANT ALL ON TABLE "public"."purchased_content" TO "authenticated";
GRANT ALL ON TABLE "public"."purchased_content" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."scoring_config" TO "anon";
GRANT ALL ON TABLE "public"."scoring_config" TO "authenticated";
GRANT ALL ON TABLE "public"."scoring_config" TO "service_role";



GRANT ALL ON TABLE "public"."seeded_reddit_posts" TO "anon";
GRANT ALL ON TABLE "public"."seeded_reddit_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."seeded_reddit_posts" TO "service_role";



GRANT ALL ON TABLE "public"."site_settings" TO "anon";
GRANT ALL ON TABLE "public"."site_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."site_settings" TO "service_role";



GRANT ALL ON TABLE "public"."stadium_contributions" TO "anon";
GRANT ALL ON TABLE "public"."stadium_contributions" TO "authenticated";
GRANT ALL ON TABLE "public"."stadium_contributions" TO "service_role";



GRANT ALL ON TABLE "public"."stadium_investments" TO "anon";
GRANT ALL ON TABLE "public"."stadium_investments" TO "authenticated";
GRANT ALL ON TABLE "public"."stadium_investments" TO "service_role";



GRANT ALL ON TABLE "public"."stadium_level_thresholds" TO "anon";
GRANT ALL ON TABLE "public"."stadium_level_thresholds" TO "authenticated";
GRANT ALL ON TABLE "public"."stadium_level_thresholds" TO "service_role";



GRANT ALL ON TABLE "public"."standings_cache" TO "anon";
GRANT ALL ON TABLE "public"."standings_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."standings_cache" TO "service_role";



GRANT ALL ON TABLE "public"."sticker_packs" TO "anon";
GRANT ALL ON TABLE "public"."sticker_packs" TO "authenticated";
GRANT ALL ON TABLE "public"."sticker_packs" TO "service_role";



GRANT ALL ON TABLE "public"."sticker_votes" TO "anon";
GRANT ALL ON TABLE "public"."sticker_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."sticker_votes" TO "service_role";



GRANT ALL ON TABLE "public"."stickers" TO "anon";
GRANT ALL ON TABLE "public"."stickers" TO "authenticated";
GRANT ALL ON TABLE "public"."stickers" TO "service_role";



GRANT ALL ON TABLE "public"."team_aliases" TO "anon";
GRANT ALL ON TABLE "public"."team_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."team_aliases" TO "service_role";



GRANT ALL ON TABLE "public"."team_map_pins" TO "anon";
GRANT ALL ON TABLE "public"."team_map_pins" TO "authenticated";
GRANT ALL ON TABLE "public"."team_map_pins" TO "service_role";



GRANT ALL ON TABLE "public"."team_stadiums" TO "anon";
GRANT ALL ON TABLE "public"."team_stadiums" TO "authenticated";
GRANT ALL ON TABLE "public"."team_stadiums" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."temperature_update_queue" TO "anon";
GRANT ALL ON TABLE "public"."temperature_update_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."temperature_update_queue" TO "service_role";



GRANT ALL ON SEQUENCE "public"."temperature_update_queue_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."temperature_update_queue_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."temperature_update_queue_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ticker_comments" TO "anon";
GRANT ALL ON TABLE "public"."ticker_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."ticker_comments" TO "service_role";



GRANT ALL ON TABLE "public"."token_transactions" TO "anon";
GRANT ALL ON TABLE "public"."token_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."token_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."user_adj_titles" TO "anon";
GRANT ALL ON TABLE "public"."user_adj_titles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_adj_titles" TO "service_role";



GRANT ALL ON TABLE "public"."user_blocks" TO "anon";
GRANT ALL ON TABLE "public"."user_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."user_board_points" TO "anon";
GRANT ALL ON TABLE "public"."user_board_points" TO "authenticated";
GRANT ALL ON TABLE "public"."user_board_points" TO "service_role";



GRANT ALL ON TABLE "public"."user_cards" TO "anon";
GRANT ALL ON TABLE "public"."user_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."user_cards" TO "service_role";



GRANT ALL ON TABLE "public"."user_equipped_titles" TO "anon";
GRANT ALL ON TABLE "public"."user_equipped_titles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_equipped_titles" TO "service_role";



GRANT ALL ON TABLE "public"."user_flair_scores" TO "anon";
GRANT ALL ON TABLE "public"."user_flair_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."user_flair_scores" TO "service_role";



GRANT ALL ON TABLE "public"."user_follows" TO "anon";
GRANT ALL ON TABLE "public"."user_follows" TO "authenticated";
GRANT ALL ON TABLE "public"."user_follows" TO "service_role";



GRANT ALL ON TABLE "public"."user_gold" TO "anon";
GRANT ALL ON TABLE "public"."user_gold" TO "authenticated";
GRANT ALL ON TABLE "public"."user_gold" TO "service_role";



GRANT ALL ON TABLE "public"."user_noun_titles" TO "anon";
GRANT ALL ON TABLE "public"."user_noun_titles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_noun_titles" TO "service_role";



GRANT ALL ON TABLE "public"."user_pixel_arts" TO "anon";
GRANT ALL ON TABLE "public"."user_pixel_arts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_pixel_arts" TO "service_role";



GRANT ALL ON TABLE "public"."user_prediction_stats" TO "anon";
GRANT ALL ON TABLE "public"."user_prediction_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."user_prediction_stats" TO "service_role";



GRANT ALL ON TABLE "public"."user_sanctions" TO "anon";
GRANT ALL ON TABLE "public"."user_sanctions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sanctions" TO "service_role";



GRANT ALL ON TABLE "public"."user_season_stats" TO "anon";
GRANT ALL ON TABLE "public"."user_season_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."user_season_stats" TO "service_role";



GRANT ALL ON TABLE "public"."user_stickers" TO "anon";
GRANT ALL ON TABLE "public"."user_stickers" TO "authenticated";
GRANT ALL ON TABLE "public"."user_stickers" TO "service_role";



GRANT ALL ON TABLE "public"."user_suspensions" TO "anon";
GRANT ALL ON TABLE "public"."user_suspensions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_suspensions" TO "service_role";



GRANT ALL ON TABLE "public"."user_tokens" TO "anon";
GRANT ALL ON TABLE "public"."user_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."user_unlocked_titles" TO "anon";
GRANT ALL ON TABLE "public"."user_unlocked_titles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_unlocked_titles" TO "service_role";



GRANT ALL ON TABLE "public"."virtual_casting_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."virtual_casting_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."virtual_casting_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."virtual_casting_votes" TO "anon";
GRANT ALL ON TABLE "public"."virtual_casting_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."virtual_casting_votes" TO "service_role";



GRANT ALL ON TABLE "public"."virtual_castings" TO "anon";
GRANT ALL ON TABLE "public"."virtual_castings" TO "authenticated";
GRANT ALL ON TABLE "public"."virtual_castings" TO "service_role";



GRANT ALL ON TABLE "public"."votes" TO "anon";
GRANT ALL ON TABLE "public"."votes" TO "authenticated";
GRANT ALL ON TABLE "public"."votes" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_analytics_reports" TO "anon";
GRANT ALL ON TABLE "public"."weekly_analytics_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_analytics_reports" TO "service_role";



GRANT ALL ON TABLE "public"."worldcup_candidates" TO "anon";
GRANT ALL ON TABLE "public"."worldcup_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."worldcup_candidates" TO "service_role";



GRANT ALL ON TABLE "public"."worldcup_sessions" TO "anon";
GRANT ALL ON TABLE "public"."worldcup_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."worldcup_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."worldcup_votes" TO "anon";
GRANT ALL ON TABLE "public"."worldcup_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."worldcup_votes" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







