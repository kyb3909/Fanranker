-- Reddit 시드 게시물 추적 테이블
-- 중복 등록 방지용. service role만 접근 (RLS 정책 없음)

CREATE TABLE IF NOT EXISTS seeded_reddit_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reddit_id text NOT NULL UNIQUE,
  subreddit text NOT NULL,
  community_slug text NOT NULL,
  post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  original_title text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE seeded_reddit_posts ENABLE ROW LEVEL SECURITY;

-- 봇 유저 프로필 등록 (자연스러운 닉네임)
INSERT INTO profiles (user_id, nickname, avatar_url)
VALUES
  ('user_bot_soccer_kr', '풋볼매니아_kr', null),
  ('user_bot_nba_kr', '후프드림즈', null)
ON CONFLICT (user_id) DO NOTHING;
