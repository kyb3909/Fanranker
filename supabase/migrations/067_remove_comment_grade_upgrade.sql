-- ============================================
-- 067: 댓글 5개 자동승급 제거
-- newcomer → regular 승급은 24시간 경과만으로 처리
-- ============================================

-- 댓글 작성 시 grade 자동 변경 로직 제거 (comment_count만 증가)
CREATE OR REPLACE FUNCTION update_user_content_counts()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

SELECT 'comment grade upgrade removed - 24h only' as status;
