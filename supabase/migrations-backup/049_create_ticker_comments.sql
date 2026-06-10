-- 트래커 댓글 (속보성, 7일 후 자동 삭제)
CREATE TABLE IF NOT EXISTS ticker_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_item_id bigint NOT NULL REFERENCES news_ticker_items(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  nickname text NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 300),
  likes int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ticker_comments_item ON ticker_comments(ticker_item_id, created_at DESC);
CREATE INDEX idx_ticker_comments_expire ON ticker_comments(created_at);

-- RLS
ALTER TABLE ticker_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticker_comments_read" ON ticker_comments
  FOR SELECT USING (true);

CREATE POLICY "ticker_comments_insert" ON ticker_comments
  FOR INSERT WITH CHECK ((auth.jwt()->>'sub') = user_id);

-- 7일 지난 댓글 삭제 함수 (cron에서 호출)
CREATE OR REPLACE FUNCTION cleanup_expired_ticker_comments()
RETURNS int AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM ticker_comments WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
