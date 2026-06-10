-- ============================================
-- 015: Create bookmarks table
-- Purpose: Allow users to bookmark posts for later reading
-- Dependencies: profiles table (001_create_profiles.sql), posts table (002_create_categories_posts.sql)
-- ============================================

-- ============================================
-- Step 1: Create bookmarks table
-- ============================================

CREATE TABLE IF NOT EXISTS bookmarks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    
    -- Prevent duplicate bookmarks
    UNIQUE(user_id, post_id)
);

-- ============================================
-- Step 2: Indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_post_id ON bookmarks(post_id);

-- ============================================
-- Step 3: Enable RLS
-- ============================================

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- Users can view their own bookmarks
CREATE POLICY "Users can view their own bookmarks"
    ON bookmarks FOR SELECT
    USING ((auth.jwt()->>'sub') = user_id);

-- Users can create their own bookmarks
CREATE POLICY "Users can create their own bookmarks"
    ON bookmarks FOR INSERT
    WITH CHECK ((auth.jwt()->>'sub') = user_id);

-- Users can delete their own bookmarks
CREATE POLICY "Users can delete their own bookmarks"
    ON bookmarks FOR DELETE
    USING ((auth.jwt()->>'sub') = user_id);

-- ============================================
-- Verification
-- ============================================
SELECT 'bookmarks table created successfully!' as status;
