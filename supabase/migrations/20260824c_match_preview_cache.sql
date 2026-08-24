-- 경기 프리뷰(심판·결장자·최근 폼·상대 전적) 영구 캐시 (2026-08-24 크레딧 감사)
--
-- 이 묶음은 **호출당 3크레딧**(h2h + injuries + officials)이라 LFA 에서 가장 비싸다.
-- 그런데 종전 캐시가 `unstable_cache` 뿐이라 **배포마다 초기화**됐다 — 배포가 잦은 날에는
-- 매치 페이지를 열 때마다 3크레딧이 다시 나갔다.
--
-- 신선도: 킥오프가 지났으면 영구(심판·전적은 굳는다) / 그 전이면 6시간.
create table if not exists public.match_preview_cache (
  lfa_match_id text primary key,
  payload      jsonb       not null,
  settled      boolean     not null default false,
  updated_at   timestamptz not null default now()
);

create index if not exists match_preview_cache_stale_idx
  on public.match_preview_cache (settled, updated_at);

alter table public.match_preview_cache enable row level security;
revoke all on public.match_preview_cache from anon, authenticated;
