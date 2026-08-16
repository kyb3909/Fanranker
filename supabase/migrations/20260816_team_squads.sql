-- 팀 스쿼드 사전 (2026-08-16)
-- soccerway 팀 페이지 스쿼드(영문) × 나무위키 스쿼드 표(한글명) 대조로 채우는 선수 한글화 테이블.
-- 라인업 한글화가 로마자 추측 매칭 대신 선수 id 정확 매칭을 할 수 있게 하는 기반.
-- 쓰기는 service role 전용 (수확 스크립트 + 어드민).

create table if not exists team_squads (
  soccerway_team_id text not null references team_dictionary (soccerway_team_id) on delete cascade,
  player_id text not null,          -- soccerway 선수 해시 (예: EgIM3sB7)
  player_slug text not null,        -- 예: saliba-william
  name_en text not null,            -- soccerway 표기 (성 이름 순)
  name_kr text,                     -- 한글명 (null = 대조 실패, 검수 대기)
  jersey_number int,
  position text,                    -- GK / DF / MF / FW / COACH
  status text not null default 'proposed' check (status in ('proposed','confirmed','rejected')),
  source text not null default 'namu',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (soccerway_team_id, player_id)
);

create index if not exists team_squads_slug_idx on team_squads (player_slug);

alter table team_squads enable row level security;
-- 정책 없음 = anon/authenticated 접근 불가, service role 만.
