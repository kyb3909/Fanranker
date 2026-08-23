-- 날짜별 LFA 경기 목록 영구 캐시 (2026-08-24)
--
-- `match_details_cache` 와 같은 이유인데 이쪽이 더 급하다. 하루치 목록은 **모든 해석의
-- 앞단**이라 이게 비면 경기 매칭(resolveMatch)이 막히고 라인업·스탯·타임라인·불판이
-- 한꺼번에 죽는다. 그런데 응답이 913KB(하루 800경기)라 가장 느리고 가장 자주 실패한다.
--
-- payload 는 화면이 실제로 쓰는 필드만 담는다 (로고·부가정보 제외).
create table if not exists public.lfa_day_cache (
  date_utc    text primary key,
  payload     jsonb       not null,
  match_count integer     not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.lfa_day_cache enable row level security;
revoke all on public.lfa_day_cache from anon, authenticated;
