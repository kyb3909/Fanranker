-- ============================================
-- Fix comment_count by recalculating from actual comments
-- This corrects any discrepancies in comment_count
-- ============================================

-- Function to recalculate comment_count for a specific post
CREATE OR REPLACE FUNCTION recalculate_post_comment_count(post_id_param uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  actual_count integer;
BEGIN
  -- Count actual non-deleted comments (including replies)
  SELECT COUNT(*) INTO actual_count
  FROM comments
  WHERE post_id = post_id_param
    AND deleted_at IS NULL;

  -- Update the post's comment_count
  UPDATE posts
  SET comment_count = actual_count
  WHERE id = post_id_param;

  RETURN actual_count;
END;
$$;

-- Function to recalculate comment_count for all posts
CREATE OR REPLACE FUNCTION recalculate_all_comment_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update comment_count for all posts based on actual comment counts
  UPDATE posts p
  SET comment_count = (
    SELECT COUNT(*)
    FROM comments c
    WHERE c.post_id = p.id
      AND c.deleted_at IS NULL
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION recalculate_post_comment_count(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION recalculate_all_comment_counts() TO authenticated, anon;

-- ============================================
-- Optional: Recalculate all comment counts now
-- Uncomment the line below to fix all existing posts
-- ============================================
-- SELECT recalculate_all_comment_counts();

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'recalculate_post_comment_count and recalculate_all_comment_counts functions created successfully!' as status;
