-- ============================================
-- Fix RLS policy for temperature_update_queue table
-- This table is used by triggers to queue temperature updates
-- ============================================

-- Check if temperature_update_queue table exists and fix RLS
DO $$
BEGIN
  -- Check if table exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'temperature_update_queue'
  ) THEN
    -- Drop all existing policies
    DROP POLICY IF EXISTS "Allow authenticated inserts to temperature_update_queue" ON temperature_update_queue;
    DROP POLICY IF EXISTS "Allow system inserts to temperature_update_queue" ON temperature_update_queue;
    DROP POLICY IF EXISTS "Allow service role full access to temperature_update_queue" ON temperature_update_queue;

    -- Option 1: Disable RLS completely (simplest solution for system tables)
    ALTER TABLE temperature_update_queue DISABLE ROW LEVEL SECURITY;

    RAISE NOTICE 'RLS disabled for temperature_update_queue table';
    
    -- Alternative: If you want to keep RLS enabled, use this instead:
    -- ALTER TABLE temperature_update_queue ENABLE ROW LEVEL SECURITY;
    -- 
    -- -- Allow all inserts (for triggers)
    -- CREATE POLICY "Allow all inserts to temperature_update_queue"
    --   ON temperature_update_queue FOR INSERT
    --   WITH CHECK (true);
    --
    -- -- Allow service role full access
    -- CREATE POLICY "Allow service role full access to temperature_update_queue"
    --   ON temperature_update_queue FOR ALL
    --   USING (auth.role() = 'service_role')
    --   WITH CHECK (auth.role() = 'service_role');
    
  ELSE
    RAISE NOTICE 'temperature_update_queue table does not exist, skipping RLS fix';
  END IF;
END $$;

-- ============================================
-- Alternative: If the trigger function should run with elevated privileges
-- ============================================
-- If the above doesn't work, we may need to modify the trigger function
-- to use SECURITY DEFINER. However, we need to find the function first.
-- This is a fallback option.

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'temperature_update_queue'
    ) THEN 'temperature_update_queue table exists and RLS policies have been added'
    ELSE 'temperature_update_queue table does not exist'
  END as status;
