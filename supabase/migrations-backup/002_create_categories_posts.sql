-- ============================================
-- STEP 2: Create categories and posts tables
-- Run this AFTER 001_create_profiles.sql
-- ============================================

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE NOT NULL,
    name text NOT NULL,
    icon text,
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- RLS for categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are viewable by everyone"
    ON categories FOR SELECT
    USING (true);

-- Trigger
CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Seed categories
INSERT INTO categories (slug, name, icon, sort_order) VALUES
    ('overseas-football', '해외축구', '⚽', 1),
    ('domestic-football', '국내축구', '🏟️', 2),
    ('baseball', '야구', '⚾', 3),
    ('basketball', '농구', '🏀', 4),
    ('volleyball', '배구', '🏐', 5),
    ('esports', 'e스포츠', '🎮', 6),
    ('free-board', '자유게시판', '💬', 7),
    ('tips', '정보게시판', '📊', 8)
ON CONFLICT (slug) DO NOTHING;

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- user_id is Clerk user ID (text), not UUID
    user_id text NOT NULL,
    category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    title text NOT NULL,
    content text NOT NULL,
    view_count integer DEFAULT 0,
    vote_count integer DEFAULT 0,
    comment_count integer DEFAULT 0,
    temperature numeric(5,2) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_temperature ON posts(temperature DESC, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC) WHERE deleted_at IS NULL;

-- RLS for posts
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Anyone can view non-deleted posts
CREATE POLICY "Posts are viewable by everyone"
    ON posts FOR SELECT
    USING (deleted_at IS NULL);

-- Authenticated users can create posts
CREATE POLICY "Authenticated users can create posts"
    ON posts FOR INSERT
    WITH CHECK ((auth.jwt()->>'sub') = user_id);

-- Users can update their own posts
CREATE POLICY "Users can update their own posts"
    ON posts FOR UPDATE
    USING ((auth.jwt()->>'sub') = user_id)
    WITH CHECK ((auth.jwt()->>'sub') = user_id);

-- Users can soft delete their own posts
CREATE POLICY "Users can delete their own posts"
    ON posts FOR DELETE
    USING ((auth.jwt()->>'sub') = user_id);

-- Trigger
CREATE TRIGGER update_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'categories and posts tables created!' as status;
SELECT COUNT(*) as category_count FROM categories;
