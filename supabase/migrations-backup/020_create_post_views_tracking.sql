-- ============================================
-- Create post_views table for IP-based view tracking
-- Prevents duplicate view count increments from the same IP within 1 hour
-- ============================================

-- Post views tracking table
-- Drop existing functions first (they depend on the table)
DROP FUNCTION IF EXISTS increment_post_view_count(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS can_increment_view_count(uuid, text) CASCADE;

-- Drop table if exists to ensure clean creation
DROP TABLE IF EXISTS post_views CASCADE;

CREATE TABLE post_views (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    ip_address text NOT NULL,
    viewed_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_post_views_post_id ON post_views(post_id);
CREATE INDEX IF NOT EXISTS idx_post_views_ip ON post_views(ip_address);
CREATE INDEX IF NOT EXISTS idx_post_views_post_ip_time ON post_views(post_id, ip_address, viewed_at DESC);

-- Index for fast lookups (no unique constraint - we check in function logic)
-- Multiple views from same IP in same hour are allowed in table,
-- but function will prevent incrementing view_count

-- RLS for post_views (system table, minimal access)
ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage post_views"
  ON post_views FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Allow authenticated users to insert (for tracking)
CREATE POLICY "Authenticated users can insert post_views"
  ON post_views FOR INSERT
  WITH CHECK (auth.jwt() IS NOT NULL);

-- ============================================
-- Function to check if IP can increment view count
-- Returns true if IP hasn't viewed this post in the last hour
-- ============================================
CREATE OR REPLACE FUNCTION can_increment_view_count(
  post_id_param uuid,
  ip_address_param text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_view_time timestamptz;
BEGIN
  -- Check if this IP has viewed this post in the last hour
  SELECT MAX(viewed_at) INTO last_view_time
  FROM post_views
  WHERE post_id = post_id_param
    AND ip_address = ip_address_param
    AND viewed_at > now() - INTERVAL '1 hour';

  -- If no view in last hour, allow increment
  RETURN last_view_time IS NULL;
END;
$$;

-- Function to record view and increment count atomically
CREATE OR REPLACE FUNCTION increment_post_view_count(
  post_id_param uuid,
  ip_address_param text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  can_increment boolean;
BEGIN
  -- Check if can increment
  SELECT can_increment_view_count(post_id_param, ip_address_param) INTO can_increment;
  
  IF NOT can_increment THEN
    RETURN false;
  END IF;

  -- Record the view (always insert, duplicates are handled by function logic)
  INSERT INTO post_views (post_id, ip_address, viewed_at)
  VALUES (post_id_param, ip_address_param, now());

  -- Increment view count atomically
  UPDATE posts
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = post_id_param;

  RETURN true;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION can_increment_view_count(uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION increment_post_view_count(uuid, text) TO authenticated, anon;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'post_views table and functions created successfully!' as status;
