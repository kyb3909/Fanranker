-- pg_cron 잡 6종 채록 (2026-08-08 감사 P2-1).
--
-- 이 6개 잡은 DB에 직접 등록만 돼 있고 리포에 정의가 없었다 — DB 재구축 시 자동
-- 복원 불가·리뷰 불가 드리프트. 라이브 `cron.job` 실측(2026-08-08, jobid 1~6)을
-- 그대로 채록해 리포를 정본으로 만든다.
--
-- cron.schedule(jobname, …) 은 같은 이름이 있으면 갱신(upsert)이라 재적용 안전.
-- 명령에 시크릿 없음 확인 완료 — watchdog 트리거도 Content-Type 헤더뿐이다
-- (Edge Function 이 verify_jwt=false 라 무인증 호출 허용, 시크릿은 Edge env 주입).
-- Edge Function 소스는 supabase/functions/betman-sync-watchdog/ 에 함께 회수됨.

-- betman 동기화 헬스 체크 (30분)
SELECT cron.schedule(
  'betman-sync-health-check',
  '*/30 * * * *',
  'SELECT public.betman_check_sync_health()'
);

-- betman watchdog Edge Function 트리거 (매시 :15)
SELECT cron.schedule(
  'betman-edge-watchdog-trigger',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ekysrlhdrapmsnrkytif.supabase.co/functions/v1/betman-sync-watchdog',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{"action": "check"}'::jsonb
  )
  $$
);

-- 온도 큐 소비 (매분, 50건)
SELECT cron.schedule(
  'process-temperature-queue',
  '* * * * *',
  'SELECT process_temperature_queue(50)'
);

-- 만료 온도 리셋 (매일 04:00 UTC)
SELECT cron.schedule(
  'reset-old-temperatures',
  '0 4 * * *',
  'SELECT reset_expired_temperatures(7)'
);

-- 유저 온도 전체 재계산 (매일 05:00 UTC)
SELECT cron.schedule(
  'recalc-user-temperatures',
  '0 5 * * *',
  'SELECT recalc_all_user_temperatures()'
);

-- 활성 글 온도 갱신 (5분)
SELECT cron.schedule(
  'update-post-temperatures',
  '*/5 * * * *',
  'SELECT update_active_post_temperatures()'
);
