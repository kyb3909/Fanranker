-- 게시글 투표 카운트 자동 갱신 trigger
-- 레이스 컨디션 해결: API에서 COUNT 쿼리 대신 DB가 원자적으로 갱신
CREATE OR REPLACE FUNCTION recalc_post_vote_count()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_vote_count ON post_votes;
CREATE TRIGGER trg_post_vote_count
AFTER INSERT OR UPDATE OR DELETE ON post_votes
FOR EACH ROW EXECUTE FUNCTION recalc_post_vote_count();

-- 댓글 투표 카운트 자동 갱신 trigger
CREATE OR REPLACE FUNCTION recalc_comment_vote_count()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comment_vote_count ON comment_votes;
CREATE TRIGGER trg_comment_vote_count
AFTER INSERT OR UPDATE OR DELETE ON comment_votes
FOR EACH ROW EXECUTE FUNCTION recalc_comment_vote_count();

SELECT 'Vote count triggers created!' as status;
