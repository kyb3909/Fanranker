-- ============================================
-- 011: Add expert certification fields to profiles table
-- Purpose: Track expert status for users with high prediction performance
-- Dependencies: profiles table (001_create_profiles.sql)
-- ============================================

-- ============================================
-- Step 1: Add expert fields to profiles table (if not exists)
-- ============================================

-- Add is_expert field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'is_expert'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_expert boolean DEFAULT false;
  END IF;
END $$;

-- Add expert_certified_at field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'expert_certified_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN expert_certified_at timestamptz;
  END IF;
END $$;

-- Add expert_rank_threshold field (optional, for tracking ranking position at certification)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'expert_rank_threshold'
  ) THEN
    ALTER TABLE profiles ADD COLUMN expert_rank_threshold integer;
  END IF;
END $$;

-- ============================================
-- Step 2: Add index for expert queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_is_expert ON profiles(is_expert) WHERE is_expert = true;

-- ============================================
-- Step 3: Function to auto-certify experts based on criteria
-- (Can be called by cron job or manual trigger)
-- ============================================

CREATE OR REPLACE FUNCTION auto_certify_experts()
RETURNS TABLE (
  certified_count integer,
  user_ids text[]
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id text;
  v_certified_user_ids text[] := '{}';
  v_certified_count integer := 0;
BEGIN
  -- Auto-certify users who meet criteria:
  -- 1. total_predictions >= 10 (minimum activity)
  -- 2. accuracy >= 70% OR profit >= 10000 (high performance)
  -- 3. is_expert = false (not already certified)
  
  FOR v_user_id IN
    SELECT DISTINCT ups.user_id
    FROM user_prediction_stats ups
    JOIN profiles p ON p.user_id = ups.user_id
    WHERE p.is_expert = false
      AND ups.total_predictions >= 10
      AND (
        ups.accuracy >= 70.0
        OR COALESCE(ups.profit, 0) >= 10000
      )
  LOOP
    -- Update profile
    UPDATE profiles
    SET 
      is_expert = true,
      expert_certified_at = COALESCE(expert_certified_at, now()),
      updated_at = now()
    WHERE user_id = v_user_id;

    v_certified_user_ids := array_append(v_certified_user_ids, v_user_id);
    v_certified_count := v_certified_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_certified_count, v_certified_user_ids;
END;
$$;

-- ============================================
-- Verification
-- ============================================
SELECT 'Expert fields added to profiles table successfully!' as status;
