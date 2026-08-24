-- 드래프트 게임 픽 기록 (2026-08-25)
--
-- 운영자: "사람들이 뽑은 데이터를 기반으로 순위 같은 걸 시각화해달라."
-- 종전 게임은 브라우저에서만 돌고 끝나면 아무것도 안 남았다 — 픽률·평균 픽 순서
-- 같은 우리 지표는 이 테이블이 쌓여야 나온다.
--
-- 쓰기: 완주 시 API(/api/draft/stats POST, service role)가 한 판 몫을 일괄 insert.
-- 읽기: 같은 라우트 GET 이 집계해서 돌려준다 (클라이언트 직접 접근 없음 → RLS 잠금).
create table if not exists draft_game_picks (
  id bigint generated always as identity primary key,
  draft_id uuid not null,
  game_slug text not null,
  player_id text not null,
  -- 그 좌석의 몇 번째 픽인가 (1~11). 전체 순번이 아니라 라운드를 쓰는 이유:
  -- 참가 인원(2~4)에 따라 전체 순번의 의미가 달라진다 — 라운드는 항상 비교 가능.
  round smallint not null check (round between 1 and 30),
  -- 전체 스네이크 순번 (1~44). 참고용.
  pick_no smallint not null check (pick_no between 1 and 120),
  -- 사람 픽만 집계 기본값. AI 픽도 남겨는 둔다 (페르소나 편향 분석용).
  picked_by text not null check (picked_by in ('human', 'ai')),
  created_at timestamptz not null default now()
);

create index if not exists idx_draft_picks_slug_player on draft_game_picks (game_slug, player_id);
create index if not exists idx_draft_picks_slug_draft on draft_game_picks (game_slug, draft_id);

-- service role 전용 — anon/authenticated 는 API 를 통해서만
alter table draft_game_picks enable row level security;
revoke all on draft_game_picks from anon, authenticated;

-- 픽 집계 RPC — 사람 픽 기준. 판수 + 선수별 픽수/평균 라운드를 한 호출로.
create or replace function draft_pick_stats(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'games', (
      select count(distinct draft_id) from draft_game_picks
      where game_slug = p_slug and picked_by = 'human'
    ),
    'players', coalesce((
      select jsonb_object_agg(player_id, jsonb_build_object(
        'picks', picks, 'avgRound', avg_round
      ))
      from (
        select player_id, count(*) as picks, round(avg(round)::numeric, 1) as avg_round
        from draft_game_picks
        where game_slug = p_slug and picked_by = 'human'
        group by player_id
      ) t
    ), '{}'::jsonb)
  )
$$;

revoke all on function draft_pick_stats(text) from public, anon, authenticated;
