-- ============================================
-- 010: Add profit and roi fields to user_prediction_stats
-- Purpose: Calculate profit and ROI for ranking
-- Dependencies: user_prediction_stats table (should exist from prediction system)
-- ============================================

-- ============================================
-- Step 1: Add profit, roi, total_tokens_spent fields (if not exists)
-- ============================================

-- Add profit field (total_points - total_tokens_spent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_prediction_stats' 
    AND column_name = 'profit'
  ) THEN
    ALTER TABLE user_prediction_stats ADD COLUMN profit integer DEFAULT 0;
  END IF;
END $$;

-- Add roi field (Return on Investment percentage)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_prediction_stats' 
    AND column_name = 'roi'
  ) THEN
    ALTER TABLE user_prediction_stats ADD COLUMN roi numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add total_tokens_spent field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_prediction_stats' 
    AND column_name = 'total_tokens_spent'
  ) THEN
    ALTER TABLE user_prediction_stats ADD COLUMN total_tokens_spent integer DEFAULT 0;
  END IF;
END $$;

-- ============================================
-- Step 2: Update existing records to calculate profit and roi
-- ============================================

-- Calculate profit and roi for existing records
UPDATE user_prediction_stats
SET 
  total_tokens_spent = COALESCE(total_tokens_spent, 0),
  profit = COALESCE(total_points, 0) - COALESCE(total_tokens_spent, 0),
  roi = CASE 
    WHEN COALESCE(total_tokens_spent, 0) > 0 
    THEN ((COALESCE(total_points, 0) - COALESCE(total_tokens_spent, 0))::numeric / total_tokens_spent::numeric) * 100
    ELSE 0
  END
WHERE profit IS NULL OR roi IS NULL;

-- ============================================
-- Step 3: Add indexes for ranking queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_prediction_stats_profit ON user_prediction_stats(profit DESC);
CREATE INDEX IF NOT EXISTS idx_user_prediction_stats_roi ON user_prediction_stats(roi DESC);
CREATE INDEX IF NOT EXISTS idx_user_prediction_stats_accuracy ON user_prediction_stats(accuracy DESC);

-- ============================================
-- Verification
-- ============================================
SELECT 'Profit and ROI fields added to user_prediction_stats table successfully!' as status;
