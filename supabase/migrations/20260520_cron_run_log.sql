-- ============================================================
-- cron_run_log — Vercel cron 통합 실행 로그
-- ============================================================
-- 각 cron route 가 withCronLog 래퍼로 실행 결과를 1건씩 기록.
-- 어드민 시스템 모니터가 job 별 last_run / status / duration / error 를 한 화면에 표시.
-- service role 만 접근 (RLS enable + 정책 없음 → anon/authenticated 차단).
-- ============================================================

CREATE TABLE IF NOT EXISTS cron_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'error')),
  http_status int,
  error_message text,
  duration_ms int,
  started_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_run_log_job
  ON cron_run_log(job_name, started_at DESC);

ALTER TABLE cron_run_log ENABLE ROW LEVEL SECURITY;
