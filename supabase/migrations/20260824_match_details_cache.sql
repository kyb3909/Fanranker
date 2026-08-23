-- 경기 상세 영구 캐시 (2026-08-24)
--
-- ## 왜
-- 지금까지 매치센터는 **사용자가 페이지를 여는 순간** LFA 를 불렀다. LFA 는 서버 캐시가
-- 비면 수십 초가 걸리고(실측 matches 46초 / details 120초 초과), 우리 `unstable_cache` 는
-- 배포할 때마다 초기화된다. 그래서 "라인업이 안 뜬다 / 통계가 비었다 / 스코어가 없다"가
-- 반복됐다 — 화면이 외부 API 의 그날 컨디션에 직접 매달려 있었다.
--
-- 이 표에 적재해 두면 화면은 DB 만 읽는다(수 ms). LFA 가 느리거나 죽어도 **마지막으로 받은
-- 값**을 내준다. 빈 화면보다 조금 낡은 값이 낫다.
create table if not exists public.match_details_cache (
  game_id     text primary key,
  lfa_match_id text,
  -- LfaMatchInfo 통째 (스코어·경기분·스탯·타임라인)
  payload     jsonb       not null,
  -- 종료된 경기는 값이 굳는다 → 다시 부르지 않는다
  finished    boolean     not null default false,
  updated_at  timestamptz not null default now()
);

-- cron 이 "오래된 것부터" 고르는 경로
create index if not exists match_details_cache_stale_idx
  on public.match_details_cache (finished, updated_at);

alter table public.match_details_cache enable row level security;

-- 서버(service role)만 읽고 쓴다. 클라이언트는 이 표를 직접 안 본다.
revoke all on public.match_details_cache from anon, authenticated;
