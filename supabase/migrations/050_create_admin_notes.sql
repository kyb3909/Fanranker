-- 관리자 메모장
CREATE TABLE IF NOT EXISTS admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: service_role만 접근
ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;
-- 일반 유저 접근 차단 (admin API에서 service_role client 사용)
