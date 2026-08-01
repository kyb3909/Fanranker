-- 데일리 치킨 추첨 기록 (2026-08-01, 설계 §2b)
--
-- 매일 밤 23:10 KST cron 이 "그날 댓글 쓴 이벤트 참가자" 중 1명을 추첨해 기록.
-- 집계 창 = 전일 23:00 ~ 당일 23:00 KST (경계 명확 — 누락 댓글 없음).
-- draw_date = 집계 창이 끝나는 날(KST). unique 로 중복 추첨 방지 (cron 재실행 안전).

create table if not exists public.season_chicken_draws (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  draw_date date not null,
  user_id text not null,
  /** 응모자 수·당첨자 댓글 수 — 발표 문구와 검수용 */
  entrant_count integer not null,
  winner_comment_count integer not null,
  announced_post_id uuid,
  created_at timestamptz not null default now(),
  unique (event_id, draw_date)
);

alter table public.season_chicken_draws enable row level security;

-- 읽기: 공개 (당첨 발표는 공개 정보). 쓰기: service role 전용 (정책 없음).
drop policy if exists "season_chicken_draws_public_read" on public.season_chicken_draws;
create policy "season_chicken_draws_public_read" on public.season_chicken_draws
  for select using (true);
