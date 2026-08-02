-- 콘텐츠 소비를 "유저 단위"로 측정한다 (언론사 계약 협상 지표)
--
-- 배경: post_views 가 ip_hash 만 기록해 **누가** 읽었는지 알 수 없었다. 그래서
--   · 유입 코호트(유튜버 채널별)가 콘텐츠까지 소비하는지
--   · 기사를 읽은 사람이 다음 주에 또 오는지 (재방문)
-- 를 못 본다. 언론사가 협상에서 볼 지표가 정확히 이것들이다.
--
-- ⚠️ 개막 이벤트(8/22~9/20) 4주치 데이터는 **소급이 불가능**하다. 이벤트 전에 켜야 한다.
--
-- ⚠️ 함수 시그니처가 바뀌므로 DROP → CREATE 다. DROP 하면 GRANT 가 같이 날아가므로
--    20260728_revoke_anon_execute_security_definer 가 정리한 권한 상태를 그대로 재현한다:
--      · anon 직접 부여 **유지** — /api/posts/[id]/view 가 anon 클라이언트로 호출한다
--      · PUBLIC 은 회수 — 20260728 의 목표 상태 (PUBLIC 을 두면 anon 이 상속으로 다시 열린다)

alter table public.post_views
  add column if not exists user_id text;

comment on column public.post_views.user_id is
  'Clerk user id. 비로그인 조회는 NULL — 그 경우 ip_hash 로만 집계된다.';

-- 유저 단위 소비·재방문 집계용 (부분 인덱스 — 비로그인 행이 대다수라 제외)
create index if not exists post_views_user_id_viewed_at_idx
  on public.post_views (user_id, viewed_at desc)
  where user_id is not null;

drop function if exists public.increment_post_view_count(uuid, text);

create function public.increment_post_view_count(
  post_id_param uuid,
  ip_address_param text,
  user_id_param text default null
) returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  can_increment boolean;
begin
  -- 1시간 IP 제한은 그대로 (can_increment_view_count 는 SECURITY DEFINER 컨텍스트라
  -- anon 에 EXECUTE 가 없어도 동작한다)
  select can_increment_view_count(post_id_param, ip_address_param) into can_increment;

  if not can_increment then
    return false;
  end if;

  insert into post_views (post_id, ip_hash, user_id, viewed_at)
  values (post_id_param, ip_address_param, user_id_param, now());

  update posts
  set view_count = coalesce(view_count, 0) + 1
  where id = post_id_param;

  return true;
end;
$$;

alter function public.increment_post_view_count(uuid, text, text) owner to postgres;

revoke all on function public.increment_post_view_count(uuid, text, text) from public;
grant execute on function public.increment_post_view_count(uuid, text, text) to anon;
grant execute on function public.increment_post_view_count(uuid, text, text) to authenticated;
grant execute on function public.increment_post_view_count(uuid, text, text) to service_role;
