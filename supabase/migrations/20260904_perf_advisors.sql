-- 성능 권고 정리 (2026-09-04, Supabase advisors 실측 기준)
--
-- ① 중복 인덱스 5쌍 — 정의가 글자까지 같은 인덱스가 base schema 에 두 벌씩 있었다. 쓰기마다
--    두 번 갱신하고 이득은 0. 한 벌씩 지운다 (남긴 쪽 이름은 주석).
-- ② FK 미인덱스 — 행 500 이상인 테이블만 (작은 테이블은 인덱스가 오히려 비용).
-- ③ RLS initplan — 정책 38개가 auth.uid()/auth.jwt()/auth.role() 을 **행마다** 부른다.
--    (select auth.x()) 로 감싸면 쿼리당 1회로 줄어든다. 표현식은 그대로 두고 감싸기만
--    한다 — 정책 의미는 변하지 않는다. 이미 감싼 정책(posts·comments 등)은 대상이 아니다.
--    ⚠️ 이 정책들 중 auth.uid() 를 쓰는 관리자 정책은 Clerk JWT(sub 가 UUID 아님) 아래서
--    사실상 항상 거부다 — 관리자 작업은 service role 로 돈다. 여기서는 성능만 다루고,
--    의미 정리는 별도 항목(보안 권고)으로 남긴다.

-- ① 중복 인덱스
drop index if exists public.idx_comments_post_id_active;          -- 남김: idx_comments_post_created
drop index if exists public.idx_notifications_user_unread;        -- 남김: idx_notifications_user_read
drop index if exists public.idx_posts_community_date;             -- 남김: idx_posts_community_created
drop index if exists public.idx_posts_temperature;                -- 남김: idx_posts_temp_created
-- 둘 다 UNIQUE 제약이 뒤에 있어 인덱스가 아니라 제약을 지운다. 남김: prediction_purchases_buyer_id_activity_id_key
alter table public.prediction_purchases drop constraint if exists uq_prediction_purchases_buyer_activity;

-- ② FK 인덱스 (행 500+ 테이블)
create index if not exists idx_posts_flair_id on public.posts (flair_id);
create index if not exists idx_post_flair_map_flair_id on public.post_flair_map (flair_id);
create index if not exists idx_prediction_slips_daily_round_id on public.prediction_slips (daily_round_id);
create index if not exists idx_match_mapping_attempts_home_team_id on public.match_mapping_attempts (home_team_id);
create index if not exists idx_match_mapping_attempts_away_team_id on public.match_mapping_attempts (away_team_id);
create index if not exists idx_seeded_reddit_posts_post_id on public.seeded_reddit_posts (post_id);
create index if not exists idx_profiles_equipped_pixel_art_id on public.profiles (equipped_pixel_art_id);
create index if not exists idx_profiles_display_title_id on public.profiles (display_title_id);

-- ③ RLS initplan — 맨 auth.* 호출을 (select auth.*()) 로 감싸 재생성
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
            '\( ?SELECT \(?auth\.(jwt|uid|role)\(\)', '', 'gi'
          ) ~ 'auth\.(jwt|uid|role)\(\)'
  loop
    q := regexp_replace(r.qual, 'auth\.(jwt|uid|role)\(\)', '(select auth.\1())', 'g');
    w := regexp_replace(r.with_check, 'auth\.(jwt|uid|role)\(\)', '(select auth.\1())', 'g');

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
