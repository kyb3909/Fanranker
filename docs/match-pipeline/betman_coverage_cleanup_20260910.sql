-- 운영자 검토·수동 실행용 SQL. Codex는 실행하지 않았다. 마이그레이션이 아니다.
-- 대상: 2026-09-10 KST 01:45 바르셀로나–페예노르트,
--       04:00 나폴리–아스널 / 리버풀–아틀레티코 / 첼시–리즈.
-- 9/7 유베–밀란, 9/9 UCL 3경기는 날짜 필터로 제외하며 기존 정체성을 유지한다.

-- 1. 사전 확인: 아래 시간대의 연결된 LFA 행을 확인하고 위 네 경기의 UUID만 고른다.
--    deleted_at 등으로 글/폴을 제외하지 않는다. lfa_ match_key 폴도 함께 확인한다.
select f.id as lfa_uuid, f.lfa_match_id, f.betman_game_id,
       f.match_time at time zone 'Asia/Seoul' as kickoff_kst,
       f.fixture->>'homeTeamEn' as home_team_en,
       f.fixture->>'awayTeamEn' as away_team_en,
       b.home_team_name as betman_home, b.away_team_name as betman_away,
       (select jsonb_agg(jsonb_build_object('id', p.id, 'match_game_id', p.match_game_id))
        from public.posts p where p.match_game_id = f.id) as posts,
       (select jsonb_agg(jsonb_build_object('id', p.id, 'game_id', p.game_id, 'match_key', p.match_key))
        from public.polls p
        where p.game_id = f.id::text or p.match_key = 'lfa_' || f.lfa_match_id) as polls
from public.lfa_fixtures f
join public.betman_games b on b.id = f.betman_game_id
where f.match_time in (timestamptz '2026-09-10 01:45:00+09', timestamptz '2026-09-10 04:00:00+09')
order by f.match_time, f.id;

-- 2. 삭제 제안: 사전 확인한 네 경기 중 posts/polls가 모두 NULL인 UUID만
--    아래 빈 배열에 'UUID' 형식으로 넣는다. 빈 배열 그대로면 삭제 0건이다.
--    삭제 순간에도 참조를 재확인한다. concurrent posts/polls 쓰기는 트랜잭션 동안 대기한다.
--    BEGIN~COMMIT을 한 트랜잭션으로 실행한다. RETURNING을 보고 취소하려면 COMMIT 대신 ROLLBACK.
begin;
lock table public.lfa_fixtures, public.posts, public.polls in share row exclusive mode;
with approved_ids(id) as (
  select unnest(array[]::uuid[]) -- 운영자가 확인한 UUID 최대 4개를 직접 기입
)
delete from public.lfa_fixtures f
using approved_ids a
where f.id = a.id
  and (select count(*) from approved_ids) <= 4
  and f.betman_game_id is not null
  and exists (select 1 from public.betman_games b where b.id = f.betman_game_id)
  and f.match_time in (timestamptz '2026-09-10 01:45:00+09', timestamptz '2026-09-10 04:00:00+09')
  and not exists (select 1 from public.posts p where p.match_game_id = f.id)
  and not exists (
    select 1 from public.polls p
    where p.game_id = f.id::text or p.match_key = 'lfa_' || f.lfa_match_id
  )
returning f.id, f.lfa_match_id, f.betman_game_id, f.match_time;
commit;
