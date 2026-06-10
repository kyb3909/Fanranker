-- ============================================
-- Verify and fix comment_count for all posts
-- This ensures comment_count matches actual comment counts
-- ============================================

-- First, verify the trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_increment_comment_count'
  ) THEN
    RAISE EXCEPTION 'Trigger trigger_increment_comment_count does not exist. Please run migration 023_create_comment_count_trigger.sql first.';
  END IF;
  
  RAISE NOTICE 'Trigger exists. Proceeding with comment count recalculation...';
END $$;

-- Recalculate all comment counts to fix any discrepancies
-- This uses the function from migration 022
DO $$
BEGIN
  -- Check if function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'recalculate_all_comment_counts'
  ) THEN
    PERFORM recalculate_all_comment_counts();
    RAISE NOTICE 'All comment counts have been recalculated.';
  ELSE
    RAISE WARNING 'recalculate_all_comment_counts function not found. Using manual update...';
    
    -- Manual recalculation if function doesn't exist
    UPDATE posts p
    SET comment_count = (
      SELECT COUNT(*)
      FROM comments c
      WHERE c.post_id = p.id
        AND c.deleted_at IS NULL
    );
    
    RAISE NOTICE 'Comment counts updated manually.';
  END IF;
END $$;

-- ============================================
-- VERIFICATION: Show some examples
-- ============================================
SELECT 
  p.id,
  p.title,
  p.comment_count as db_count,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) as actual_count,
  CASE 
    WHEN p.comment_count = (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) 
    THEN '✓ Match' 
    ELSE '✗ Mismatch' 
  END as status
FROM posts p
WHERE p.deleted_at IS NULL
ORDER BY p.created_at DESC
LIMIT 10;
