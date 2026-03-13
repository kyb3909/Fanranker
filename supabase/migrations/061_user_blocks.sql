-- ============================================
-- 061: 유저 차단 시스템
-- ============================================

CREATE TABLE IF NOT EXISTS user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id text NOT NULL,
  blocked_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocks"
  ON user_blocks FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own blocks"
  ON user_blocks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can delete own blocks"
  ON user_blocks FOR DELETE
  USING (true);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

SELECT 'user_blocks table created!' as status;
