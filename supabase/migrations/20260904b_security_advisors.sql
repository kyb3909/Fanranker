-- 보안 권고 정리 (2026-09-04, Supabase advisors 실측 기준)
--
-- ① search_path 미고정 함수 25개 — search_path 를 public 으로 고정한다. 전부 public 스키마의
--    테이블만 참조하므로 동작은 같고, 호출자가 search_path 를 바꿔 다른 스키마의 동명 객체를
--    끼워 넣는 경로만 막힌다.
-- ② anon 이 실행할 수 있는 SECURITY DEFINER 함수 3개 중
--    · increment_post_view_count — /api/posts/[id]/view 가 비로그인 조회수용으로 부른다. 의도된 것 (20260728 결정). 유지.
--    · stadium_bricks_today      — /stadium 페이지의 공개 집계. 유지.
--    · enqueue_temp_on_post_vote — 트리거 함수. 사람이 직접 부를 이유가 없다. PUBLIC·anon 실행 회수.
--      (⚠️ REVOKE FROM anon 만으로는 no-op — 권한이 PUBLIC(=X) 에 붙어 있다. 메모 gotchas_supabase_verification)
-- ③ RLS initplan 잔여 — current_setting('request.jwt.claims') 를 행마다 부르는 정책 7개를 (select …) 로 감싼다.

-- ① search_path
alter function public.admin_adjust_gold(text,integer,text) set search_path = public;
alter function public.admin_adjust_tokens(text,integer,text) set search_path = public;
alter function public.buy_avatar_kit(text,uuid,text) set search_path = public;
alter function public.buy_stadium_bricks(text,uuid,integer) set search_path = public;
alter function public.calculate_post_temperature(uuid) set search_path = public;
alter function public.cleanup_temperature_queue(integer) set search_path = public;
alter function public.deduct_board_points(text,text,integer) set search_path = public;
alter function public.enqueue_temperature_update(uuid) set search_path = public;
alter function public.ensure_daily_token_reset(text) set search_path = public;
alter function public.expire_stale_pending_predictions() set search_path = public;
alter function public.get_level_for_points(integer) set search_path = public;
alter function public.get_recent_commented_posts(integer,text) set search_path = public;
alter function public.news_reservoir_set_updated_at() set search_path = public;
alter function public.process_temperature_queue(integer) set search_path = public;
alter function public.recalc_comment_vote_count() set search_path = public;
alter function public.recalc_post_vote_count() set search_path = public;
alter function public.reset_user_daily_tokens(text) set search_path = public;
alter function public.trg_comments_flair_score() set search_path = public;
alter function public.trg_posts_flair_score() set search_path = public;
alter function public.trg_votes_flair_score() set search_path = public;
alter function public.trigger_on_post_created() set search_path = public;
alter function public.update_active_post_temperatures() set search_path = public;
alter function public.update_temperature_score(uuid) set search_path = public;
alter function public.update_user_content_counts() set search_path = public;
alter function public.update_user_temperature(text) set search_path = public;

-- ② 트리거 함수의 anon 실행 회수
revoke execute on function public.enqueue_temp_on_post_vote() from public, anon;

-- ③ RLS initplan (current_setting)
do $$
declare
  r record;
  q text;
  w text;
  stmt text;
begin
  for r in
    select schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and regexp_replace(
            coalesce(qual, '') || ' ' || coalesce(with_check, ''),
            '\( ?SELECT \(?current_setting\(', '', 'gi'
          ) ~ 'current_setting\('
  loop
    q := regexp_replace(r.qual, 'current_setting\(([^)]*)\)', '(select current_setting(\1))', 'g');
    w := regexp_replace(r.with_check, 'current_setting\(([^)]*)\)', '(select current_setting(\1))', 'g');

    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    stmt := format(
      'create policy %I on %I.%I as %s for %s to %s',
      r.policyname, r.schemaname, r.tablename, r.permissive, r.cmd, array_to_string(r.roles, ', ')
    );
    if q is not null then stmt := stmt || format(' using (%s)', q); end if;
    if w is not null then stmt := stmt || format(' with check (%s)', w); end if;
    execute stmt;
  end loop;
end $$;
