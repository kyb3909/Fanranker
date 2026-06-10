-- ============================================================
-- standings_cache RLS 활성화
-- ------------------------------------------------------------
-- Supabase advisor 가 standings_cache 테이블에 RLS 미적용을 경고.
-- standings 데이터는 공개 정보 (리그 순위) 라 read 는 누구나 허용,
-- write 는 cron / service role 만 가능하도록 제한.
-- ============================================================

ALTER TABLE standings_cache ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능 (공개 리그 순위 데이터)
DROP POLICY IF EXISTS "standings_cache_public_read" ON standings_cache;
CREATE POLICY "standings_cache_public_read"
  ON standings_cache FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE 정책은 만들지 않음 →
-- service_role(BYPASSRLS) 외 모든 클라이언트는 쓰기 차단.
-- 갱신은 /api/cron/standings/ingest 에서 service role 로 수행.
