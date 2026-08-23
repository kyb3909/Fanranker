-- LFA 팀명 사전 (2026-08-24) — betman 한글명 → LFA 영문 축약명·팀 id
-- 왜 team_dictionary 를 안 쓰나: 그쪽 PK 가 soccerway_team_id 라 soccerway 에 없는 팀은
-- 행을 만들 수 없다. LFA 경기 대조는 영문명만 있으면 되므로 별도 사전으로 둔다.
-- (2026-08-23 실사고: 브라이턴·본머스가 team_dictionary 에 없어 한글이 그대로 대조에
--  들어갔고, 토큰화가 한글을 지워 매칭이 무조건 실패 → 그 경기 라인업·스탯·불판 전멸)
create table if not exists public.lfa_team_names (
  name_kr text primary key,
  name_en text not null,
  lfa_team_id text,
  source text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lfa_team_names enable row level security;
-- 서비스롤 전용 — 정책 없음 = anon 접근 불가
