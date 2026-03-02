-- ============================================
-- 027: Add journalist fields to profiles table
-- Purpose: Support journalist role for prediction analysis content
-- Dependencies: profiles table (001_create_profiles.sql)
-- ============================================

-- ============================================
-- Step 1: Add is_journalist field
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'is_journalist'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_journalist boolean DEFAULT false;
  END IF;
END $$;

-- ============================================
-- Step 2: Add journalist_certified_at field
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'journalist_certified_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN journalist_certified_at timestamptz;
  END IF;
END $$;

-- ============================================
-- Step 3: Create index for journalist queries
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_is_journalist ON profiles(is_journalist) WHERE is_journalist = true;

-- ============================================
-- Step 4: Add comment for clarity
-- ============================================

COMMENT ON COLUMN profiles.is_journalist IS '기자 여부 (true일 경우 분석글 작성 및 팔로우 대상)';
COMMENT ON COLUMN profiles.journalist_certified_at IS '기자 인증 시각';

-- ============================================
-- Verification
-- ============================================
SELECT 'Journalist fields added to profiles table successfully!' as status;
