-- ============================================
-- Create comment_cooldown table for rate limiting
-- Prevents users from posting comments too frequently (10 second cooldown)
-- ============================================

-- Comment cooldown tracking table
CREATE TABLE IF NOT EXISTS comment_cooldowns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL, -- Clerk user_id
    last_comment_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_cooldowns_user_id ON comment_cooldowns(user_id);

-- RLS for comment_cooldowns
ALTER TABLE comment_cooldowns ENABLE ROW LEVEL SECURITY;

-- Users can view their own cooldown status
CREATE POLICY "Users can view their own cooldown"
  ON comment_cooldowns FOR SELECT
  USING ((auth.jwt()->>'sub') = user_id);

-- Service role can manage all cooldowns
CREATE POLICY "Service role can manage comment_cooldowns"
  ON comment_cooldowns FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- Function to check if user can post comment (10 second cooldown)
-- Returns true if user can post, false if still in cooldown
-- ============================================
CREATE OR REPLACE FUNCTION can_post_comment(user_id_param text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_comment_time timestamptz;
  cooldown_seconds integer := 10;
BEGIN
  -- Get last comment time for this user
  SELECT last_comment_at INTO last_comment_time
  FROM comment_cooldowns
  WHERE user_id = user_id_param;

  -- If no previous comment, allow
  IF last_comment_time IS NULL THEN
    RETURN true;
  END IF;

  -- Check if cooldown period has passed
  IF now() - last_comment_time >= INTERVAL '10 seconds' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ============================================
-- Function to update comment cooldown after posting
-- ============================================
CREATE OR REPLACE FUNCTION update_comment_cooldown(user_id_param text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO comment_cooldowns (user_id, last_comment_at, updated_at)
  VALUES (user_id_param, now(), now())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    last_comment_at = now(),
    updated_at = now();
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION can_post_comment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_comment_cooldown(text) TO authenticated;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'comment_cooldown table and functions created successfully!' as status;
