-- 20260615_security_harden_rls_grants.sql
--
-- 보안 감사(2026-06-15) 후속 조치.
-- 배경: 브라우저는 공개 publishable key + Clerk JWT 로 PostgREST/RPC 를 직접 호출할 수 있다.
--       앱 API 는 전부 서비스 롤(RLS·컬럼권한 우회)로 동작하므로 이 변경의 영향을 받지 않고,
--       "API 를 건너뛰고 DB 로 직접 가는" 공격 경로만 차단한다.
--
-- 적용 후 확인(회귀 체크):
--   (1) 관리자 기자/전문가 인증 (/api/admin/users/certify-journalist · certify-expert) 정상
--   (2) 매일 토큰 리셋 cron (/api/cron/daily-token-reset) 정상
--   (3) 댓글 추천/추천취소 정상
--   (4) 기부 (/api/flair/donate) 정상
--
-- 롤백: 이 파일의 역(DROP→원복 / REVOKE→GRANT)으로 되돌릴 수 있음. 원본 정책 정의는
--       supabase/migrations/00000000000001_prod_schema.sql 참조.

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- [CRITICAL 1] award_points(): 브라우저에서 직접 호출 가능 + p_user_id 무검증.
--   → 자기 포인트 적립(보드 슬러그 바꿔 한도 우회) / 음수로 타인 포인트 드레인.
--   정상 호출은 전부 서버(서비스 롤). 클라 EXECUTE 권한 회수.
revoke execute on function public.award_points(text, text, integer, text, text, text)
  from public, anon, authenticated;

-- [CRITICAL 2] donate_flair_score_to_team(): 브라우저 직접 호출 가능 + p_user_id 무검증.
--   → 타인 활동점수를 임의 소비 / 경기장 순위 조작. /api/flair/donate(서비스 롤)만 사용.
revoke execute on function public.donate_flair_score_to_team(text, uuid, integer)
  from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- [CRITICAL 3] user_tokens: 클라가 자기 행의 token_balance 를 직접 UPDATE 가능 → 볼 무한 충전.
--   잔액 변경은 spend_tokens 등 SECURITY DEFINER RPC(서비스 롤)만 수행해야 함
--   (user_gold 와 동일 패턴 = 클라 UPDATE 정책 없음). SELECT 정책은 유지.
drop policy if exists "Users can update their own tokens" on public.user_tokens;

-- ───────────────────────────────────────────────────────────────────────────
-- [HIGH 4] comment_votes: INSERT/UPDATE/DELETE 가 (true) 라 user_id 를 위조 가능
--   → 타인 명의 투표 / 추천수 조작. post_votes 와 동일하게 호출자 sub 로 고정.
drop policy if exists "Authenticated users can insert comment votes" on public.comment_votes;
drop policy if exists "Users can update own comment votes" on public.comment_votes;
drop policy if exists "Users can delete own comment votes" on public.comment_votes;

create policy "comment_votes_insert_own" on public.comment_votes
  for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "comment_votes_update_own" on public.comment_votes
  for update to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);
create policy "comment_votes_delete_own" on public.comment_votes
  for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);
-- "Anyone can read comment votes" (SELECT) 는 그대로 유지.

-- ───────────────────────────────────────────────────────────────────────────
-- [HIGH 5] profiles: 클라가 role/is_journalist/is_expert/grade 를 직접 수정 가능
--   → 자가 기자/전문가 승격(권한 상승). (role 은 트리거로도 막혀 있으나 방어심화로 포함.)
--   /api/profile/me 는 이 컬럼들을 건드리지 않고, 인증/등급변경은 서비스 롤 경유 →
--   컬럼 단위 UPDATE 권한만 회수하면 정상 기능 영향 없음.
revoke update (role, is_journalist, is_expert, grade) on public.profiles
  from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- [MEDIUM 6] direct_messages: SELECT/INSERT/UPDATE 가 (true) → 전체 쪽지 열람 + sender 위조 + 변조.
--   본인이 보낸/받은 대화로 한정.
drop policy if exists "Users can insert messages" on public.direct_messages;
drop policy if exists "Users can update own messages" on public.direct_messages;
drop policy if exists "Users can view own messages" on public.direct_messages;

create policy "dm_insert_as_sender" on public.direct_messages
  for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = sender_id);
create policy "dm_select_own" on public.direct_messages
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') in (sender_id, receiver_id));
create policy "dm_update_own" on public.direct_messages
  for update to authenticated
  using ((select auth.jwt() ->> 'sub') in (sender_id, receiver_id))
  with check ((select auth.jwt() ->> 'sub') in (sender_id, receiver_id));

-- [MEDIUM 7] user_blocks: SELECT/INSERT/DELETE 가 (true) → 타인 차단목록 조작/열람.
--   본인(blocker)으로 한정.
drop policy if exists "Users can insert own blocks" on public.user_blocks;
drop policy if exists "Users can delete own blocks" on public.user_blocks;
drop policy if exists "Users can view own blocks" on public.user_blocks;

create policy "blocks_insert_own" on public.user_blocks
  for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = blocker_id);
create policy "blocks_select_own" on public.user_blocks
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = blocker_id);
create policy "blocks_delete_own" on public.user_blocks
  for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = blocker_id);

commit;
