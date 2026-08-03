-- 기사 ↔ 사가 연결 원장 (2026-08-03 오너: "떡밥에서 클릭하면 게시물이 아니라
-- 그 위키로 가길 바랐다") — 발행 시 linkArticleToSaga 가 채우고, 떡밥 피드가
-- 카드 링크를 /saga/[slug] 로 바꾸는 데 쓴다.
--
-- posts 에 컬럼을 더하지 않고 별도 테이블인 이유: 사가 격리 원칙 (메타버스 선례 —
-- 기존 테이블 확장은 최후 수단). post 1 : saga 1 (기사 하나는 한 사가에만 속한다).

create table if not exists public.saga_article_links (
  post_id    uuid primary key references public.posts(id) on delete cascade,
  saga_id    uuid not null references public.sagas(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists saga_article_links_saga_idx on public.saga_article_links (saga_id);

alter table public.saga_article_links enable row level security;
drop policy if exists "saga_article_links_public_read" on public.saga_article_links;
create policy "saga_article_links_public_read" on public.saga_article_links
  for select using (true);
