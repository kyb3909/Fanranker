-- ============================================
-- 009: Add settlement fields to matches table
-- Purpose: Track whether matches have been settled (prediction results processed)
-- Dependencies: matches table (should exist from prediction system setup)
-- ============================================

-- ============================================
-- Step 1: Add is_settled field to matches table (if not exists)
-- ============================================

-- Check if column exists, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'matches' 
    AND column_name = 'is_settled'
  ) THEN
    ALTER TABLE matches ADD COLUMN is_settled boolean DEFAULT false;
  END IF;
END $$;

-- Add index for faster queries on unsettled matches
CREATE INDEX IF NOT EXISTS idx_matches_settlement ON matches(time_status, is_settled) WHERE time_status = 3 AND is_settled = false;

-- ============================================
-- Verification
-- ============================================
SELECT 'Settlement fields added to matches table successfully!' as status;
