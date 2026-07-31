-- 시즌 오픈 이벤트 성적 집계 (2026-07-31, Phase 2)
--
-- 슬립 귀속 = 쓰기 시점 event_id 세팅이 아니라 **집계 시점 동적 귀속**:
--   등록자(event_registrations)의 이벤트 기간 내 슬립 중, 슬립의 모든 게임이
--   events.league_codes(EPL)에 속하는 것만 이벤트 성적으로 인정.
--   유저는 평소처럼 /prediction 에서 예측만 하면 되고(마찰 0), 규칙 변경 시
--   소급 재계산이 가능하다.
--
-- ⚠️ 함수는 service role 전용 — anon/authenticated 실행 회수 필수
--   (2026-07-18 경제 RPC anon 구멍 교훈: 함수 재정의 시 REVOKE 재첨부).

-- 정산 슬립 (예측력 집계용 — won/lost 만)
create or replace function public.season_event_slips(p_event_slug text)
returns table(user_id text, status text, stake integer, total_odds numeric, group_slug text)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, s.status, s.stake, s.total_odds, g.slug as group_slug
  from events e
  join event_registrations r on r.event_id = e.id
  join event_groups g on g.id = r.group_id
  join prediction_slips s on s.user_id = r.user_id
  where e.slug = p_event_slug
    and s.created_at >= e.start_at
    and s.created_at <= e.end_at
    and s.status in ('won', 'lost')
    -- 슬립에 게임이 있고, 전부 이벤트 리그(EPL)여야 인정
    and exists (select 1 from betman_predictions bp where bp.slip_id = s.id)
    and not exists (
      select 1
      from betman_predictions bp
      join betman_games bg on bg.id = bp.game_id
      where bp.slip_id = s.id
        and not (bg.league_code = any(e.league_codes))
    )
$$;

-- 누적 예측 수 (실시간 노출용 — pending 포함, cancelled 제외)
create or replace function public.season_event_slip_count(p_event_slug text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from events e
  join event_registrations r on r.event_id = e.id
  join prediction_slips s on s.user_id = r.user_id
  where e.slug = p_event_slug
    and s.created_at >= e.start_at
    and s.created_at <= e.end_at
    and s.status in ('pending', 'won', 'lost')
    and exists (select 1 from betman_predictions bp where bp.slip_id = s.id)
    and not exists (
      select 1
      from betman_predictions bp
      join betman_games bg on bg.id = bp.game_id
      where bp.slip_id = s.id
        and not (bg.league_code = any(e.league_codes))
    )
$$;

revoke execute on function public.season_event_slips(text) from public, anon, authenticated;
revoke execute on function public.season_event_slip_count(text) from public, anon, authenticated;
grant execute on function public.season_event_slips(text) to service_role;
grant execute on function public.season_event_slip_count(text) to service_role;

-- 주간 스냅샷에 예측력 점수·표본 수 저장 (월드컵 스냅샷 테이블 재사용 확장)
alter table public.event_leaderboard_snapshots
  add column if not exists skill_score numeric,
  add column if not exists settled_slips integer;
