-- Performance optimization indexes
-- 1. comment_count 정렬용 (인기순 피드)
CREATE INDEX IF NOT EXISTS idx_posts_comment_count
  ON posts(comment_count DESC, created_at DESC)
  WHERE deleted_at IS NULL;

-- 2. community + 날짜 복합 인덱스 (게시판별 최신글)
CREATE INDEX IF NOT EXISTS idx_posts_community_date
  ON posts(community_slug, created_at DESC)
  WHERE deleted_at IS NULL;

-- 3. vote_count 정렬용 (인기순)
CREATE INDEX IF NOT EXISTS idx_posts_vote_count
  ON posts(vote_count DESC, created_at DESC)
  WHERE deleted_at IS NULL;

-- 4. prediction_activities 조회 최적화
CREATE INDEX IF NOT EXISTS idx_prediction_activities_user_round
  ON prediction_activities(user_id, round_id);

SELECT 'Performance indexes created!' as status;
