-- 불변식 감사 원장 (2026-08-08) — /api/cron/invariant-audit 가 발견한 시스템 불변식
-- 위반을 fingerprint 단위로 기록한다. 알림은 신규(open 전이) 시 1회만 — 같은 위반을
-- 매 회차 재알림하면 ops 채널이 죽는다 (뉴스 원장 601건 재기록 실사고의 교훈).
-- RLS enabled + no policies = service_role 전용 (crawler_run_log 패턴).

create table if not exists invariant_findings (
  id bigint generated always as identity primary key,
  invariant text not null,
  fingerprint text not null unique,
  detail jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  alerted_at timestamptz
);

alter table invariant_findings enable row level security;

create index if not exists idx_invariant_findings_status
  on invariant_findings (status, invariant);

comment on table invariant_findings is
  '불변식 감사 원장 — invariant-audit cron 이 발견/해소를 기록. 알림은 open 전이 시 1회만.';
