-- 미니게임 (corner-hero / pass-survivor / rondo) 점수 기록 + 오늘의 순위
-- 클라이언트 직접 접근 차단 (RLS enable + no policy) — /api/minigames/* service role 경유만.

create table if not exists minigame_scores (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  game text not null check (game in ('corner-hero', 'pass-survivor', 'rondo')),
  score integer not null check (score >= 0 and score <= 1000000),
  created_at timestamptz not null default now()
);

create index if not exists idx_minigame_scores_game_created
  on minigame_scores (game, created_at desc);

alter table minigame_scores enable row level security;
-- policy 없음 = anon/authenticated 전부 차단. service role 은 RLS bypass.

-- 오늘(KST) 게임별 유저 최고점 TOP N
create or replace function get_minigame_daily_leaderboard(p_game text, p_limit int default 10)
returns table (user_id text, nickname text, best_score int, plays int)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, p.nickname, max(s.score)::int as best_score, count(*)::int as plays
  from minigame_scores s
  join profiles p on p.user_id = s.user_id
  where s.game = p_game
    and s.created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
  group by s.user_id, p.nickname
  order by best_score desc, min(s.created_at) asc
  limit p_limit
$$;

-- security definer 기본 public 실행권 제거 — service role 경유만
revoke execute on function get_minigame_daily_leaderboard(text, int) from public, anon, authenticated;
