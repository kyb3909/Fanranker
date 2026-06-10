-- 공지/소개 배너 테이블
CREATE TABLE IF NOT EXISTS announcement_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_url text,
  link_url text,
  gradient text DEFAULT 'from-blue-600 to-indigo-700',
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 활성 배너 조회용 인덱스
CREATE INDEX idx_announcement_banners_active ON announcement_banners (is_active, sort_order)
  WHERE is_active = true;

-- RLS
ALTER TABLE announcement_banners ENABLE ROW LEVEL SECURITY;

-- 모든 유저가 활성 배너를 조회 가능
CREATE POLICY "Anyone can read active banners"
  ON announcement_banners FOR SELECT
  USING (is_active = true);

-- Service role만 CUD 가능 (API에서 admin 체크)
