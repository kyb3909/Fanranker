-- ============================================
-- STEP 4: Create post_votes table
-- Run this AFTER 003_create_comments.sql
-- ============================================

-- Post votes table (prevents duplicate votes)
CREATE TABLE IF NOT EXISTS post_votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    -- user_id is Clerk user ID (text), not UUID
    user_id text NOT NULL,
    vote_type text NOT NULL CHECK (vote_type IN ('up', 'down')), -- 'up' for upvote, 'down' for downvote
    created_at timestamptz DEFAULT now(),
    UNIQUE(post_id, user_id) -- Prevents duplicate votes from same user on same post
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_post_votes_post_id ON post_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_votes_user_id ON post_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_post_votes_post_user ON post_votes(post_id, user_id);

-- RLS for post_votes
ALTER TABLE post_votes ENABLE ROW LEVEL SECURITY;

-- Anyone can view votes (for vote counts)
CREATE POLICY "Votes are viewable by everyone"
    ON post_votes FOR SELECT
    USING (true);

-- Authenticated users can create/delete their own votes
CREATE POLICY "Authenticated users can manage their own votes"
    ON post_votes FOR ALL
    USING ((auth.jwt()->>'sub') = user_id)
    WITH CHECK ((auth.jwt()->>'sub') = user_id);

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'post_votes table created!' as status;
