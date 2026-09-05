-- Display-only fixtures missing from Betman. Never insert synthetic betting markets.
-- Existing posts/cache/poll game IDs intentionally have no Betman FK.
begin;
create table public.lfa_fixtures (
  id uuid primary key default gen_random_uuid(),
  lfa_match_id text not null unique,
  fixture jsonb not null,
  match_time timestamptz not null,
  betman_game_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lfa_fixture_identity check (
    jsonb_typeof(fixture) = 'object' and fixture ? 'lfaId'
    and jsonb_typeof(fixture->'lfaId') = 'string'
    and length(lfa_match_id) > 0 and fixture->>'lfaId' = lfa_match_id
  )
);
create index lfa_fixtures_match_time_idx on public.lfa_fixtures (match_time);
alter table public.lfa_fixtures enable row level security;
revoke all on public.lfa_fixtures from public, anon, authenticated;
grant select, insert, update on public.lfa_fixtures to service_role;
comment on table public.lfa_fixtures is
  '인기팀 LFA 전용 경기. ID는 표기/킥오프 변경 뒤에도 유지. 승부예측/정산과 분리.';
commit;
