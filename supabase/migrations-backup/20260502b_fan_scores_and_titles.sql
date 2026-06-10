-- ============================================
-- 팬 정체성 시스템 — flair 활동 점수 + 호칭 잠금 해제
--
-- 점수 룰 (B):
--   글 작성  = 10점
--   댓글 작성 = 1점
--   받은 추천(up) = 1점 (글 작성자에게 그 글의 flair 점수)
--
-- 점수 모델:
--   score_total   — 평생 누적 (호칭 잠금 해제 기준, 절대 안 줄어듦)
--   score_balance — 기부 가능 잔액 (Phase C 에서 stadium 기부 시 차감)
--
-- 임계값 (아스날, 5x 비율):
--   2,000  → 구너
--   10,000 → 앙리
--   50,000 → 벵거
--
-- backfill 안 함 — 이 마이그 적용 후 새 글/댓글/추천부터 카운트.
-- 기존 게시글의 flair 활동은 점수에 반영되지 않음 (rollout 안전).
-- ============================================

-- 1. post_flairs 에 team_id 매핑 (text — team_map_pins.team_id 와 동일 타입)
ALTER TABLE post_flairs
  ADD COLUMN IF NOT EXISTS team_id text REFERENCES team_map_pins(team_id);

-- EPL 6개 클럽 매핑 (team_map_pins 에 있는 것만)
UPDATE post_flairs SET team_id = 'epl_arsenal'    WHERE community_slug='football' AND name='아스날';
UPDATE post_flairs SET team_id = 'epl_manutd'     WHERE community_slug='football' AND name='맨유';
UPDATE post_flairs SET team_id = 'epl_mancity'    WHERE community_slug='football' AND name='맨시티';
UPDATE post_flairs SET team_id = 'epl_liverpool'  WHERE community_slug='football' AND name='리버풀';
UPDATE post_flairs SET team_id = 'epl_chelsea'    WHERE community_slug='football' AND name='첼시';
UPDATE post_flairs SET team_id = 'epl_tottenham'  WHERE community_slug='football' AND name='토트넘';
-- 라리가/분데스/세리에/리게앙 클럽은 team_map_pins 에 없어서 NULL 유지
-- 추후 stadium 시스템 확장 시 추가 가능

-- 2. 사용자별 flair 점수
CREATE TABLE IF NOT EXISTS user_flair_scores (
  user_id       text  NOT NULL,
  flair_id      uuid  NOT NULL REFERENCES post_flairs(id) ON DELETE CASCADE,
  score_total   int   NOT NULL DEFAULT 0,    -- 평생 누적 (호칭 임계용)
  score_balance int   NOT NULL DEFAULT 0,    -- 기부 가능 잔액
  last_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, flair_id)
);
CREATE INDEX IF NOT EXISTS idx_ufs_user_total
  ON user_flair_scores (user_id, score_total DESC);
CREATE INDEX IF NOT EXISTS idx_ufs_flair_top
  ON user_flair_scores (flair_id, score_total DESC);

ALTER TABLE user_flair_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Flair scores are viewable by everyone"
  ON user_flair_scores FOR SELECT USING (true);

-- 3. 호칭 정의 — flair 별 (점수 임계값으로 잠금 해제)
CREATE TABLE IF NOT EXISTS flair_titles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flair_id    uuid NOT NULL REFERENCES post_flairs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  threshold   int  NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flair_id, name)
);
CREATE INDEX IF NOT EXISTS idx_flair_titles_flair
  ON flair_titles (flair_id, threshold ASC);

ALTER TABLE flair_titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Flair titles are viewable by everyone"
  ON flair_titles FOR SELECT USING (true);

-- 4. 사용자가 잠금 해제한 호칭
CREATE TABLE IF NOT EXISTS user_unlocked_titles (
  user_id      text  NOT NULL,
  title_id     uuid  NOT NULL REFERENCES flair_titles(id) ON DELETE CASCADE,
  unlocked_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, title_id)
);
CREATE INDEX IF NOT EXISTS idx_uut_user
  ON user_unlocked_titles (user_id, unlocked_at DESC);

ALTER TABLE user_unlocked_titles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Unlocked titles are viewable by everyone"
  ON user_unlocked_titles FOR SELECT USING (true);

-- 5. 사용자가 표시할 호칭 선택 (NULL 이면 미표시)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_title_id uuid REFERENCES flair_titles(id) ON DELETE SET NULL;

-- 6. 점수 갱신 + 자동 unlock 헬퍼 함수
CREATE OR REPLACE FUNCTION apply_flair_score(
  p_user_id  text,
  p_flair_id uuid,
  p_delta    int
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 7. 트리거: posts INSERT (글 작성 = +10)
CREATE OR REPLACE FUNCTION trg_posts_flair_score() RETURNS trigger
LANGUAGE plpgsql AS $$
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

DROP TRIGGER IF EXISTS posts_flair_score ON posts;
CREATE TRIGGER posts_flair_score
  AFTER INSERT OR UPDATE OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION trg_posts_flair_score();

-- 8. 트리거: comments INSERT/DELETE (댓글 작성 = +1, 댓글이 달린 글의 flair 에)
CREATE OR REPLACE FUNCTION trg_comments_flair_score() RETURNS trigger
LANGUAGE plpgsql AS $$
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

DROP TRIGGER IF EXISTS comments_flair_score ON comments;
CREATE TRIGGER comments_flair_score
  AFTER INSERT OR UPDATE OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION trg_comments_flair_score();

-- 9. 트리거: post_votes INSERT/DELETE/UPDATE
-- up vote 만 점수 부여 (글 작성자에게 그 글의 flair 점수 +1)
-- vote_type 변경 시 처리: down→up = +1, up→down = -1
CREATE OR REPLACE FUNCTION trg_votes_flair_score() RETURNS trigger
LANGUAGE plpgsql AS $$
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

DROP TRIGGER IF EXISTS votes_flair_score ON post_votes;
CREATE TRIGGER votes_flair_score
  AFTER INSERT OR UPDATE OR DELETE ON post_votes
  FOR EACH ROW EXECUTE FUNCTION trg_votes_flair_score();

-- 10. 아스날 호칭 시드 (5x 비율)
INSERT INTO flair_titles (flair_id, name, threshold, sort_order)
SELECT pf.id, t.name, t.threshold, t.sort_order
FROM post_flairs pf
CROSS JOIN (VALUES
  ('구너',  2000,  1),
  ('앙리',  10000, 2),
  ('벵거',  50000, 3)
) AS t(name, threshold, sort_order)
WHERE pf.community_slug='football' AND pf.name='아스날'
ON CONFLICT (flair_id, name) DO UPDATE
  SET threshold  = EXCLUDED.threshold,
      sort_order = EXCLUDED.sort_order;

SELECT
  'Phase A done — flair 점수/호칭 시스템 활성. ' ||
  '아스날 호칭 3개 시드 (구너 2K / 앙리 10K / 벵거 50K). ' ||
  '트리거 등록: posts / comments / post_votes. ' ||
  '나머지 클럽 호칭은 추후 시드.' AS status;
