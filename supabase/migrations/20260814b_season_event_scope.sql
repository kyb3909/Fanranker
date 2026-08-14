-- 이번 이벤트 집계 범위 확정 (2026-08-14, 운영자 확정 2건)
--  ① "참가 신청 이후에 참여 가능" → 신청 시각(registered_at) 이후 슬립만 인정
--  ② "이전 대회 기록은 제거, 이번 이벤트 판만" → 슬립의 event_id 를 명시적으로 본다
--     (기간·종목 필터만 믿으면 이벤트가 겹칠 때 샌다). 메인 풀은 event_id null 이고
--     그게 이번 레이스의 경기장이다.
-- TS 쪽 동일 규칙: lib/event/gunners-season.ts computeRaceStanding

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
    and s.created_at >= greatest(e.start_at, r.registered_at)
    and s.created_at <= e.end_at
    and s.status in ('pending', 'won', 'lost')
    and s.sport = '축구'
    and (s.event_id is null or s.event_id = e.id)
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
    and s.created_at >= greatest(e.start_at, r.registered_at, coalesce(p_from, e.start_at))
    and s.created_at <= least(e.end_at, coalesce(p_to, e.end_at))
    and s.status in ('won', 'lost')
    and s.sport = '축구'
    and (s.event_id is null or s.event_id = e.id)
    and exists (select 1 from betman_predictions bp where bp.slip_id = s.id)
$function$;

-- security definer 재정의 → 권한 재첨부 (REVOKE 는 PUBLIC 기준이어야 실효)
revoke execute on function public.season_event_slip_count(text) from public, anon, authenticated;
revoke execute on function public.season_event_slips_range(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.season_event_slip_count(text) to service_role;
grant execute on function public.season_event_slips_range(text, timestamptz, timestamptz) to service_role;
