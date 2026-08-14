-- 시즌 이벤트 귀속: league_codes → sport='축구' (2026-08-14, 아스날 단독·전 리그 전환)
--
-- 배경: 이벤트가 "전 세계 모든 축구" 구조로 바뀌면서 두 가지가 충돌했다.
--  · events.league_codes 는 열려 있는 동안 메인 /prediction 풀에서 해당 리그를 제외한다
--    (이벤트 전용 풀 분리) — 새 구조에서는 풀을 가르지 않으므로 비워야 한다.
--  · 그런데 귀속 RPC(slip_count/slips_range)가 league_codes 로 슬립을 판정하므로
--    빈 배열이면 집계가 0 이 된다.
-- 해법: 귀속 판정을 prediction_slips.sport(슬립당 단일 종목 강제)로 교체한 뒤 비운다.
-- season_event_points 는 리그 무관(참여 포인트)이라 손대지 않는다.

create or replace function public.season_event_slip_count(p_event_slug text)
 returns integer
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select count(*)::integer
  from events e
  join event_registrations r on r.event_id = e.id
  join prediction_slips s on s.user_id = r.user_id
  where e.slug = p_event_slug
    and s.created_at >= e.start_at
    and s.created_at <= e.end_at
    and s.status in ('pending', 'won', 'lost')
    and s.sport = '축구'
    and exists (select 1 from betman_predictions bp where bp.slip_id = s.id)
$function$;

create or replace function public.season_event_slips_range(
  p_event_slug text,
  p_from timestamptz default null,
  p_to timestamptz default null
)
 returns table(user_id text, status text, stake integer, total_odds numeric, group_slug text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select s.user_id, s.status, s.stake, s.total_odds, g.slug as group_slug
  from events e
  join event_registrations r on r.event_id = e.id
  join event_groups g on g.id = r.group_id
  join prediction_slips s on s.user_id = r.user_id
  where e.slug = p_event_slug
    and s.created_at >= greatest(e.start_at, coalesce(p_from, e.start_at))
    and s.created_at <= least(e.end_at, coalesce(p_to, e.end_at))
    and s.status in ('won', 'lost')
    and s.sport = '축구'
    and exists (select 1 from betman_predictions bp where bp.slip_id = s.id)
$function$;

-- security definer 재정의 시 권한 재첨부 (프로젝트 규칙 — REVOKE 는 PUBLIC 기준이어야 실효)
revoke execute on function public.season_event_slip_count(text) from public, anon, authenticated;
revoke execute on function public.season_event_slips_range(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.season_event_slip_count(text) to service_role;
grant execute on function public.season_event_slips_range(text, timestamptz, timestamptz) to service_role;

-- 메인 풀 분리 해제 — 종전 값: {EPL,라리가,분데스리,세리에A,프리그1,UCL,UEL,UECL}
-- (되돌리려면 이 배열을 복원)
update events set league_codes = '{}' where slug = 'season-open-2026';
