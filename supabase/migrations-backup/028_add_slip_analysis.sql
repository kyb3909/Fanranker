-- ============================================
-- 028: Add analysis_text field to prediction_slips table
-- Purpose: Allow journalists to attach analysis text to prediction slips
-- Dependencies: prediction_slips table
-- ============================================

-- ============================================
-- Step 1: Add analysis_text field
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'prediction_slips'
    AND column_name = 'analysis_text'
  ) THEN
    ALTER TABLE prediction_slips ADD COLUMN analysis_text text;
  END IF;
END $$;

-- ============================================
-- Step 2: Add comment for clarity
-- ============================================

COMMENT ON COLUMN prediction_slips.analysis_text IS '기자 분석글 (슬립 단위, 기자만 작성 가능)';

-- ============================================
-- Verification
-- ============================================
SELECT 'analysis_text field added to prediction_slips successfully!' as status;
