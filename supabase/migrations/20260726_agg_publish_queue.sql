-- 발행 분산 큐 (F17): 검수 페이지 "발행" = 즉시 게시가 아니라 approved + scheduled_at 예약.
-- Vercel cron(/api/cron/agg-publish-queue, 10분)이 시각 도래분을 순차 게시 —
-- 관리자가 몰아서 검수해도 담벼락에는 20~60분 랜덤 간격으로 자연스럽게 분산된다.
ALTER TABLE public.agg_reservoir
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

CREATE INDEX IF NOT EXISTS agg_reservoir_queue_idx
  ON public.agg_reservoir (scheduled_at)
  WHERE status = 'approved';
