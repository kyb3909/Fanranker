-- ============================================
-- STEP 5: Create user_follows table
-- Run this AFTER 004_create_post_votes.sql
-- ============================================

-- User follows table (user-to-user follow relationships)
CREATE TABLE IF NOT EXISTS user_follows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- follower_id: 팔로우하는 사람 (Clerk user ID)
    follower_id text NOT NULL,
    -- followed_user_id: 팔로우 당하는 사람 (Clerk user ID)
    followed_user_id text NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(follower_id, followed_user_id) -- 한 사용자는 같은 사용자를 한 번만 팔로우 가능
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_followed ON user_follows(followed_user_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_both ON user_follows(follower_id, followed_user_id);

-- RLS for user_follows
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- Anyone can view follow relationships (for public profiles)
CREATE POLICY "Follow relationships are viewable by everyone"
    ON user_follows FOR SELECT
    USING (true);

-- Users can create their own follow relationships
CREATE POLICY "Users can follow others"
    ON user_follows FOR INSERT
    WITH CHECK ((auth.jwt()->>'sub') = follower_id);

-- Users can unfollow (delete their own follow relationships)
CREATE POLICY "Users can unfollow"
    ON user_follows FOR DELETE
    USING ((auth.jwt()->>'sub') = follower_id);

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'user_follows table created!' as status;
