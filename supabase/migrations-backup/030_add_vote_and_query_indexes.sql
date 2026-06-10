-- Vote count 쿼리 최적화 (up/down 병렬 COUNT)
CREATE INDEX IF NOT EXISTS idx_post_votes_post_type
  ON post_votes(post_id, vote_type);

CREATE INDEX IF NOT EXISTS idx_comment_votes_comment_type
  ON comment_votes(comment_id, vote_type);

-- 댓글 조회 최적화 (post_id 기반 + soft delete 필터)
CREATE INDEX IF NOT EXISTS idx_comments_post_id_active
  ON comments(post_id, created_at ASC)
  WHERE deleted_at IS NULL;

-- 팔로우 조회 최적화
CREATE INDEX IF NOT EXISTS idx_user_follows_follower
  ON user_follows(follower_id);

CREATE INDEX IF NOT EXISTS idx_user_follows_followed
  ON user_follows(followed_user_id);

-- 알림 조회 최적화 (미읽음 우선)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

-- betman 예측 조회 최적화
CREATE INDEX IF NOT EXISTS idx_betman_predictions_user_game
  ON betman_predictions(user_id, game_id);

SELECT 'Vote and query indexes created!' as status;
