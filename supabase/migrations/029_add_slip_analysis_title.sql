-- 029: Add analysis_title field to prediction_slips table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prediction_slips'
    AND column_name = 'analysis_title'
  ) THEN
    ALTER TABLE prediction_slips ADD COLUMN analysis_title varchar(100);
  END IF;
END $$;

COMMENT ON COLUMN prediction_slips.analysis_title IS '기자 분석글 제목 (최대 100자)';
