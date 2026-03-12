-- 1) profiles에 deleted_at 컬럼 추가 (소프트 삭제용)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2) 닉네임 중복 방지: 삭제되지 않은 유저에 대해 unique (대소문자 무시)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_nickname_unique
  ON profiles (lower(nickname))
  WHERE deleted_at IS NULL;
