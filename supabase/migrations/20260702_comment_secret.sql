-- 비밀댓글 (운영자만 작성, 원글 작성자·운영자만 열람)
-- 문의글에 운영자가 비공개 답변을 달기 위한 기능.

ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_secret boolean NOT NULL DEFAULT false;

-- RLS: 공개(anon 키 직접 조회 포함)로는 비밀댓글이 절대 안 읽히게 SELECT 정책 교체.
-- 브라우저에 노출되는 publishable 키로도 비밀 내용이 새지 않도록 DB 레벨에서 차단.
-- 원글 작성자/운영자에게 보여주는 것은 서버(service role) API에서 신원 확인 후 처리한다.
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
CREATE POLICY "Comments are viewable by everyone"
  ON comments FOR SELECT
  USING (deleted_at IS NULL AND is_secret = false);
