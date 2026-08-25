-- OpenAI 사용량 계기판 (2026-08-25)
--
-- 호출부가 22곳인데 사용량을 남기는 곳은 뉴스 데스크 하나뿐이었다. 운영자가
-- "오늘 OpenAI 를 얼마나 썼나" 물었을 때 답을 못 했다 — 기록이 없으니까.
-- 어제 겪은 LFA 크레딧 화재와 같은 구조: 계기판이 없으면 새는 걸 모른다.
create table if not exists llm_usage_log (
  id bigint generated always as identity primary key,
  called_at timestamptz not null default now(),
  task text not null,
  model text not null,
  input_tokens integer,
  cached_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(10, 6),
  ok boolean not null default true,
  latency_ms integer
);

create index if not exists idx_llm_usage_called on llm_usage_log (called_at desc);
create index if not exists idx_llm_usage_task on llm_usage_log (task, called_at desc);

alter table llm_usage_log enable row level security;
revoke all on llm_usage_log from anon, authenticated;
