-- 말머리 즐겨찾기/뮤트 (담벼락 개인화, 2026-06-25)
--
-- 담벼락(홈 피드)은 팔로우한 게시판의 모든 글이 섞여 올라온다(예: 축구 → 아스날·맨유·
-- 리버풀…). 아스날 팬이 아스날 말머리만 보거나(favorite), 보기 싫은 팀을 숨기게(mute)
-- 하기 위한 사용자별 말머리 선호 저장.
--
-- 필터 적용은 /api/posts 의 only_flairs / exclude_flairs URL 파라미터로 하므로
-- (CDN 캐시 유지) 이 테이블은 클라이언트가 자기 prefs 를 조회/토글하는 용도.

create table if not exists public.user_flair_prefs (
  user_id text not null,
  flair_id uuid not null references public.post_flairs(id) on delete cascade,
  pref text not null check (pref in ('favorite', 'mute')),
  created_at timestamptz not null default now(),
  primary key (user_id, flair_id)
);

create index if not exists idx_user_flair_prefs_user on public.user_flair_prefs(user_id);

alter table public.user_flair_prefs enable row level security;

-- 본인 행만. API 는 service role 로 우회하지만 직접 접근 방어층으로 RLS 유지.
create policy "user_flair_prefs_select_own" on public.user_flair_prefs
  for select using ((select auth.jwt() ->> 'sub') = user_id);
create policy "user_flair_prefs_insert_own" on public.user_flair_prefs
  for insert with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "user_flair_prefs_update_own" on public.user_flair_prefs
  for update using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "user_flair_prefs_delete_own" on public.user_flair_prefs
  for delete using ((select auth.jwt() ->> 'sub') = user_id);

grant select, insert, update, delete on public.user_flair_prefs to authenticated;
