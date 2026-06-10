-- ============================================================
-- 072: 게시물 온도 시스템 완전 구현
--
-- 공식 V2: Temperature = clamp(0, 100, (E + R) × D + B - P)
--   E = 12×ln(1+max(votes,0)) + 10×ln(1+comments) + 2×ln(1+views)
--   R = 댓글 최신성 보너스 (최대 8, 2시간→8시간에 0)
--   D = 2^(-age_hours / 24)  [반감기 24시간]
--   B = 3점 신규 부스트 (30분 최대→2시간에 0)
--   P = 비추천 패널티: votes<0 → 5×ln(1+|votes|)
-- ============================================================

-- 1. last_comment_at 컬럼 추가
ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_comment_at timestamptz;

-- 1b. 기존 데이터 backfill
UPDATE posts p SET last_comment_at = sub.latest
FROM (
  SELECT post_id, MAX(created_at) AS latest
  FROM comments
  WHERE deleted_at IS NULL
  GROUP BY post_id
) sub
WHERE p.id = sub.post_id AND p.last_comment_at IS NULL;

-- 1c. 인덱스
CREATE INDEX IF NOT EXISTS idx_posts_last_comment_at
  ON posts(last_comment_at DESC NULLS LAST) WHERE deleted_at IS NULL;

-- ============================================================
-- 2. last_comment_at 자동 갱신 트리거
-- ============================================================

CREATE OR REPLACE FUNCTION update_post_last_comment_at()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_last_comment_at ON comments;
CREATE TRIGGER trg_update_last_comment_at
AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION update_post_last_comment_at();

DROP TRIGGER IF EXISTS trg_update_last_comment_at_soft_delete ON comments;
CREATE TRIGGER trg_update_last_comment_at_soft_delete
AFTER UPDATE OF deleted_at ON comments
FOR EACH ROW EXECUTE FUNCTION update_post_last_comment_at();

-- ============================================================
-- 3. 핵심: 온도 계산 함수
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_post_temperature(p_post_id uuid)
RETURNS numeric(5,2)
LANGUAGE plpgsql STABLE
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

-- ============================================================
-- 4. 단일 게시물 온도 업데이트
-- ============================================================

CREATE OR REPLACE FUNCTION update_temperature_score(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE posts
  SET temperature = calculate_post_temperature(p_post_id)
  WHERE id = p_post_id;
END;
$$;

-- ============================================================
-- 5. 배치 업데이트 (7일 이내 게시물 전체)
-- ============================================================

CREATE OR REPLACE FUNCTION update_active_post_temperatures()
RETURNS int
LANGUAGE plpgsql
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

-- ============================================================
-- 6. 이벤트 트리거: 투표 시 온도 재계산
-- ============================================================

CREATE OR REPLACE FUNCTION update_temp_after_vote()
RETURNS TRIGGER AS $$
DECLARE
  target_post_id uuid;
BEGIN
  target_post_id := COALESCE(NEW.post_id, OLD.post_id);
  PERFORM update_temperature_score(target_post_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_temp_after_vote ON post_votes;
CREATE TRIGGER trg_update_temp_after_vote
AFTER INSERT OR UPDATE OR DELETE ON post_votes
FOR EACH ROW EXECUTE FUNCTION update_temp_after_vote();

-- ============================================================
-- 7. 이벤트 트리거: 댓글 시 온도 재계산
-- ============================================================

CREATE OR REPLACE FUNCTION update_temp_after_comment()
RETURNS TRIGGER AS $$
DECLARE
  target_post_id uuid;
BEGIN
  target_post_id := COALESCE(NEW.post_id, OLD.post_id);
  PERFORM update_temperature_score(target_post_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_temp_after_comment ON comments;
CREATE TRIGGER trg_update_temp_after_comment
AFTER INSERT OR DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION update_temp_after_comment();

DROP TRIGGER IF EXISTS trg_update_temp_after_comment_soft_delete ON comments;
CREATE TRIGGER trg_update_temp_after_comment_soft_delete
AFTER UPDATE OF deleted_at ON comments
FOR EACH ROW EXECUTE FUNCTION update_temp_after_comment();

-- ============================================================
-- 8. 레거시 스텁 (기존 RPC 호출 에러 방지)
-- ============================================================

-- update_user_temperature: 투표 route에서 호출하지만 미구현 → no-op
CREATE OR REPLACE FUNCTION update_user_temperature(p_user_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- 유저 온도 집계는 추후 구현
  RETURN;
END;
$$;

-- enqueue_temperature_update: 타입에 참조됨 → 직접 업데이트로 대체
CREATE OR REPLACE FUNCTION enqueue_temperature_update(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM update_temperature_score(p_post_id);
END;
$$;

-- process_temperature_queue: 타입에 참조됨
CREATE OR REPLACE FUNCTION process_temperature_queue(batch_size int DEFAULT 50)
RETURNS int
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN update_active_post_temperatures();
END;
$$;

-- cleanup_temperature_queue: 타입에 참조됨
CREATE OR REPLACE FUNCTION cleanup_temperature_queue(days_old int DEFAULT 7)
RETURNS int
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 0;
END;
$$;

-- ============================================================
-- 9. 권한 부여
-- ============================================================

GRANT EXECUTE ON FUNCTION calculate_post_temperature(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION update_temperature_score(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION update_active_post_temperatures() TO service_role;
GRANT EXECUTE ON FUNCTION update_user_temperature(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION enqueue_temperature_update(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION process_temperature_queue(int) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_temperature_queue(int) TO service_role;

-- ============================================================
-- 10. pg_cron (5분마다 시간 감쇠 반영)
-- Supabase Pro+ 필요. 불가 시 Vercel Cron 대안 사용.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'update-post-temperatures',
      '*/5 * * * *',
      'SELECT update_active_post_temperatures()'
    );
    RAISE NOTICE 'pg_cron scheduled: update-post-temperatures every 5 minutes';
  ELSE
    RAISE NOTICE 'pg_cron not available. Use Vercel Cron as alternative.';
  END IF;
END $$;

-- ============================================================
-- 11. 기존 게시물 backfill
-- ============================================================

SELECT update_active_post_temperatures();
