-- 독자 오류 제보 큐 (2026-08-07 운영자: "기사 잘못됐다는 댓글이 달리면 자동
-- 수정되는 거야. 물론 검수 거친 다음에 — 구라일 수도 있거든")
--
-- 봇 기사 댓글에서 "기사가 틀렸다"는 구체적 지적을 cron 이 자동 감지해 적재한다.
-- 자동 수정은 하지 않는다: 제보 자체가 틀릴 수 있으므로 확정은 사람.
-- 검수자가 "발행된 것 고치기"에서 제보를 수정 사유로 채워 고치면
-- 표기/사실 분리 학습(learn-corrections)으로 이어진다.
create table if not exists public.news_error_reports (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.posts(id) on delete cascade,
  comment_id      uuid not null unique references public.comments(id) on delete cascade,
  comment_user_id text,
  comment_text    text not null,
  -- LLM 요약: 무엇이 틀렸다는 주장인가 (판정 근거 표시용 한 줄 — 사실 확정 아님)
  claim           text not null,
  status          text not null default 'pending'
    check (status in ('pending', 'accepted', 'dismissed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists news_error_reports_status_idx
  on public.news_error_reports (status, created_at desc);
create index if not exists news_error_reports_post_idx
  on public.news_error_reports (post_id);

-- service role 전용 (admin API 경유) — 정책 없음 = anon/authenticated 접근 불가
alter table public.news_error_reports enable row level security;
