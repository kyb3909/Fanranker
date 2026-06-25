-- 퍼온(OG 가져오기) 글의 출처 보존: 상세 페이지에서 "출처: <언론사> · 원문 보기 ↗" 링크 표시.
-- 기존엔 본문 평문 "출처: <siteName>" 만 남고 원본 URL 이 유실돼 클릭이 불가능했음.
-- 둘 다 nullable — 일반 글/기존 글은 NULL (직접 작성 글엔 영향 없음).
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_name text;
