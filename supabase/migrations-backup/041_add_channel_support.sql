-- 채널(하위 게시판) 지원을 위한 parent_slug 추가
-- parent_slug가 NULL이면 상위 카테고리, 값이 있으면 해당 카테고리의 하위 채널
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_slug text REFERENCES categories(slug);

-- 채널 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_categories_parent_slug ON categories (parent_slug) WHERE parent_slug IS NOT NULL;
