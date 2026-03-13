-- ============================================
-- 062: 유저 등급 시스템
-- 가입 후 일정 조건 충족 전까지 기능 제한
-- ============================================

-- profiles에 등급 관련 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS grade text DEFAULT 'newcomer';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS post_count integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS comment_count integer DEFAULT 0;

-- 등급: newcomer(새내기) → regular(정회원) → active(우수회원) → vip
-- newcomer → regular 승급 조건: 댓글 5개 이상 OR 가입 후 24시간 경과
-- 관리자/기자/전문가는 등급 제한 없음

-- post_count, comment_count 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_user_content_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'posts' THEN
    IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
      UPDATE profiles SET post_count = post_count + 1 WHERE user_id = NEW.user_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'comments' THEN
    IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
      UPDATE profiles
        SET comment_count = comment_count + 1,
            grade = CASE
              WHEN grade = 'newcomer' AND comment_count + 1 >= 5 THEN 'regular'
              ELSE grade
            END
        WHERE user_id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성 (이미 있으면 교체)
DROP TRIGGER IF EXISTS trg_update_post_count ON posts;
CREATE TRIGGER trg_update_post_count
  AFTER INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION update_user_content_counts();

DROP TRIGGER IF EXISTS trg_update_comment_count ON comments;
CREATE TRIGGER trg_update_comment_count
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION update_user_content_counts();

-- 기존 유저들 정회원으로 일괄 승급 (이미 활동한 유저)
UPDATE profiles SET grade = 'regular'
WHERE grade = 'newcomer'
AND (created_at < now() - interval '24 hours');

SELECT 'user grade system created!' as status;
