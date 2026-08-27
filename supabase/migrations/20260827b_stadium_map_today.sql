-- 경기장 지도: "오늘 쌓인 벽돌" 집계 (2026-08-27)
--
-- 지도 진입마다 팀별 최근 24시간 벽돌 합을 읽는다. 전 사이트가 무캐시 SSR 이라
-- 진입 = DB 조회다 — stadium_bricks 를 매번 풀스캔하면 벽돌이 쌓일수록 지도가
-- 느려진다. 부분 인덱스로 최근 구간만 훑게 하고, 화면은 이 함수만 부른다.
-- (프론트에서 재계산 금지 — 단가·집계가 두 곳으로 갈리는 걸 막는다)

create index if not exists stadium_bricks_created_at_idx
  on public.stadium_bricks (created_at desc, team_id);

create or replace function public.stadium_bricks_today()
returns table (team_id text, bricks bigint)
language sql
stable
security definer
set search_path = public
as $$
  select b.team_id, sum(b.brick_count)::bigint
  from public.stadium_bricks b
  where b.created_at > now() - interval '24 hours'
  group by b.team_id
$$;

-- 공개 집계다 (팀별 합계뿐 — 개인 식별 정보 없음). 비로그인도 지도를 보므로 anon 허용.
-- ⚠️ CREATE OR REPLACE 는 붙여둔 GRANT/REVOKE 를 날린다 — 재정의할 때 이 블록도 같이 옮길 것.
revoke all on function public.stadium_bricks_today() from public;
grant execute on function public.stadium_bricks_today() to anon, authenticated, service_role;
