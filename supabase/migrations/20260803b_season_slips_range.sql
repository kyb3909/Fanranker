-- 주간 범위 성적 집계 — 크리에이터 주간 맞대결의 전제.
--
-- 기존 season_event_slips 는 인자가 이벤트 슬러그 하나뿐이라 **이벤트 시작부터 누적**만
-- 낼 수 있었다. 그래서 매주 월요일 스냅샷도 "그 주 성적"이 아니라 누적 순위를 찍고 있었다.
--
-- 새 구조(2026-08-03 확정)는 두 크리에이터가 **주 단위로** 맞붙고 이긴 쪽 팬덤에서
-- 유니폼이 나간다. 누적으로 판정하면 1주차 승자가 계속 이겨서 2~4주차의 긴장이 죽는다
-- → 기간을 지정할 수 있어야 한다.
--
-- 원본은 이 함수로 위임시켜 쿼리를 한 곳에만 둔다(리그 필터·정산 조건이 두 벌이 되면
-- 반드시 어긋난다). CREATE OR REPLACE 라 기존 GRANT(service_role 전용)는 유지된다.

create or replace function public.season_event_slips_range(
  p_event_slug text,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table(user_id text, status text, stake integer, total_odds numeric, group_slug text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.user_id, s.status, s.stake, s.total_odds, g.slug as group_slug
  from events e
  join event_registrations r on r.event_id = e.id
  join event_groups g on g.id = r.group_id
  join prediction_slips s on s.user_id = r.user_id
  where e.slug = p_event_slug
    -- 이벤트 기간과 요청 구간의 교집합. 인자가 NULL 이면 이벤트 전 기간(= 기존 동작)
    and s.created_at >= greatest(e.start_at, coalesce(p_from, e.start_at))
    and s.created_at <= least(e.end_at, coalesce(p_to, e.end_at))
    and s.status in ('won', 'lost')
    and exists (select 1 from betman_predictions bp where bp.slip_id = s.id)
    and not exists (
      select 1
      from betman_predictions bp
      join betman_games bg on bg.id = bp.game_id
      where bp.slip_id = s.id
        and not (bg.league_code = any(e.league_codes))
    )
$function$;

-- ⚠️ PUBLIC 회수만으론 부족하다. Supabase 는 public 스키마의 새 함수에 anon·authenticated 로
--    **직접** EXECUTE 를 부여한다(기본 권한). 실제로 이 마이그레이션 1차 적용 직후
--    anon 이 실행 가능한 상태였다 — SECURITY DEFINER 라 비로그인도 전 참가자 슬립을
--    조회할 수 있었다. 셋 다 명시적으로 회수할 것.
--    (20260728 이 남긴 교훈의 역방향 사례: 거기선 PUBLIC 이 문제, 여기선 직접 부여가 문제)
revoke all on function public.season_event_slips_range(text, timestamptz, timestamptz) from public;
revoke all on function public.season_event_slips_range(text, timestamptz, timestamptz) from anon;
revoke all on function public.season_event_slips_range(text, timestamptz, timestamptz) from authenticated;
grant execute on function public.season_event_slips_range(text, timestamptz, timestamptz) to service_role;

-- 기존 함수는 범위 없는 호출로 위임 (동작 동일, 쿼리는 한 곳)
create or replace function public.season_event_slips(p_event_slug text)
returns table(user_id text, status text, stake integer, total_odds numeric, group_slug text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select * from public.season_event_slips_range(p_event_slug, null, null)
$function$;
