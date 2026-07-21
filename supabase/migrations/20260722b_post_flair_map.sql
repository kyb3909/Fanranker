-- 게시글 다중 말머리 조인 테이블.
-- posts.flair_id(단일, 대표 말머리)는 그대로 유지 — 기존 피드 필터/작성폼/팬점수 트리거가
-- 이 컬럼을 전제로 동작하므로 건드리지 않는다. post_flair_map 은 "추가" 말머리를 담아
-- 봇 뉴스의 [이적]+[아스날] 같은 다중 표시를 지원한다.
-- 현재는 봇 발행(service role)만 여기 쓰고, 유저 글 다중은 추후.

create table if not exists post_flair_map (
  post_id uuid not null references posts(id) on delete cascade,
  flair_id uuid not null references post_flairs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, flair_id)
);

create index if not exists idx_post_flair_map_post on post_flair_map(post_id);

alter table post_flair_map enable row level security;

-- 읽기 공개 (피드 표시). 쓰기는 service role 만(RLS 우회) — 봇 발행 경로.
drop policy if exists "post_flair_map public read" on post_flair_map;
create policy "post_flair_map public read" on post_flair_map for select using (true);
