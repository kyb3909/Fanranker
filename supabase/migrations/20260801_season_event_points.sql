-- 시즌 오픈 이벤트 활동 포인트 (2026-08-01, Phase 3)
--
-- 원장 테이블 없이 **계산식** — 활동 원천(슬립·글·댓글·받은 추천)에서 매번 계산한다
-- (슬립 귀속과 같은 철학). 삭제 회수 자동(deleted_at/행 삭제 필터), 수치 조정 소급 적용.
--
-- 적립 규칙 (docs/EVENT_SEASON_OPEN.md §1 표, KST 일 단위 상한):
--   승부예측 1회 +2 (일 10점 = 5회) — 종목·리그 무관, pending 포함 (자격은 활동이지 성적이 아님)
--   게시판 글   +10 (일 20점 = 2글)
--   댓글        +1  (일 5점)   — 매치데이 공식글 +2 가산은 공식글 체계 도입 후
--   받은 추천   +1  (일 10점)  — 글·댓글 up vote, 받은 날 기준
-- community_actions = 기간 내 미삭제 글+댓글 수 (응모 조건: 최소 3회).
--
-- ⚠️ service role 전용 — anon/authenticated REVOKE (경제 RPC 교훈: 재정의 시 재첨부).

create or replace function public.season_event_points(p_event_slug text, p_user_id text default null)
returns table(
  user_id text,
  total_points integer,
  prediction_points integer,
  post_points integer,
  comment_points integer,
  vote_points integer,
  community_actions integer
)
language sql
stable
security definer
set search_path = public
as $$
with ev as (
  select id, start_at, end_at from events where slug = p_event_slug
),
regs as (
  select r.user_id
  from event_registrations r, ev
  where r.event_id = ev.id
    and (p_user_id is null or r.user_id = p_user_id)
),
slip_days as (
  select s.user_id, least(count(*) * 2, 10)::int as pts
  from prediction_slips s, ev
  where s.user_id in (select regs.user_id from regs)
    and s.created_at >= ev.start_at and s.created_at <= ev.end_at
    and s.status in ('pending', 'won', 'lost')
  group by s.user_id, date_trunc('day', s.created_at + interval '9 hours')
),
post_days as (
  select p.user_id, least(count(*) * 10, 20)::int as pts, count(*)::int as cnt
  from posts p, ev
  where p.user_id in (select regs.user_id from regs)
    and p.created_at >= ev.start_at and p.created_at <= ev.end_at
    and p.deleted_at is null
  group by p.user_id, date_trunc('day', p.created_at + interval '9 hours')
),
comment_days as (
  select c.user_id, least(count(*), 5)::int as pts, count(*)::int as cnt
  from comments c, ev
  where c.user_id in (select regs.user_id from regs)
    and c.created_at >= ev.start_at and c.created_at <= ev.end_at
    and c.deleted_at is null
  group by c.user_id, date_trunc('day', c.created_at + interval '9 hours')
),
received_votes as (
  -- 내 글에 받은 up vote (글이 살아있을 때만)
  select p.user_id, v.created_at
  from post_votes v
  join posts p on p.id = v.post_id and p.deleted_at is null
  join ev on true
  where p.user_id in (select regs.user_id from regs)
    and v.vote_type = 'up'
    and v.created_at >= ev.start_at and v.created_at <= ev.end_at
    and v.user_id <> p.user_id
  union all
  -- 내 댓글에 받은 up vote
  select c.user_id, v.created_at
  from comment_votes v
  join comments c on c.id = v.comment_id and c.deleted_at is null
  join ev on true
  where c.user_id in (select regs.user_id from regs)
    and v.vote_type = 'up'
    and v.created_at >= ev.start_at and v.created_at <= ev.end_at
    and v.user_id <> c.user_id
),
vote_days as (
  select rv.user_id, least(count(*), 10)::int as pts
  from received_votes rv
  group by rv.user_id, date_trunc('day', rv.created_at + interval '9 hours')
)
select
  regs.user_id,
  (coalesce(sp.pts, 0) + coalesce(pp.pts, 0) + coalesce(cp.pts, 0) + coalesce(vp.pts, 0))::int as total_points,
  coalesce(sp.pts, 0)::int as prediction_points,
  coalesce(pp.pts, 0)::int as post_points,
  coalesce(cp.pts, 0)::int as comment_points,
  coalesce(vp.pts, 0)::int as vote_points,
  (coalesce(pp.cnt, 0) + coalesce(cp.cnt, 0))::int as community_actions
from regs
left join (select slip_days.user_id, sum(pts) pts from slip_days group by slip_days.user_id) sp on sp.user_id = regs.user_id
left join (select post_days.user_id, sum(pts) pts, sum(cnt) cnt from post_days group by post_days.user_id) pp on pp.user_id = regs.user_id
left join (select comment_days.user_id, sum(pts) pts, sum(cnt) cnt from comment_days group by comment_days.user_id) cp on cp.user_id = regs.user_id
left join (select vote_days.user_id, sum(pts) pts from vote_days group by vote_days.user_id) vp on vp.user_id = regs.user_id
$$;

revoke execute on function public.season_event_points(text, text) from public, anon, authenticated;
grant execute on function public.season_event_points(text, text) to service_role;
