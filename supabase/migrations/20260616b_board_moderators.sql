-- 20260616b_board_moderators.sql
--
-- 게시판별 모더레이터(MOD): (user_id, community_slug) 매핑.
-- MOD 는 담당 게시판에 공지(is_notice) 글을 올릴 수 있다.
-- 부여/회수는 관리자 API(service role)만. 읽기는 본인 행만(자기가 어느 게시판 MOD인지 확인용).
--
-- 참고: 글 작성은 서비스 롤 API(/api/posts, /api/communities/[slug]/notice) 경유라
--   실질 권한 enforcement 는 API 코드 게이트. 이 테이블은 그 게이트의 데이터 소스.

create table if not exists public.board_moderators (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  community_slug text not null,
  granted_by text not null,
  granted_at timestamptz not null default now(),
  unique (user_id, community_slug)
);

create index if not exists board_moderators_slug_idx on public.board_moderators (community_slug);
create index if not exists board_moderators_user_idx on public.board_moderators (user_id);

alter table public.board_moderators enable row level security;

-- 본인 MOD 행만 읽기. 부여/회수/타인 조회는 service role(관리자 API).
drop policy if exists "board_moderators_select_own" on public.board_moderators;
create policy "board_moderators_select_own" on public.board_moderators
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

-- insert/update/delete: 정책 없음 → service role 만.

-- (선택, 방어심화) 직접 DB 접근에서도 board MOD 가 is_notice 를 쓰게 하려면 posts INSERT/UPDATE
--   RLS 의 is_notice 조건에 board_moderators 체크를 OR 로 추가. 현재는 service-role API 게이트로
--   충분하므로 보류. 롤백: drop table public.board_moderators cascade;
