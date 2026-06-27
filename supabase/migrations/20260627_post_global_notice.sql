-- 전체 공지(사이트 전역) — 담벼락(홈) 최상단 고정용.
-- 게시판별 is_notice 와 별개. 관리자(profiles.role='admin')만 설정.
ALTER TABLE "public"."posts"
  ADD COLUMN IF NOT EXISTS "is_global_notice" boolean DEFAULT false;

-- 담벼락 상단 고정 글 조회용 부분 인덱스 (활성 전체공지만)
CREATE INDEX IF NOT EXISTS "idx_posts_global_notice"
  ON "public"."posts" USING btree ("created_at" DESC)
  WHERE ("is_global_notice" = true AND "deleted_at" IS NULL);
