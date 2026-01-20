-- ============================================
-- STEP 3: Create comments table
-- Run this AFTER 002_create_categories_posts.sql
-- ============================================

-- Comments table (supports nested replies)
CREATE TABLE IF NOT EXISTS comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    -- user_id is Clerk user ID (text), not UUID
    user_id text NOT NULL,
    parent_id uuid REFERENCES comments(id) ON DELETE CASCADE, -- NULL for top-level comments
    content text NOT NULL,
    vote_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id, created_at ASC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id, created_at DESC) WHERE deleted_at IS NULL;

-- RLS for comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Anyone can view non-deleted comments
CREATE POLICY "Comments are viewable by everyone"
    ON comments FOR SELECT
    USING (deleted_at IS NULL);

-- Authenticated users can create comments
CREATE POLICY "Authenticated users can create comments"
    ON comments FOR INSERT
    WITH CHECK ((auth.jwt()->>'sub') = user_id);

-- Users can update their own comments
CREATE POLICY "Users can update their own comments"
    ON comments FOR UPDATE
    USING ((auth.jwt()->>'sub') = user_id)
    WITH CHECK ((auth.jwt()->>'sub') = user_id);

-- Users can soft delete their own comments
CREATE POLICY "Users can delete their own comments"
    ON comments FOR DELETE
    USING ((auth.jwt()->>'sub') = user_id);

-- Trigger for updated_at (if function exists)
-- Note: update_updated_at_column function should be created in 002_create_categories_posts.sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER update_comments_updated_at
      BEFORE UPDATE ON comments
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'comments table created!' as status;
