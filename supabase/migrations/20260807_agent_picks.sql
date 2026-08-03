-- 에이전트 판단 저장소 (2026-08-04) — 편집장 에이전트의 히어로 선정 등,
-- "에이전트가 내린 판단 + 근거"를 kind 별로 1행씩 보관. 근거 없는 자동 행동
-- 금지 원칙의 물리적 구현 — payload 에 반드시 이유가 함께 담긴다.
create table if not exists public.agent_picks (
  kind       text primary key,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.agent_picks enable row level security;
-- 정책 0개 = service role 전용
