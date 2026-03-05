-- 최근 댓글 게시물 조회 성능 개선
-- 1) comments.created_at DESC 인덱스 추가
-- 2) RPC: 2 round trip → 1 round trip (posts + profiles 포함)

-- 인덱스: recent_comments 정렬에 사용
CREATE INDEX IF NOT EXISTS idx_comments_created_at_desc
  ON comments(created_at DESC) WHERE deleted_at IS NULL;

-- RPC: 최근 댓글이 달린 게시물 + 작성자 프로필을 한 번에 조회
CREATE OR REPLACE FUNCTION get_recent_commented_posts(
  p_limit int DEFAULT 20,
  p_community_slug text DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE
AS $$
  WITH latest_comments AS (
    SELECT post_id, MAX(created_at) AS latest_comment_at
    FROM comments
    WHERE deleted_at IS NULL
    GROUP BY post_id
    ORDER BY MAX(created_at) DESC
    LIMIT p_limit
  ),
  result_posts AS (
    SELECT
      p.id, p.user_id, p.community_slug, p.title, p.content, p.image,
      p.vote_count, p.comment_count, p.temperature, p.created_at,
      lc.latest_comment_at
    FROM latest_comments lc
    JOIN posts p ON p.id = lc.post_id
    WHERE p.deleted_at IS NULL
      AND (p_community_slug IS NULL OR p.community_slug = p_community_slug)
    ORDER BY lc.latest_comment_at DESC
  )
  SELECT json_build_object(
    'posts', COALESCE(
      (SELECT json_agg(row_to_json(rp)) FROM result_posts rp),
      '[]'::json
    ),
    'profiles', COALESCE(
      (SELECT json_agg(DISTINCT jsonb_build_object(
        'user_id', pr.user_id,
        'nickname', pr.nickname,
        'avatar_url', pr.avatar_url,
        'temperature', pr.temperature
      ))
      FROM result_posts rp2
      JOIN profiles pr ON pr.user_id = rp2.user_id),
      '[]'::json
    )
  );
$$;
