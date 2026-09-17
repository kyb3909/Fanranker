-- 떡밥 글 세 줄 요약 (2026-09-18 운영자: "오늘의 떡밥 기사들을 3줄 요약 형식으로, 출처, 무슨 내용인지.
-- 인터뷰라면 무슨 얘기를 했는지만 … 모달로 뜨게 하고, 거기 다는 댓글들이 그대로 게시판에도").
--
-- 글 하나에 요약 한 벌. 본문 해시를 같이 두어 글이 수정되면 다시 만든다.
-- 댓글은 여기 없다 — 모달 댓글은 posts 의 comments 그대로다 (그림자 스레드 금지).
create table if not exists public.post_summaries (
  post_id uuid primary key references public.posts(id) on delete cascade,
  lines text[] not null check (array_length(lines, 1) between 2 and 3), -- 20260918100000 에서 2~6 으로 완화
  kind text not null check (kind in ('news', 'interview')),
  source_name text,
  model text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.post_summaries enable row level security;
-- 서비스 롤만 읽고 쓴다. 공개 읽기는 티커 API 가 service role 로 대신한다.
revoke all on public.post_summaries from public, anon, authenticated;
grant all on public.post_summaries to service_role;
