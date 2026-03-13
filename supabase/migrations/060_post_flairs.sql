-- ============================================
-- 060: 말머리(Flair) 시스템
-- 게시판별 말머리 정의 + 게시글 연결
-- ============================================

-- 말머리 정의 테이블
CREATE TABLE IF NOT EXISTS post_flairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_slug text NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6b7280',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(community_slug, name)
);

ALTER TABLE post_flairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Flairs are viewable by everyone"
  ON post_flairs FOR SELECT USING (true);

-- 게시글에 flair_id 컬럼 추가
ALTER TABLE posts ADD COLUMN IF NOT EXISTS flair_id uuid REFERENCES post_flairs(id) ON DELETE SET NULL;

-- 인덱스: 게시판+말머리 필터 조회용
CREATE INDEX IF NOT EXISTS idx_posts_flair ON posts(community_slug, flair_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_post_flairs_community ON post_flairs(community_slug, sort_order) WHERE is_active = true;

-- 기본 말머리 시드 데이터
INSERT INTO post_flairs (community_slug, name, color, sort_order) VALUES
  -- 축구
  ('football', '정보', '#3b82f6', 1),
  ('football', '잡담', '#6b7280', 2),
  ('football', '분석', '#8b5cf6', 3),
  ('football', '움짤', '#f59e0b', 4),
  ('football', '뉴스', '#ef4444', 5),
  ('football', '질문', '#10b981', 6),
  -- 야구
  ('baseball', '정보', '#3b82f6', 1),
  ('baseball', '잡담', '#6b7280', 2),
  ('baseball', '분석', '#8b5cf6', 3),
  ('baseball', '움짤', '#f59e0b', 4),
  ('baseball', '뉴스', '#ef4444', 5),
  ('baseball', '질문', '#10b981', 6),
  -- 농구
  ('basketball', '정보', '#3b82f6', 1),
  ('basketball', '잡담', '#6b7280', 2),
  ('basketball', '분석', '#8b5cf6', 3),
  ('basketball', '뉴스', '#ef4444', 4),
  ('basketball', '질문', '#10b981', 5),
  -- 배구
  ('volleyball', '정보', '#3b82f6', 1),
  ('volleyball', '잡담', '#6b7280', 2),
  ('volleyball', '뉴스', '#ef4444', 3),
  ('volleyball', '질문', '#10b981', 4),
  -- 게임
  ('game', '정보', '#3b82f6', 1),
  ('game', '잡담', '#6b7280', 2),
  ('game', '공략', '#8b5cf6', 3),
  ('game', '움짤', '#f59e0b', 4),
  ('game', '질문', '#10b981', 5),
  -- 영화
  ('movies', '리뷰', '#3b82f6', 1),
  ('movies', '잡담', '#6b7280', 2),
  ('movies', '추천', '#8b5cf6', 3),
  ('movies', '뉴스', '#ef4444', 4),
  ('movies', '질문', '#10b981', 5),
  -- 음악
  ('music', '잡담', '#6b7280', 1),
  ('music', '추천', '#8b5cf6', 2),
  ('music', '뉴스', '#ef4444', 3),
  ('music', '리뷰', '#3b82f6', 4),
  -- 아이돌
  ('idol', '잡담', '#6b7280', 1),
  ('idol', '움짤', '#f59e0b', 2),
  ('idol', '정보', '#3b82f6', 3),
  ('idol', '팬아트', '#ec4899', 4),
  ('idol', '뉴스', '#ef4444', 5),
  -- 애니
  ('anime', '잡담', '#6b7280', 1),
  ('anime', '추천', '#8b5cf6', 2),
  ('anime', '리뷰', '#3b82f6', 3),
  ('anime', '움짤', '#f59e0b', 4),
  ('anime', '질문', '#10b981', 5),
  -- 자유
  ('free-board', '잡담', '#6b7280', 1),
  ('free-board', '유머', '#f59e0b', 2),
  ('free-board', '정보', '#3b82f6', 3),
  ('free-board', '질문', '#10b981', 4),
  ('free-board', '고민', '#8b5cf6', 5)
ON CONFLICT (community_slug, name) DO NOTHING;

SELECT 'post_flairs system created!' as status;
