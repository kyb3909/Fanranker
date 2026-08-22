-- MoTM(맨오브더매치) 폴 — polls 인프라 재사용 (2026-08-22)
-- 운영자 지시: 후보는 2택이 아니라 "출전 선수 전원" 중 1인 선택.
-- 폴 자체(options jsonb·poll_votes·투표 API)는 기존 그대로 쓰고, "경기 연결" 축만 더한다.
--
-- kind: 'general'(사이드바 설문) / 'motm'. VS 쟁점 폴은 post_id 로 이미 구분되므로 그대로 둔다.
-- match_key: betman 경기 키 `${home}_${away}_${match_time}` — 마켓별 중복 행(같은 경기가
--            소수핸디캡/언더오버 행으로 존재)이 폴을 두 개로 가르는 것을 unique 로 차단.
-- game_id:   라인업 스냅샷을 읽은 대표 betman_games.id (역추적용, 조회 키는 match_key).
alter table public.polls add column if not exists kind text not null default 'general';
alter table public.polls add column if not exists match_key text;
alter table public.polls add column if not exists game_id text;

create unique index if not exists idx_polls_motm_match_key
  on public.polls (match_key) where kind = 'motm';
create index if not exists idx_polls_kind_active
  on public.polls (kind, is_active) where kind <> 'general';
