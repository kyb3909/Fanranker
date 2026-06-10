-- 닉네임 변경 쿨다운 (3개월)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname_changed_at timestamptz;
