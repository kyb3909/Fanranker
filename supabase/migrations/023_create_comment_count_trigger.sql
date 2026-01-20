-- ============================================
-- Create trigger to automatically increment comment_count
-- This ensures comment_count is always accurate and prevents duplicates
-- ============================================

-- Function to increment comment_count when a comment is inserted
CREATE OR REPLACE FUNCTION increment_comment_count_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only increment if comment is not deleted (deleted_at is NULL)
  IF NEW.deleted_at IS NULL THEN
    UPDATE posts
    SET comment_count = COALESCE(comment_count, 0) + 1
    WHERE id = NEW.post_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function to decrement comment_count when a comment is soft-deleted
CREATE OR REPLACE FUNCTION decrement_comment_count_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only decrement if comment was not already deleted
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE posts
    SET comment_count = GREATEST(COALESCE(comment_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_increment_comment_count ON comments;
DROP TRIGGER IF EXISTS trigger_decrement_comment_count ON comments;

-- Create trigger to increment comment_count on INSERT
CREATE TRIGGER trigger_increment_comment_count
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION increment_comment_count_on_insert();

-- Create trigger to decrement comment_count on soft DELETE (when deleted_at is set)
CREATE TRIGGER trigger_decrement_comment_count
  AFTER UPDATE OF deleted_at ON comments
  FOR EACH ROW
  EXECUTE FUNCTION decrement_comment_count_on_delete();

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'comment_count triggers created successfully!' as status;
