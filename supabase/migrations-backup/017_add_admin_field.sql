-- ============================================
-- 017: Add is_admin field to profiles table
-- Purpose: Enable admin role for user management
-- Dependencies: profiles table (001_create_profiles.sql)
-- ============================================

-- ============================================
-- Step 1: Add is_admin column
-- ============================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- ============================================
-- Step 2: Create index for admin queries (optional)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin) WHERE is_admin = true;

-- ============================================
-- Step 3: Add comment for clarity
-- ============================================

COMMENT ON COLUMN profiles.is_admin IS '관리자 여부 (true일 경우 관리자 권한 보유)';

-- ============================================
-- Verification
-- ============================================
SELECT 'is_admin field added successfully!' as status;
