-- pg_cron 잡 채록: 실행 로그 보존 90일 (2026-09-04)
--
-- cron_run_log(20만 행·39MB, 하루 ~1,500행)·crawler_run_log(13만 행·48MB) 는 정리 경로가 없어
-- 무한히 자랐다. 읽는 쪽(관제실·심박 감시·크롤러 마지막 성공 조회)은 전부 최근 며칠만 본다.
-- 90일이면 어떤 소비자에도 닿지 않는다. 매일 03:20 KST (18:20 UTC).
--
-- ⚠️ 정본은 DB 의 cron.job 이다 (docs/PG_CRON_JOBS.md). cron.schedule 은 같은 이름 upsert 라 재적용 안전.
select cron.schedule(
  'cleanup-run-logs',
  '20 18 * * *',
  $$delete from public.cron_run_log where started_at < now() - interval '90 days'; delete from public.crawler_run_log where started_at < now() - interval '90 days';$$
);
