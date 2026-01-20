-- ============================================
-- Create RPC function to atomically increment comment_count
-- This prevents race conditions when multiple comments are created simultaneously
-- ============================================

CREATE OR REPLACE FUNCTION increment_post_comment_count(post_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE posts
  SET comment_count = COALESCE(comment_count, 0) + 1
  WHERE id = post_id_param;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_post_comment_count(uuid) TO authenticated;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'increment_post_comment_count function created successfully!' as status;
