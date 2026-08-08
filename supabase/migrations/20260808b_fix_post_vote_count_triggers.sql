-- 비추천 미반영 실사고 수리 (2026-08-08 전수 감사 P0-1).
--
-- post_votes 에 vote_count 트리거가 2중 등록돼 있었다:
--   trg_post_vote_count      → recalc_post_vote_count()  = up − down (정본)
--   trg_sync_post_vote_count → sync_post_vote_count()    = up 만 카운트
-- Postgres 는 같은 이벤트의 트리거를 이름 알파벳순으로 실행하므로 sync 가 나중에
-- recalc 결과를 덮어썼다 → down 투표가 vote_count 에 반영되지 않음 (라이브 실측:
-- 비추 1개 받은 글 3건이 전부 vote_count=0). computeTemperature 의 비추 패널티도
-- 이 값에 의존하므로 함께 죽어 있었다.
--
-- 수리: 정본은 recalc 하나로 통일. sync 가 겸하던 온도 큐 적재(enqueue)는 이름이
-- 하는 일과 일치하는 전용 트리거로 분리해 유지한다 (투표 시 직접 재계산 트리거
-- trg_update_temp_after_vote 와 별개 — 큐 경로는 pg_cron 배치가 소비).

DROP TRIGGER IF EXISTS trg_sync_post_vote_count ON public.post_votes;
DROP FUNCTION IF EXISTS public.sync_post_vote_count();

CREATE OR REPLACE FUNCTION public.enqueue_temp_on_post_vote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  target_post_id uuid;
BEGIN
  target_post_id := COALESCE(NEW.post_id, OLD.post_id);
  PERFORM enqueue_temperature_update(target_post_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_enqueue_temp_on_post_vote
AFTER INSERT OR DELETE OR UPDATE ON public.post_votes
FOR EACH ROW EXECUTE FUNCTION public.enqueue_temp_on_post_vote();

-- 잘못 기록된 vote_count 소급 재계산 (투표가 있는 글만 — 투표 0개인 글은
-- 마지막 DELETE 시점에 두 트리거 모두 0 을 기록해 이미 정확하다)
UPDATE public.posts p
SET vote_count = sub.correct
FROM (
  SELECT post_id,
         COUNT(*) FILTER (WHERE vote_type = 'up')
       - COUNT(*) FILTER (WHERE vote_type = 'down') AS correct
  FROM public.post_votes
  GROUP BY post_id
) sub
WHERE p.id = sub.post_id
  AND p.vote_count IS DISTINCT FROM sub.correct;
