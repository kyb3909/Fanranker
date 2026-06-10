-- ============================================
-- 012: Add analysis fields to predictions table (Expert-only feature)
-- Purpose: Allow experts to add analysis text and set premium pricing for predictions
-- Dependencies: predictions table (should exist from prediction system setup)
-- ============================================

-- ============================================
-- Step 1: Add analysis and premium fields to predictions table (if not exists)
-- ============================================

-- Add analysis_text field (required for experts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'predictions' 
    AND column_name = 'analysis_text'
  ) THEN
    ALTER TABLE predictions ADD COLUMN analysis_text text;
  END IF;
END $$;

-- Add is_premium field (for premium content flag)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'predictions' 
    AND column_name = 'is_premium'
  ) THEN
    ALTER TABLE predictions ADD COLUMN is_premium boolean DEFAULT false;
  END IF;
END $$;

-- Add price field (for one-time purchase price in tokens)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'predictions' 
    AND column_name = 'price'
  ) THEN
    ALTER TABLE predictions ADD COLUMN price integer;
  END IF;
END $$;

-- ============================================
-- Step 2: Add constraints and validation
-- ============================================

-- Ensure price is only set when is_premium is true
-- (This will be enforced in application logic, not DB constraint due to PostgreSQL limitations)
-- We can add a check constraint, but it's better to handle in application code

-- Add index for premium predictions queries
CREATE INDEX IF NOT EXISTS idx_predictions_is_premium ON predictions(is_premium) WHERE is_premium = true;

-- Add index for analysis text search (if needed)
-- CREATE INDEX IF NOT EXISTS idx_predictions_analysis_text ON predictions USING GIN(to_tsvector('korean', analysis_text));

-- ============================================
-- Verification
-- ============================================
SELECT 'Analysis fields added to predictions table successfully!' as status;
